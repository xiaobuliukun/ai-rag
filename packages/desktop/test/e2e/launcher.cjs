// Test-only launcher: real Electron, preload, renderer, Nest, and SQLite.
// Stub only OS modal selection/confirmation, which Playwright cannot drive.
const electron = require("electron");
const childProcess = require("node:child_process");
const originalFork = childProcess.fork;
const state = globalThis.desktopE2e = {
  children: [],
  openReplies: [],
  saveReplies: [],
  messageReplies: [],
  dialogs: [],
};
childProcess.fork = (...args) => {
  const child = originalFork(...args);
  state.children.push(child);
  return child;
};
electron.dialog.showOpenDialog = async (_window, options) => {
  state.dialogs.push({ type: "open", options });
  return state.openReplies.shift() ?? { canceled: true, filePaths: [] };
};
electron.dialog.showSaveDialog = async (_window, options) => {
  state.dialogs.push({ type: "save", options });
  return state.saveReplies.shift() ?? { canceled: true };
};
electron.dialog.showMessageBox = async (...args) => {
  const options = args.at(-1);
  state.dialogs.push({ type: "message", options });
  return { response: state.messageReplies.shift() ?? options.cancelId ?? 0 };
};
require("../../src/main.cjs");
