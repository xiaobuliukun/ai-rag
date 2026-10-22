const { contextBridge, ipcRenderer } = require("electron");

const API_BASE_URL_CHANNEL = "moxu:api-base-url";
const SELECT_DIRECTORY_CHANNEL = "moxu:select-directory";
const SAVE_BACKUP_CHANNEL = "moxu:save-backup";
const CHOOSE_BACKUP_CHANNEL = "moxu:choose-backup";
const CHOOSE_IMAGE_CHANNEL = "moxu:choose-image";
const CONFIRM_CHANNEL = "moxu:confirm";

function getApiBaseUrl() {
  try {
    const value = ipcRenderer.sendSync(API_BASE_URL_CHANNEL);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    // Keep the renderer usable in non-Electron tests and web builds. The API
    // client will fall back to its configured web URL when no desktop server
    // is available.
    return undefined;
  }
}

/** @type {import("../../web/types/desktop-bridge").DesktopBridge} */
const desktopBridge = {
  platform: process.platform,
  apiBaseUrl: getApiBaseUrl(),
  selectDirectory: () => ipcRenderer.invoke(SELECT_DIRECTORY_CHANNEL),
  saveBackup: (payload, filename) =>
    ipcRenderer.invoke(SAVE_BACKUP_CHANNEL, { payload, filename }),
  chooseBackup: () => ipcRenderer.invoke(CHOOSE_BACKUP_CHANNEL),
  chooseImage: () => ipcRenderer.invoke(CHOOSE_IMAGE_CHANNEL),
  confirm: (message) =>
    ipcRenderer.invoke(CONFIRM_CHANNEL, String(message ?? "")),
};

contextBridge.exposeInMainWorld("moxuDesktop", desktopBridge);
