const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(desktopRoot, "../..");
const runtimeRoot = path.join(projectRoot, ".moxu", "desktop-runtime");

async function prepareRuntime(options = {}) {
  const electronVersion =
    options.electronVersion || resolveInstalledElectronVersion();
  const targetPlatform = options.platform || process.platform;
  const targetArch = options.arch || process.arch;
  const hostNativeBinary = path.join(
    projectRoot,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );
  return withFileFingerprintGuard(
    hostNativeBinary,
    "Host better-sqlite3 binary",
    async () => {
      assertNativeTarget(targetPlatform, targetArch);
      assertBuildOutputs();

      fs.rmSync(runtimeRoot, { recursive: true, force: true });
      fs.mkdirSync(runtimeRoot, { recursive: true });

      copyProductionDependencies();
      copyPrismaClient();
      copyServerOutput();
      copySharedOutput();
      writeRuntimePackage(electronVersion, targetPlatform, targetArch);
      await rebuildNativeDependencies(electronVersion, targetPlatform, targetArch);
      validateRuntime(electronVersion, targetPlatform, targetArch);

      const size = directorySize(runtimeRoot);
      console.log(
        `[desktop-runtime] prepared ${runtimeRoot} (${formatBytes(size)}) for Electron ${electronVersion} ${targetPlatform}-${targetArch}`,
      );

      return runtimeRoot;
    },
  );
}

