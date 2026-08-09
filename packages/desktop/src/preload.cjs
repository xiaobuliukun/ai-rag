const { contextBridge } = require("electron");

// Sandboxed preload scripts can only require a small Electron-provided module
// subset, so keep this argument reader self-contained.
function readAdditionalArgument(argv, name) {
  const prefix = `--${name}=`;
  const argument = argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : undefined;
}

contextBridge.exposeInMainWorld("moxuDesktop", {
  platform: process.platform,
  apiBaseUrl: readAdditionalArgument(process.argv, "moxu-api-base-url"),
});
