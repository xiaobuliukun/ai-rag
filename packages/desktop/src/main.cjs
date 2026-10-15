const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  shell,
  dialog,
  session,
  ipcMain,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { fork, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { HttpServerProcess } = require("./http-server-process.cjs");
const {
  configureSessionPermissions,
  createDesktopServerEnvironment,
  createSecureWebPreferences,
  readDesktopImageSelection,
  isAllowedAppNavigation,
  loadOrCreateDesktopSecret,
  normalizeExternalUrl,
  resolveUpdateConfiguration,
  resolveUserDataPath,
} = require("./runtime.cjs");

const API_BASE_URL_CHANNEL = "moxu:api-base-url";
const SELECT_DIRECTORY_CHANNEL = "moxu:select-directory";
const SAVE_BACKUP_CHANNEL = "moxu:save-backup";
const CHOOSE_BACKUP_CHANNEL = "moxu:choose-backup";
const CHOOSE_IMAGE_CHANNEL = "moxu:choose-image";
const CONFIRM_CHANNEL = "moxu:confirm";
let mainWindow;
let tray;
let serverProcess;
let isQuitting = false;
let servicesStopped = false;
let servicesReady = false;
let ipcRegistered = false;
let updateConfiguration = {
  enabled: false,
  source: "uninitialized",
};
let updateConfigurationError;
let serviceErrorDialogOpen = false;
let serviceRestartInProgress = false;

app.setName("墨序");
const configuredUserDataPath = resolveUserDataPath({
  baseEnvironment: process.env,
  projectRoot: projectRoot(),
  isPackaged: app.isPackaged,
});
if (configuredUserDataPath) {
  app.setPath("userData", path.resolve(configuredUserDataPath));
}
app.setLoginItemSettings({
  openAtLogin: process.env.MOXU_OPEN_AT_LOGIN === "true",
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  showMainWindow();
});

app.whenReady()
  .then(async () => {
    configureSessionPermissions(session.defaultSession);
    configureAutoUpdater();
    registerIpcHandlers();
    await startServices();
    if (isQuitting) return;
    createTray();
    createWindow();
    void loadWhenReady();
    void checkForUpdatesIfConfigured();
  })
  .catch(handleStartupFailure);

app.on("before-quit", (event) => {
  if (servicesStopped) return;
  event.preventDefault();
  if (isQuitting) return;
  isQuitting = true;
  void stopServices().finally(() => {
    servicesStopped = true;
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  showMainWindow();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 920,
    minHeight: 620,
    title: "墨序",
    backgroundColor: "#f1ece4",
    show: false,
    webPreferences: createSecureWebPreferences({
      preloadPath: path.join(__dirname, "preload.cjs"),
    }),
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting || process.platform !== "darwin") {
      return;
    }
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, legacyUrl) => {
    const targetUrl = event.url || legacyUrl;
    if (isAllowedAppNavigation(targetUrl, rendererEntryUrl())) {
      return;
    }

    event.preventDefault();
    openExternalUrl(targetUrl);
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "墨序",
        submenu: [
          { label: "显示墨序", click: showMainWindow },
          { label: "检查更新", click: checkForUpdatesManually },
          { type: "separator" },
          { role: "quit", label: "退出" },
        ],
      },
      {
        label: "编辑",
        submenu: [
          { role: "undo", label: "撤销" },
          { role: "redo", label: "重做" },
          { type: "separator" },
          { role: "cut", label: "剪切" },
          { role: "copy", label: "复制" },
          { role: "paste", label: "粘贴" },
          { role: "selectAll", label: "全选" },
        ],
      },
      {
        label: "视图",
        submenu: [
          { role: "reload", label: "重新载入" },
          { role: "toggleDevTools", label: "开发者工具" },
          { type: "separator" },
          { role: "resetZoom", label: "实际大小" },
          { role: "zoomIn", label: "放大" },
          { role: "zoomOut", label: "缩小" },
          { role: "togglefullscreen", label: "全屏" },
        ],
      },
    ]),
  );
}

function createTray() {
  tray = new Tray(createTrayImage());
  tray.setToolTip("墨序");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开墨序", click: showMainWindow },
      { label: "检查更新", click: checkForUpdatesManually },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]),
  );
  tray.on("click", showMainWindow);
}

