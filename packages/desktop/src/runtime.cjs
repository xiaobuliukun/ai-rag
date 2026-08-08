const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

const DESKTOP_SECRET_FILE = "ai-config-secret";

function parsePort(value, fallback, name) {
  const normalized = value == null || value === "" ? fallback : Number(value);

  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }

  return normalized;
}

function toPrismaFileUrl(filePath) {
  return `file:${path.resolve(filePath).replaceAll("\\", "/")}`;
}

function createServerEnvironment({
  baseEnvironment,
  host,
  apiPort,
  webPort,
  userDataPath,
  aiConfigSecret,
}) {
  const configuredSecret =
    typeof baseEnvironment.AI_CONFIG_SECRET === "string"
      ? baseEnvironment.AI_CONFIG_SECRET.trim()
      : "";
  const serverSecret = configuredSecret || aiConfigSecret?.trim();

  return {
    ...baseEnvironment,
    NODE_ENV: "production",
    HOST: host,
    PORT: String(apiPort),
    NEXT_TELEMETRY_DISABLED: "1",
    ALLOW_REMOTE_API: "false",
    CORS_ORIGINS:
      baseEnvironment.CORS_ORIGINS ||
      baseEnvironment.CORS_ORIGIN ||
      createLocalCorsOrigins(host, webPort),
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    ...(serverSecret ? { AI_CONFIG_SECRET: serverSecret } : {}),
    DATABASE_URL:
      baseEnvironment.DATABASE_URL ||
      toPrismaFileUrl(path.join(userDataPath, "moxu.db")),
    SCAN_JOBS_FILE:
      baseEnvironment.SCAN_JOBS_FILE ||
      path.join(userDataPath, "scan-jobs.json"),
  };
}

function loadOrCreateDesktopSecret(userDataPath) {
  fs.mkdirSync(userDataPath, { recursive: true, mode: 0o700 });
  const secretPath = path.join(userDataPath, DESKTOP_SECRET_FILE);

  try {
    return readDesktopSecret(secretPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const secret = randomBytes(32).toString("base64url");
  let descriptor;

  try {
    descriptor = fs.openSync(secretPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") {
      return readDesktopSecret(secretPath);
    }
    throw error;
  }

  let writeError;
  try {
    fs.writeFileSync(descriptor, `${secret}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } catch (error) {
    writeError = error;
  } finally {
    fs.closeSync(descriptor);
  }

  if (writeError) {
    fs.rmSync(secretPath, { force: true });
    throw writeError;
  }

  if (process.platform !== "win32") {
    fs.chmodSync(secretPath, 0o600);
  }

  return secret;
}

function readDesktopSecret(secretPath) {
  const secret = fs.readFileSync(secretPath, "utf8").trim();
  if (secret.length < 32) {
    throw new Error(`Desktop AI config secret is invalid: ${secretPath}`);
  }
  return secret;
}

function createLocalCorsOrigins(host, webPort) {
  return Array.from(new Set([host, "127.0.0.1", "localhost"]))
    .map((hostname) => `http://${hostname}:${webPort}`)
    .join(",");
}

function createWebEnvironment({
  baseEnvironment,
  host,
  webPort,
  apiPort,
}) {
  return {
    ...baseEnvironment,
    NODE_ENV: "production",
    HOST: host,
    HOSTNAME: host,
    PORT: String(webPort),
    MOXU_API_HOST: host,
    MOXU_API_PORT: String(apiPort),
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_API_BASE_URL: `http://${host}:${apiPort}/api`,
  };
}

function findStandaloneServer(runtimeRoot) {
  const candidates = [
    path.join(runtimeRoot, "web", "packages", "web", "server.js"),
    path.join(runtimeRoot, "web", "server.js"),
  ];
  const entry = candidates.find((candidate) => fs.existsSync(candidate));

  if (!entry) {
    throw new Error(
      `Next.js standalone server was not found. Checked: ${candidates.join(", ")}`,
    );
  }

  return entry;
}

function readAdditionalArgument(argv, name) {
  const prefix = `--${name}=`;
  const argument = argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : undefined;
}

module.exports = {
  createLocalCorsOrigins,
  createServerEnvironment,
  createWebEnvironment,
  findStandaloneServer,
  loadOrCreateDesktopSecret,
  parsePort,
  readAdditionalArgument,
  toPrismaFileUrl,
};
