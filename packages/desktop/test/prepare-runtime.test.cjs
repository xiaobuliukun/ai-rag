const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assertFileFingerprintUnchanged,
  createNativeRebuildOptions,
  fileFingerprint,
  nativeCompilerEnvironment,
  resolveNpmInvocation,
  resolveInstalledElectronVersion,
  runtimeRoot,
  withFileFingerprintGuard,
} = require("../scripts/prepare-runtime.cjs");
const beforePack = require("../scripts/before-pack.cjs");
const afterPack = require("../scripts/after-pack.cjs");
const desktopPackage = require("../package.json");

test("dependency discovery executes the selected npm CLI with literal paths", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "moxu npm cli "));
  const npmCli = path.join(tempRoot, "npm & selected.cjs");
  try {
    fs.writeFileSync(npmCli, "process.stdout.write(JSON.stringify(process.argv.slice(2)))");
    const invocation = resolveNpmInvocation({ npm_execpath: npmCli });
    const args = ["ls", "--omit=dev", "--all", "--parseable", "--workspace", "packages/server"];
    const result = spawnSync(invocation.command, [...invocation.prefixArgs, ...args], {
      encoding: "utf8",
      shell: invocation.shell,
    });
    assert.equal(invocation.shell, false);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), args);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("direct node invocation supports the Windows npm command shim", () => {
  const invocation = resolveNpmInvocation({});
  assert.deepEqual(invocation.prefixArgs, []);
  assert.equal(invocation.command, process.platform === "win32" ? "npm.cmd" : "npm");
  assert.equal(invocation.shell, process.platform === "win32");
});

test("resolves an exact installed Electron version for native rebuilds", () => {
  const installedElectron = require("electron/package.json").version;

  assert.equal(resolveInstalledElectronVersion(), installedElectron);
  assert.match(installedElectron, /^\d+\.\d+\.\d+/);
  assert.equal(desktopPackage.devDependencies.electron, installedElectron);
});

test("limits native rebuild discovery to the isolated runtime", () => {
  const options = createNativeRebuildOptions("38.2.2", "darwin", "arm64");

  assert.equal(options.buildPath, runtimeRoot);
  assert.equal(options.projectRootPath, runtimeRoot);
  assert.deepEqual(options.onlyModules, ["better-sqlite3"]);
  assert.equal(options.force, true);
});

test("Linux builds default to Clang and preserve explicit compiler settings", () => {
  assert.deepEqual(nativeCompilerEnvironment("linux", {}), {
    CC: "clang",
    CXX: "clang++",
  });
  assert.deepEqual(
    nativeCompilerEnvironment("linux", { CC: "cc", CXX: "c++" }),
    { CC: "cc", CXX: "c++" },
  );
  assert.deepEqual(nativeCompilerEnvironment("darwin", {}), {});
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

test("does not package a Next.js web runtime", () => {
  assert.equal(
    desktopPackage.build.extraResources.some((resource) =>
      String(resource.from).includes("desktop-runtime/web"),
    ),
    false,
  );
});

test("packages the static native renderer", () => {
  assert.ok(desktopPackage.build.files.includes("dist/renderer/**/*"));
});

test("afterPack rejects an incomplete desktop runtime", async () => {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "moxu-pack-test-"));
  const context = {
    appOutDir,
    electronPlatformName: "darwin",
    packager: { appInfo: { productFilename: "墨序" } },
  };
  const runtimeRoot = afterPack.packagedRuntimeRoot(context);
  const sharedPackagePath = path.join(
    runtimeRoot,
    "node_modules",
    "@moxu",
    "shared",
    "package.json",
  );
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
    sharedPackagePath,
    path.join(
      runtimeRoot,
      "node_modules",
      "@moxu",
      "shared",
      "dist",
      "index.js",
    ),
  ];

  try {
    for (const filePath of requiredFiles) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "fixture");
    }

    await assert.doesNotReject(() => afterPack(context));

    fs.rmSync(sharedPackagePath);
    await assert.rejects(
      () => afterPack(context),
      /runtime is incomplete.*shared.*package\.json/s,
    );
    fs.writeFileSync(sharedPackagePath, "fixture");

  } finally {
    fs.rmSync(appOutDir, { recursive: true, force: true });
  }
});