function createTrayImage() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#263238"/>
      <path d="M9 8.5h9.5a4.5 4.5 0 0 1 0 9H13v6H9v-15Z" fill="#f6efe4"/>
      <path d="M14 12h4.1a1.2 1.2 0 0 1 0 2.4H14V12Z" fill="#d97842"/>
      <path d="M20.5 21.5 24 24V9" stroke="#f6efe4" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `);
  const image = nativeImage.createFromDataURL(`data:image/svg+xml,${svg}`);
  image.setTemplateImage(process.platform === "darwin");
  return image;
}

async function startServices() {
  const userDataPath = app.getPath("userData");
  fs.mkdirSync(userDataPath, { recursive: true });
  const configuredSecret = process.env.AI_CONFIG_SECRET?.trim();
  const serverEnvironment = createDesktopServerEnvironment({
    baseEnvironment: process.env,
    userDataPath,
    aiConfigSecret:
      configuredSecret || loadOrCreateDesktopSecret(userDataPath),
  });

  await migrateDatabase(serverEnvironment);
  if (isQuitting) return;

  const server = new HttpServerProcess({
    fork,
    modulePath: serverEntryPath(),
    cwd: desktopRuntimeRoot(),
    env: serverEnvironment,
    host: serverEnvironment.HOST,
    port: Number(serverEnvironment.PORT),
  });
  serverProcess = server;
  const ready = server.start();
  attachServerLifecycle(server);
  await ready;
  if (isQuitting) return;
  if (!server.ready) throw new Error("Nest API exited during startup");
  servicesReady = true;
}

function attachServerLifecycle(server) {
  server.process?.on("exit", (code, signal) => {
    if (!isQuitting && servicesReady && serverProcess === server) {
      servicesReady = false;
      serverProcess = undefined;
      if (!serviceRestartInProgress) showServiceError("Nest API", code, signal);
    }
  });
  server.process?.on("error", (error) => {
    if (!isQuitting && servicesReady && serverProcess === server) {
      servicesReady = false;
      if (!serviceRestartInProgress) showServiceError("Nest API", undefined, error.message);
    }
  });
}

function registerIpcHandlers() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.on(API_BASE_URL_CHANNEL, (event) => {
    // This synchronous call is made by the preload before the document has
    // finished navigating, so the frame URL may still be about:blank. The
    // sender identity and main-frame check are sufficient here; the channel
    // only returns the loopback URL selected for this window.
    assertTrustedRendererSender(event);
    event.returnValue = serverProcess?.baseUrl || "";
  });

  ipcMain.handle(SELECT_DIRECTORY_CHANNEL, async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  ipcMain.handle(SAVE_BACKUP_CHANNEL, async (event, value) => {
    assertTrustedRenderer(event);
    if (!value || typeof value !== "object") {
      throw new TypeError("Backup payload is required");
    }
    const filename =
      typeof value.filename === "string" && value.filename.trim()
        ? value.filename.trim()
        : "moxu-backup.json";
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    fs.writeFileSync(
      result.filePath,
      JSON.stringify(value.payload ?? value, null, 2) + "\n",
      "utf8",
    );
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle(CHOOSE_BACKUP_CHANNEL, async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return JSON.parse(fs.readFileSync(result.filePaths[0], "utf8"));
  });

  ipcMain.handle(CHOOSE_IMAGE_CHANNEL, async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"],
        },
      ],
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;

    return readDesktopImageSelection(filePath);
  });

  ipcMain.handle(CONFIRM_CHANNEL, async (event, message) => {
    assertTrustedRenderer(event);
    const result = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["取消", "确定"],
      defaultId: 1,
      cancelId: 0,
      message: String(message ?? ""),
    });
    return result.response === 1;
  });
}

function assertTrustedRenderer(event) {
  assertTrustedRendererSender(event);
  const sender = event.sender;
  const senderUrl = event.senderFrame?.url || sender.getURL?.();
  if (!senderUrl || !isAllowedAppNavigation(senderUrl, rendererEntryUrl())) {
    throw new Error("Untrusted renderer URL");
  }
}

function assertTrustedRendererSender(event) {
  const sender = event?.sender;
  if (!mainWindow || !sender || sender !== mainWindow.webContents) {
    throw new Error("Untrusted renderer sender");
  }
  if (
    event.senderFrame &&
    mainWindow.webContents.mainFrame &&
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error("Untrusted renderer frame");
  }
}

async function migrateDatabase(serverEnvironment) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });

  const migrationCommand = nodeCommand(
    path.join(desktopRuntimeRoot(), "node_modules/prisma/build/index.js"),
    [
      "migrate",
      "deploy",
      "--config",
      path.join(desktopRuntimeRoot(), "packages/server/prisma.config.ts"),
      "--schema",
      path.join(desktopRuntimeRoot(), "packages/server/prisma/schema.prisma"),
    ],
    {
      cwd: path.join(desktopRuntimeRoot(), "packages/server"),
      env: {
        ...serverEnvironment,
        // Prisma 7.5's SQLite schema engine can exit before returning its first
        // response unless its logger is initialized. Keep the scope limited to
        // the one-shot migration process.
        RUST_LOG: serverEnvironment.RUST_LOG
          ? `${serverEnvironment.RUST_LOG},schema_engine=info`
          : "schema_engine=info",
      },
    },
  );

  await runOneShotProcess("database migration", migrationCommand);
}

function runOneShotProcess(name, command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: "pipe",
      shell: false,
    });
    let output = "";
    let settled = false;

    const appendOutput = (chunk, log) => {
      const text = String(chunk);
      output = `${output}${text}`.slice(-12_000);
      log(`[${name}] ${text}`.trimEnd());
    };

    child.stdout.on("data", (chunk) => appendOutput(chunk, console.log));
    child.stderr.on("data", (chunk) => appendOutput(chunk, console.error));
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Unable to start ${name}: ${error.message}`));
      }
    });
    child.on("exit", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;

      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(
        new Error(
          `Database migration failed (${reason}). The application was not started.` +
            (output.trim() ? `\n\n${output.trim()}` : ""),
        ),
      );
    });
  });
}

