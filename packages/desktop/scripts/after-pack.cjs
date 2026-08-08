const fs = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const runtimeRoot = packagedRuntimeRoot(context);
  const standaloneCandidates = [
    path.join(runtimeRoot, "web", "packages", "web", "server.js"),
    path.join(runtimeRoot, "web", "server.js"),
  ];
  const requiredPaths = [
    path.join(runtimeRoot, "package.json"),
    path.join(
      runtimeRoot,
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ),
    path.join(runtimeRoot, "packages", "server", "dist", "src", "main.js"),
    path.join(runtimeRoot, "web", "node_modules", "next", "package.json"),
  ];

  if (!standaloneCandidates.some((candidate) => fs.existsSync(candidate))) {
    requiredPaths.push(standaloneCandidates[0]);
  }

  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));
  if (missingPaths.length > 0) {
    throw new Error(
      `Packaged desktop runtime is incomplete. Missing: ${missingPaths.join(", ")}`,
    );
  }
};

function packagedRuntimeRoot(context) {
  const resourcesRoot =
    context.electronPlatformName === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : path.join(context.appOutDir, "resources");

  return path.join(resourcesRoot, "runtime");
}

module.exports.packagedRuntimeRoot = packagedRuntimeRoot;
