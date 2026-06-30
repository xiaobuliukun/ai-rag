const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("moxuDesktop", {
  platform: process.platform,
});