function nodeCommand(script, args = [], options = {}) {
  return {
    command: process.execPath,
    args: [script, ...args],
    cwd: options.cwd || desktopRuntimeRoot(),
    env: {
      ...options.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  };
}

async function loadWhenReady() {
  if (!mainWindow) {
    return;
  }

  await mainWindow.loadFile(rendererEntryPath());
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    void loadWhenReady();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

async function stopServices() {
  servicesReady = false;
  const server = serverProcess;
  serverProcess = undefined;
  if (server) {
    await server.shutdown().catch(() => server.kill());
  }
}

async function restartServices() {
  if (isQuitting || serviceRestartInProgress) {
    return;
  }

  serviceRestartInProgress = true;
  const previousServer = serverProcess;
  serverProcess = undefined;
  servicesReady = false;

  try {
    if (previousServer) {
      await previousServer.shutdown();
    }
    if (isQuitting) return;
    await startServices();
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      // loadURL with the same file/hash can be a same-document navigation.
      // A full reload is required to rerun preload with the new Nest port.
      await reloadRenderer(mainWindow.webContents);
    }
    if (!isQuitting && (!servicesReady || !serverProcess?.ready)) {
      throw new Error("Nest API exited while restoring the window");
    }
  } catch (error) {
    if (isQuitting) return;
    console.error("[desktop] service restart failed", error);
    const options = {
      type: "error",
      message: "墨序服务重启失败",
      detail: error instanceof Error ? error.message : String(error),
    };
    try {
      await (mainWindow
        ? dialog.showMessageBox(mainWindow, options)
        : dialog.showMessageBox(options));
    } finally {
      app.quit();
    }
  } finally {
    serviceRestartInProgress = false;
  }
}

function reloadRenderer(contents) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      contents.removeListener("did-finish-load", loaded);
      contents.removeListener("did-fail-load", failed);
      contents.removeListener("destroyed", destroyed);
    };
    const loaded = () => { cleanup(); resolve(); };
    const failed = (_event, code, description, _url, isMainFrame) => {
      if (!isMainFrame) return;
      cleanup();
      reject(new Error(`Renderer reload failed (${code}): ${description}`));
    };
    const destroyed = () => { cleanup(); resolve(); };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Renderer reload timed out"));
    }, 30_000);
    contents.once("did-finish-load", loaded);
    contents.on("did-fail-load", failed);
    contents.once("destroyed", destroyed);
    contents.reload();
  });
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.disableWebInstaller = true;

  try {
    updateConfiguration = resolveUpdateConfiguration({
      isPackaged: app.isPackaged,
      baseEnvironment: process.env,
      resourcesPath: process.resourcesPath,
    });
    updateConfigurationError = undefined;

    if (updateConfiguration.feed) {
      autoUpdater.setFeedURL(updateConfiguration.feed);
    } else if (updateConfiguration.channel) {
      autoUpdater.channel = updateConfiguration.channel;
      autoUpdater.allowDowngrade = false;
    }
  } catch (error) {
    updateConfiguration = {
      enabled: false,
      source: "invalid",
    };
    updateConfigurationError =
      error instanceof Error ? error.message : String(error);
    console.error("[updater] configuration rejected", updateConfigurationError);
  }

  autoUpdater.on("error", (error) => {
    console.error("[updater] error", error);
  });
  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox({
        type: "info",
        buttons: ["现在重启", "稍后"],
        defaultId: 0,
        cancelId: 1,
        message: "墨序更新已下载",
        detail: "重启应用后将使用新版本。",
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      })
      .catch(() => undefined);
  });
}

