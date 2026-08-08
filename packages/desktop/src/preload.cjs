const { contextBridge } = require("electron");
const { readAdditionalArgument } = require("./runtime.cjs");

contextBridge.exposeInMainWorld("moxuDesktop", {
  platform: process.platform,
  apiBaseUrl: readAdditionalArgument(process.argv, "moxu-api-base-url"),
});
