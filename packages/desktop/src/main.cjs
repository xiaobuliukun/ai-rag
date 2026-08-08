const { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const {
  createLocalCorsOrigins,
  createServerEnvironment,
  createWebEnvironment,
  findStandaloneServer,
  loadOrCreateDesktopSecret,
  parsePort,
} = require("./runtime.cjs");

const WEB_PORT = parsePort(process.env.MOXU_WEB_PORT, 3000, "MOXU_WEB_PORT");
const API_PORT = parsePort(process.env.MOXU_API_PORT, 3001, "MOXU_API_PORT");
const HOST = "127.0.0.1";
const WEB_URL = `http://${HOST}:${WEB_PORT}`;
const API_BASE_URL = `http://${HOST}:${API_PORT}/api`;

let mainWindow;
let tray;
let serverProcess;
let webProcess;
let isQuitting = false;
let servicesReady = false;

app.setName("墨序");
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

app.whenReady().then(async () => {
  configureAutoUpdater();
  await startServices();
  createTray();
  createWindow();
  void loadWhenReady();
  void checkForUpdatesIfConfigured();
}).catch(handleStartupFailure);

app.on("before-quit", () => {
  isQuitting = true;
  stopServices();
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
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [`--moxu-api-base-url=${API_BASE_URL}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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
    void shell.openExternal(url);
    return { action: "deny" };
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
  if (WEB_PORT === API_PORT) {
    throw new Error("MOXU_WEB_PORT and MOXU_API_PORT must use different ports.");
  }
  await Promise.all([
    assertPortAvailable(WEB_PORT, "Web"),
    assertPortAvailable(API_PORT, "API"),
  ]);

  const serverCommand = getServerCommand();

  if (app.isPackaged) {
    await migrateDatabase(serverCommand.env);
  }

  serverProcess = startProcess("server", serverCommand);
  webProcess = startProcess("web", getWebCommand());

  try {
    await Promise.all([
      waitForHttpService(
        "API",
        serverProcess,
        API_BASE_URL + "/health",
        45_000,
        async (response) =>
          response.ok && (await response.json())?.status === "ok",
      ),
      waitForHttpService(
        "Web",
        webProcess,
        WEB_URL,
        45_000,
        async (response) => response.ok,
      ),
    ]);
    servicesReady = true;
  } catch (error) {
    stopServices();
    throw error;
  }
}

function startProcess(name, command) {
  const child = spawn(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: "pipe",
    shell: !app.isPackaged && process.platform === "win32",
  });

  child.stdout.on("data", (chunk) => console.log(`[${name}] ${chunk}`.trimEnd()));
  child.stderr.on("data", (chunk) => console.error(`[${name}] ${chunk}`.trimEnd()));
  child.on("error", (error) => {
    child.moxuStartupError = error;
    if (!isQuitting && servicesReady) {
      console.error(`[${name}] failed to start`, error);
      showServiceError(name, undefined, error.message);
    }
  });
  child.on("exit", (code, signal) => {
    if (isQuitting) {
      return;
    }
    console.error(`[${name}] exited ${signal || code}`);
    if (servicesReady) {
      showServiceError(name, code, signal);
    }
  });
  return child;
}

function getServerCommand() {
  if (!app.isPackaged) {
    return {
      command: "npm",
      args: ["run", "dev:server"],
      cwd: projectRoot(),
      env: developmentServerEnvironment(),
    };
  }

  const userDataPath = app.getPath("userData");
  const configuredSecret = process.env.AI_CONFIG_SECRET?.trim();

  return nodeCommand(path.join(appRoot(), "packages/server/dist/src/main.js"), [], {
    cwd: appRoot(),
    env: createServerEnvironment({
      baseEnvironment: process.env,
      host: HOST,
      apiPort: API_PORT,
      webPort: WEB_PORT,
      userDataPath,
      aiConfigSecret:
        configuredSecret || loadOrCreateDesktopSecret(userDataPath),
    }),
  });
}

function getWebCommand() {
  if (!app.isPackaged) {
    return {
      command: "npm",
      args: ["run", "dev:web"],
      cwd: projectRoot(),
      env: developmentWebEnvironment(),
    };
  }

  const standaloneEntry = findStandaloneServer(appRoot());
  return nodeCommand(standaloneEntry, [], {
    cwd: path.dirname(standaloneEntry),
    env: createWebEnvironment({
      baseEnvironment: process.env,
      host: HOST,
      webPort: WEB_PORT,
      apiPort: API_PORT,
    }),
  });
}

async function migrateDatabase(serverEnvironment) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });

  const migrationCommand = nodeCommand(
    path.join(appRoot(), "node_modules/prisma/build/index.js"),
    [
      "migrate",
      "deploy",
      "--config",
      path.join(appRoot(), "packages/server/prisma.config.ts"),
      "--schema",
      path.join(appRoot(), "packages/server/prisma/schema.prisma"),
    ],
    {
      cwd: path.join(appRoot(), "packages/server"),
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
    cwd: options.cwd || appRoot(),
    env: {
      ...options.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  };
}

function developmentServerEnvironment() {
  return {
    ...process.env,
    HOST,
    PORT: String(API_PORT),
    NEXT_TELEMETRY_DISABLED: "1",
    ALLOW_REMOTE_API: "false",
    CORS_ORIGINS:
      process.env.CORS_ORIGINS ||
      process.env.CORS_ORIGIN ||
      createLocalCorsOrigins(HOST, WEB_PORT),
  };
}

function developmentWebEnvironment() {
  return {
    ...process.env,
    HOST,
    HOSTNAME: HOST,
    PORT: String(WEB_PORT),
    MOXU_API_HOST: HOST,
    MOXU_API_PORT: String(API_PORT),
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_API_BASE_URL: API_BASE_URL,
  };
}

async function loadWhenReady() {
  if (!mainWindow) {
    return;
  }

  await mainWindow.loadURL(WEB_URL);
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

function stopServices() {
  for (const child of [serverProcess, webProcess]) {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  }
}

function assertPortAvailable(port, name) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", (error) => {
      const detail =
        error && error.code === "EADDRINUSE"
          ? name + " port " + port + " is already in use."
          : "Unable to reserve " + name + " port " + port + ": " + error.message;
      reject(new Error(detail));
    });
    probe.listen({ host: HOST, port, exclusive: true }, () => {
      probe.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });
}

async function waitForHttpService(
  name,
  child,
  url,
  timeoutMs,
  validateResponse,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    if (child.moxuStartupError) {
      throw new Error(
        name + " service failed to start: " + child.moxuStartupError.message,
      );
    }
    if (child.exitCode !== null || child.signalCode) {
      throw new Error(
        name +
          " service exited before it became ready (" +
          (child.signalCode || child.exitCode) +
          ").",
      );
    }

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      });
      if (await validateResponse(response)) {
        return;
      }
    } catch {
      // The process can accept TCP before its HTTP routes are ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error("Timed out waiting for " + name + " service at " + url + ".");
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  if (process.env.UPDATE_URL) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: process.env.UPDATE_URL,
    });
  }
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
  if (!process.env.UPDATE_URL || !app.isPackaged) {
    return;
  }

  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    console.error("[updater] check failed", error);
  }
}

async function checkForUpdatesManually() {
  if (!process.env.UPDATE_URL) {
    await dialog.showMessageBox({
      type: "info",
      message: "尚未配置更新地址",
      detail: "设置 UPDATE_URL 后，打包版本会使用通用更新源检查新版本。",
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

function showServiceError(name, code, signal) {
  const options = {
    type: "error",
    message: "墨序服务已退出",
    detail: `${name} exited with ${signal || code}. Please restart the app.`,
  };

  void (mainWindow
    ? dialog.showMessageBox(mainWindow, options)
    : dialog.showMessageBox(options));
}

async function handleStartupFailure(error) {
  isQuitting = true;
  stopServices();
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

function appRoot() {
  if (!app.isPackaged) {
    return projectRoot();
  }

  return path.join(process.resourcesPath, "runtime");
}

process.on("uncaughtException", (error) => {
  console.error("[desktop] uncaught exception", error);
});