async function checkForUpdatesIfConfigured() {
  if (!updateConfiguration.enabled || !app.isPackaged) {
    return;
  }

  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    console.error("[updater] check failed", error);
  }
}

async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    await dialog.showMessageBox({
      type: "info",
      message: "开发模式不检查更新",
      detail: "自动更新仅在打包版本中启用。",
    });
    return;
  }

  if (!updateConfiguration.enabled) {
    await dialog.showMessageBox({
      type: updateConfigurationError ? "error" : "info",
      message: updateConfigurationError
        ? "更新配置无效"
        : "尚未配置更新来源",
      detail:
        updateConfigurationError ||
        "打包时配置 publish metadata，或设置安全的 UPDATE_URL 后即可检查更新。",
    });
    return;
  }

  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      message: "检查更新失败",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function openExternalUrl(url) {
  const externalUrl = normalizeExternalUrl(url);
  if (!externalUrl) {
    console.warn("[desktop] blocked external URL with a disallowed protocol");
    return;
  }

  void shell.openExternal(externalUrl).catch((error) => {
    console.error("[desktop] unable to open external URL", error);
  });
}

function showServiceError(name, code, signal) {
  if (serviceErrorDialogOpen || isQuitting) {
    return;
  }

  serviceErrorDialogOpen = true;
  const options = {
    type: "error",
    message: "墨序服务已退出",
    detail: `${name} 已停止（${signal || `退出码 ${code ?? "未知"}`}）。重启服务后将刷新当前页面，尚未保存的编辑需要重新填写。`,
    buttons: ["重启服务", "退出应用"],
    defaultId: 0,
    cancelId: 1,
  };

  void (mainWindow
    ? dialog.showMessageBox(mainWindow, options)
    : dialog.showMessageBox(options))
    .then(({ response }) => {
      serviceErrorDialogOpen = false;
      if (response === 0) {
        return restartServices();
      }
      app.quit();
    })
    .catch(() => app.quit())
    .finally(() => {
      serviceErrorDialogOpen = false;
    });
}

async function handleStartupFailure(error) {
  isQuitting = true;
  await stopServices();
  const detail = error instanceof Error ? error.message : String(error);
  console.error("[desktop] startup failed", error);

  try {
    await dialog.showMessageBox({
      type: "error",
      message: "墨序启动失败",
      detail,
    });
  } finally {
    app.exit(1);
  }
}

function projectRoot() {
  return path.resolve(__dirname, "../../..");
}

function desktopRuntimeRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "runtime");
  }

  return path.join(projectRoot(), ".moxu", "desktop-runtime");
}

function serverEntryPath() {
  return path.join(
    desktopRuntimeRoot(),
    "packages",
    "server",
    "dist",
    "src",
    "main.js",
  );
}

function rendererEntryPath() {
  return path.join(__dirname, "../dist/renderer/index.html");
}

function rendererEntryUrl() {
  return pathToFileURL(rendererEntryPath()).toString();
}

process.on("uncaughtException", (error) => {
  console.error("[desktop] uncaught exception", error);
});
