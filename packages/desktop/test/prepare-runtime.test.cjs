const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assertFileFingerprintUnchanged,
  createNativeRebuildOptions,
  fileFingerprint,
  runtimeRoot,
  withFileFingerprintGuard,
} = require("../scripts/prepare-runtime.cjs");
const beforePack = require("../scripts/before-pack.cjs");
const afterPack = require("../scripts/after-pack.cjs");
const desktopPackage = require("../package.json");

test("limits native rebuild discovery to the isolated runtime", () => {
  const options = createNativeRebuildOptions("38.2.2", "darwin", "arm64");

  assert.equal(options.buildPath, runtimeRoot);
  assert.equal(options.projectRootPath, runtimeRoot);
  assert.deepEqual(options.onlyModules, ["better-sqlite3"]);
  assert.equal(options.force, true);
});

test("detects native dependency changes outside the isolated runtime", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "moxu-runtime-test-"));
  const binaryPath = path.join(tempRoot, "native.node");

  try {
    fs.writeFileSync(binaryPath, "node-runtime");
    const before = fileFingerprint(binaryPath);

    assert.doesNotThrow(() =>
      assertFileFingerprintUnchanged(binaryPath, before, "Native binary"),
    );

    fs.writeFileSync(binaryPath, "electron-runtime");
    assert.throws(
      () => assertFileFingerprintUnchanged(binaryPath, before, "Native binary"),
      /isolated desktop runtime/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("checks the host binary when runtime preparation fails", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "moxu-runtime-test-"));
  const binaryPath = path.join(tempRoot, "native.node");

  try {
    fs.writeFileSync(binaryPath, "node-runtime");

    await assert.rejects(
      () =>
        withFileFingerprintGuard(binaryPath, "Native binary", async () => {
          fs.writeFileSync(binaryPath, "electron-runtime");
          throw new Error("native rebuild failed");
        }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.match(error.message, /native rebuild failed/);
        assert.match(error.message, /isolated desktop runtime/);
        return true;
      },
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("beforePack waits for isolated runtime preparation", async () => {
  let completePreparation;
  let receivedOptions;
  const preparation = new Promise((resolve) => {
    completePreparation = resolve;
  });
  let settled = false;

  const task = beforePack(
    {
      arch: 3,
      electronPlatformName: "darwin",
      packager: { info: { framework: { version: "38.2.2" } } },
    },
    async (options) => {
      receivedOptions = options;
      await preparation;
    },
  ).then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(receivedOptions, {
    electronVersion: "38.2.2",
    platform: "darwin",
    arch: "arm64",
  });

  completePreparation();
  await task;
  assert.equal(settled, true);
});

test("packages standalone web dependencies as a separate resource", () => {
  assert.ok(
    desktopPackage.build.extraResources.some(
      (resource) =>
        resource.from === "../../.moxu/desktop-runtime/web/node_modules" &&
        resource.to === "runtime/web/node_modules",
    ),
  );
});

test("afterPack rejects an incomplete desktop runtime", async () => {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "moxu-pack-test-"));
  const context = {
    appOutDir,
    electronPlatformName: "darwin",
    packager: { appInfo: { productFilename: "墨序" } },
  };
  const runtimeRoot = afterPack.packagedRuntimeRoot(context);
  const requiredFiles = [
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
    path.join(runtimeRoot, "web", "packages", "web", "server.js"),
    path.join(runtimeRoot, "web", "node_modules", "next", "package.json"),
  ];

  try {
    for (const filePath of requiredFiles) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "fixture");
    }

    await assert.doesNotReject(() => afterPack(context));

    fs.rmSync(requiredFiles.at(-1));
    await assert.rejects(() => afterPack(context), /runtime is incomplete.*next/s);
  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
  }
});