function resolveInstalledElectronVersion() {
  const electronPackage = require.resolve("electron/package.json", {
    paths: [desktopRoot],
  });
  const version = readJson(electronPackage).version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Installed Electron version is invalid: ${version}`);
  }
  return version;
}

function assertNativeTarget(targetPlatform, targetArch) {
  if (targetPlatform !== process.platform || targetArch !== process.arch) {
    throw new Error(
      `Desktop runtime must be prepared on its target platform and architecture because Prisma and better-sqlite3 contain native binaries. ` +
        `Requested ${targetPlatform}-${targetArch}, current host is ${process.platform}-${process.arch}.`,
    );
  }
}

function assertBuildOutputs() {
  const requiredPaths = [
    path.join(projectRoot, "packages", "server", "dist", "src", "main.js"),
    path.join(projectRoot, "packages", "server", "prisma", "schema.prisma"),
    path.join(projectRoot, "packages", "server", "prisma.config.ts"),
    path.join(projectRoot, "packages", "shared", "dist", "index.js"),
  ];
  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));

  if (missingPaths.length > 0) {
    throw new Error(
      `Desktop runtime build outputs are missing. Run the root build first. Missing: ${missingPaths.join(", ")}`,
    );
  }
}

function copyProductionDependencies() {
  const npmInvocation = resolveNpmInvocation();
  const result = spawnSync(
    npmInvocation.command,
    [
      ...npmInvocation.prefixArgs,
      "ls",
      "--omit=dev",
      "--all",
      "--parseable",
      "--workspace",
      "packages/server",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      shell: npmInvocation.shell,
    },
  );

  if (result.error || result.status !== 0) {
    throw new Error(
      `Unable to resolve server production dependencies.\n${result.error?.message || result.stderr || result.stdout}`,
    );
  }

  const excluded = new Set([
    path.join("node_modules", "@moxu", "server"),
    path.join("node_modules", "@moxu", "shared"),
  ]);
  const dependencyPaths = [...new Set(result.stdout.split(/\r?\n/))]
    .map((dependencyPath) => dependencyPath.trim())
    .filter(Boolean)
    .map((dependencyPath) => path.resolve(dependencyPath))
    .filter((dependencyPath) => isDependencyPath(dependencyPath))
    .filter((dependencyPath) => {
      const relativePath = path.relative(projectRoot, dependencyPath);
      return !excluded.has(relativePath);
    })
    .sort((left, right) => left.length - right.length);

  for (const dependencyPath of dependencyPaths) {
    const relativePath = path.relative(projectRoot, dependencyPath);
    const destination = path.join(runtimeRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(dependencyPath, destination, {
      recursive: true,
      dereference: true,
      force: true,
      filter: (source) => !source.split(path.sep).includes(".cache"),
    });
  }
}

function resolveNpmInvocation(environment = process.env) {
  const npmCli = environment.npm_execpath;
  if (npmCli) {
    return {
      command: process.execPath,
      prefixArgs: [npmCli],
      shell: false,
    };
  }

  // npm.cmd is a shell script on Windows and cannot be spawned reliably with
  // shell:false. Keep the fallback explicit for direct `node` invocations.
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    prefixArgs: [],
    shell: process.platform === "win32",
  };
}

function isDependencyPath(dependencyPath) {
  const relativePath = path.relative(projectRoot, dependencyPath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith(`..${path.sep}`) &&
    (relativePath.startsWith(`node_modules${path.sep}`) ||
      relativePath.includes(`${path.sep}node_modules${path.sep}`))
  );
}

function copyPrismaClient() {
  const source = path.join(projectRoot, "node_modules", ".prisma");
  const destination = path.join(runtimeRoot, "node_modules", ".prisma");

  if (!fs.existsSync(source)) {
    throw new Error("Generated Prisma client was not found. Run prisma generate first.");
  }

  fs.cpSync(source, destination, { recursive: true, dereference: true });
}

function copyServerOutput() {
  const serverRoot = path.join(projectRoot, "packages", "server");
  const destination = path.join(runtimeRoot, "packages", "server");

  fs.cpSync(path.join(serverRoot, "dist"), path.join(destination, "dist"), {
    recursive: true,
  });
  fs.cpSync(path.join(serverRoot, "prisma"), path.join(destination, "prisma"), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(serverRoot, "prisma.config.ts"),
    path.join(destination, "prisma.config.ts"),
  );
}

function copySharedOutput() {
  const sharedRoot = path.join(projectRoot, "packages", "shared");
  const destination = path.join(
    runtimeRoot,
    "node_modules",
    "@moxu",
    "shared",
  );

  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(path.join(sharedRoot, "dist"), path.join(destination, "dist"), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(sharedRoot, "package.json"),
    path.join(destination, "package.json"),
  );
}

function writeRuntimePackage(electronVersion, platform, arch) {
  const betterSqlitePackage = readJson(
    path.join(runtimeRoot, "node_modules", "better-sqlite3", "package.json"),
  );
  const sharedPackage = readJson(
    path.join(runtimeRoot, "node_modules", "@moxu", "shared", "package.json"),
  );
  const payload = {
    name: "moxu-desktop-runtime",
    private: true,
    version: "0.0.0",
    dependencies: {
      "@moxu/shared": sharedPackage.version,
      "better-sqlite3": betterSqlitePackage.version,
    },
    moxuRuntime: {
      electronVersion,
      platform,
      arch,
      fingerprint: runtimeFingerprint(electronVersion, platform, arch),
    },
  };

  fs.writeFileSync(
    path.join(runtimeRoot, "package.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

function createNativeRebuildOptions(electronVersion, platform, arch) {
  return {
    buildPath: runtimeRoot,
    projectRootPath: runtimeRoot,
    electronVersion,
    platform,
    arch,
    onlyModules: ["better-sqlite3"],
    force: true,
  };
}

function nativeCompilerEnvironment(platform, environment = process.env) {
  if (platform !== "linux") return {};
  // GCC rejects attribute placement in Electron 43's V8 headers. Use the
  // system Clang while preserving an explicitly configured compiler pair.
  if (environment.CC || environment.CXX) {
    return {
      CC: environment.CC || "clang",
      CXX: environment.CXX || "clang++",
    };
  }

  for (const [cc, cxx] of [
    ["clang-19", "clang++-19"],
    ["clang-18", "clang++-18"],
    ["clang", "clang++"],
  ]) {
    if (compilerMajorVersion(cc) >= 18 && compilerMajorVersion(cxx) >= 18) {
      return { CC: cc, CXX: cxx };
    }
  }

  return {
    CC: "clang",
    CXX: "clang++",
  };
}

function compilerMajorVersion(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) return 0;
  const match = String(result.stdout).match(/clang version (\d+)|Apple clang version (\d+)/i);
  return Number(match?.[1] || match?.[2] || 0);
}

async function rebuildNativeDependencies(electronVersion, platform, arch) {
  const { rebuild } = await import("@electron/rebuild");
  const compilerEnvironment = nativeCompilerEnvironment(platform);
  const previousEnvironment = Object.fromEntries(
    Object.keys(compilerEnvironment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, compilerEnvironment);

  try {
    const rebuildResult = rebuild(
      createNativeRebuildOptions(electronVersion, platform, arch),
    );

    rebuildResult.lifecycle.on("modules-found", (moduleNames) => {
      console.log(
        `[desktop-runtime] rebuilding native modules: ${moduleNames.join(", ") || "none"}`,
      );
    });

    await rebuildResult;
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function validateRuntime(electronVersion, platform, arch) {
  const electronPackage = require.resolve("electron/package.json", {
    paths: [desktopRoot],
  });
  const electronExecutable = require(path.dirname(electronPackage));
  const validationDatabase = path.join(runtimeRoot, "runtime-validation.db");
  const serverRuntimeRoot = path.join(runtimeRoot, "packages", "server");

  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    fs.rmSync(`${validationDatabase}${suffix}`, { force: true });
  }

  const environment = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    DATABASE_URL: `file:${validationDatabase.replaceAll("\\", "/")}`,
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    RUST_LOG: process.env.RUST_LOG
      ? `${process.env.RUST_LOG},schema_engine=info`
      : "schema_engine=info",
  };

  run(
    electronExecutable,
    [
      path.join(runtimeRoot, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "deploy",
      "--config",
      path.join(runtimeRoot, "packages", "server", "prisma.config.ts"),
      "--schema",
      path.join(runtimeRoot, "packages", "server", "prisma", "schema.prisma"),
    ],
    { cwd: serverRuntimeRoot, env: environment },
  );

  const validationScript = [
    `const shared = require(${JSON.stringify(path.join(runtimeRoot, "node_modules", "@moxu", "shared"))});`,
    `if (shared.REPLACE_BACKUP_CONFIRMATION !== "replace-current-library") throw new Error("Shared runtime package is invalid");`,
    `require(${JSON.stringify(path.join(serverRuntimeRoot, "dist", "src", "validation", "request-validation.js"))});`,
    `const Database = require(${JSON.stringify(path.join(runtimeRoot, "node_modules", "better-sqlite3"))});`,
    `const database = new Database(${JSON.stringify(validationDatabase)});`,
    `const row = database.prepare("SELECT COUNT(*) AS count FROM _prisma_migrations").get();`,
    `if (!row || row.count < 1) throw new Error("Prisma migrations were not applied");`,
    "database.close();",
  ].join("\n");

  run(electronExecutable, ["-e", validationScript], {
    cwd: serverRuntimeRoot,
    env: environment,
  });

  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    fs.rmSync(`${validationDatabase}${suffix}`, { force: true });
  }

  console.log(
    `[desktop-runtime] validated Prisma migrate deploy and better-sqlite3 with Electron ${electronVersion} ${platform}-${arch}`,
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    env: options.env || process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}`,
    );
  }
}

