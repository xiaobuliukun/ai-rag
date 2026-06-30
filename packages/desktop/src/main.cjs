const { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const WEB_PORT = Number(process.env.MOXU_WEB_PORT || 3000);
const API_PORT = Number(process.env.MOXU_API_PORT || 3001);
const HOST = "127.0.0.1";
const WEB_URL = `http://${HOST}:${WEB_PORT}`;

let mainWindow;
let tray;
let serverProcess;
let webProcess;
let isQuitting = false;

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
});

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
  serverProcess = startProcess("server", getServerCommand());
  webProcess = startProcess("web", getWebCommand());

  await Promise.all([
    waitForPort(API_PORT, 45_000),
    waitForPort(WEB_PORT, 45_000),
  ]);
}

function startProcess(name, command) {
  const child = spawn(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  child.stdout.on("data", (chunk) => console.log(`[${name}] ${chunk}`.trimEnd()));
  child.stderr.on("data", (chunk) => console.error(`[${name}] ${chunk}`.trimEnd()));
  child.on("exit", (code, signal) => {
    if (isQuitting) {
      return;
    }
    console.error(`[${name}] exited ${signal || code}`);
    showServiceError(name, code, signal);
  });
  return child;
}

function getServerCommand() {
  if (!app.isPackaged) {
    return {
      command: "npm",
      args: ["run", "dev:server"],
      cwd: projectRoot(),
      env: serviceEnv(),
    };
  }

  return nodeCommand(path.join(appRoot(), "packages/server/dist/src/main.js"), [], {
    cwd: appRoot(),
    env: serviceEnv({
      NODE_ENV: "production",
      DATABASE_URL:
        process.env.DATABASE_URL ||
        `file:${path.join(app.getPath("userData"), "moxu.db")}`,
      SCAN_JOBS_FILE:
        process.env.SCAN_JOBS_FILE ||
        path.join(app.getPath("userData"), "scan-jobs.json"),
    }),
  });
}

function getWebCommand() {
  if (!app.isPackaged) {
    return {
      command: "npm",
      args: ["run", "dev:web"],
      cwd: projectRoot(),
      env: serviceEnv({
        NEXT_PUBLIC_API_BASE_URL: `http://${HOST}:${API_PORT}/api`,
      }),
    };
  }

  const nextBin = path.join(appRoot(), "node_modules/next/dist/bin/next");
  return nodeCommand(nextBin, ["start", "packages/web", "--hostname", HOST, "--port", String(WEB_PORT)], {
    cwd: appRoot(),
    env: serviceEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_API_BASE_URL: `http://${HOST}:${API_PORT}/api`,
    }),
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

function serviceEnv(extra = {}) {
  return {
    ...process.env,
    HOST,
    PORT: String(API_PORT),
    NEXT_TELEMETRY_DISABLED: "1",
    ALLOW_REMOTE_API: "false",
    ...extra,
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

function waitForPort(port, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: HOST, port });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${HOST}:${port}`));
          return;
        }
        setTimeout(attempt, 350);
      });
    };
    attempt();
  });
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
  if (!mainWindow) {
    return;
  }

  void dialog.showMessageBox(mainWindow, {
    type: "error",
    message: "墨序服务已退出",
    detail: `${name} exited with ${signal || code}. Please restart the app.`,
  });
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