function runtimeFingerprint(electronVersion, platform, arch) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(path.join(projectRoot, "package-lock.json")));
  hash.update(fs.readFileSync(path.join(projectRoot, "packages", "server", "package.json")));
  hash.update(`${electronVersion}:${platform}:${arch}`);
  return hash.digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function directorySize(directory) {
  let total = 0;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(entryPath);
    } else if (entry.isFile()) {
      total += fs.statSync(entryPath).size;
    }
  }

  return total;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function fileFingerprint(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertFileFingerprintUnchanged(filePath, before, label) {
  const after = fileFingerprint(filePath);
  if (before !== after) {
    throw new Error(
      `${label} changed while preparing the isolated desktop runtime. ` +
        `Desktop native rebuilds must only modify ${runtimeRoot}.`,
    );
  }
}

async function withFileFingerprintGuard(filePath, label, operation) {
  const before = fileFingerprint(filePath);
  let result;
  let operationError;

  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }

  let fingerprintError;
  try {
    assertFileFingerprintUnchanged(filePath, before, label);
  } catch (error) {
    fingerprintError = error;
  }

  if (operationError && fingerprintError) {
    throw new AggregateError(
      [operationError, fingerprintError],
      `${errorMessage(operationError)}\n${errorMessage(fingerprintError)}`,
    );
  }
  if (operationError) {
    throw operationError;
  }
  if (fingerprintError) {
    throw fingerprintError;
  }

  return result;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseCliOptions(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--platform") {
      options.platform = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--arch") {
      options.arch = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

if (require.main === module) {
  prepareRuntime(parseCliOptions(process.argv.slice(2))).catch((error) => {
    console.error(
      `[desktop-runtime] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  assertFileFingerprintUnchanged,
  createNativeRebuildOptions,
  fileFingerprint,
  nativeCompilerEnvironment,
  resolveNpmInvocation,
  prepareRuntime,
  resolveInstalledElectronVersion,
  runtimeRoot,
  withFileFingerprintGuard,
};
