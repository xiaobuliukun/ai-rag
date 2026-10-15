const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

const DESKTOP_SECRET_FILE = "ai-config-secret";
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const UPDATE_CHANNEL_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/i;

function toPrismaFileUrl(filePath) {
  return `file:${path.resolve(filePath).replaceAll("\\", "/")}`;
}

function createDesktopBaseEnvironment({
  baseEnvironment = {},
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
    ALLOW_REMOTE_API: "false",
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

/**
 * Environment for the local Nest HTTP process used by the Electron desktop
 * client. The API is loopback-only and binds an ephemeral port by default so
 * it cannot collide with a separately running web server.
 */
function createDesktopServerEnvironment({
  baseEnvironment = {},
  userDataPath,
  aiConfigSecret,
  host = "127.0.0.1",
  port = 0,
}) {
  const configuredPort = Number(baseEnvironment.MOXU_API_PORT);
  const selectedPort =
    Number.isInteger(configuredPort) &&
    configuredPort >= 0 &&
    configuredPort <= 65_535
      ? configuredPort
      : port;
  const environment = createDesktopBaseEnvironment({
    baseEnvironment,
    userDataPath,
    aiConfigSecret,
  });

  return {
    ...environment,
    // child_process.fork inherits Electron's executable in packaged and dev
    // desktop runs. This flag makes that executable run the Nest entrypoint
    // as a Node process instead of opening another Electron app instance.
    ELECTRON_RUN_AS_NODE: "1",
    HOST: host,
    PORT: String(selectedPort),
    // A file:// renderer sends Origin: null. Keeping this scoped to the
    // desktop process allows that origin while the regular web server keeps
    // its existing allow-list.
    CORS_ORIGINS: "null",
  };
}

function resolveUserDataPath({
  baseEnvironment = process.env,
  projectRoot,
  isPackaged,
}) {
  const configured = baseEnvironment.MOXU_USER_DATA_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  if (!isPackaged && projectRoot) {
    return path.join(projectRoot, ".moxu", "desktop-user-data");
  }
  return undefined;
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

function normalizeExternalUrl(value) {
  try {
    const externalUrl = new URL(value);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(externalUrl.protocol)
      ? externalUrl.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isAllowedExternalUrl(value) {
  return normalizeExternalUrl(value) !== undefined;
}

function isAllowedAppNavigation(value, applicationUrl) {
  try {
    const targetUrl = new URL(value);
    const localUrl = new URL(applicationUrl);
    if (localUrl.protocol === "file:") {
      return (
        targetUrl.protocol === "file:" &&
        targetUrl.host === localUrl.host &&
        targetUrl.pathname === localUrl.pathname
      );
    }
    return (
      targetUrl.protocol === localUrl.protocol &&
      targetUrl.origin === localUrl.origin
    );
  } catch {
    return false;
  }
}

function configureSessionPermissions(targetSession) {
  if (
    !targetSession ||
    typeof targetSession.setPermissionCheckHandler !== "function" ||
    typeof targetSession.setPermissionRequestHandler !== "function"
  ) {
    throw new TypeError("A valid Electron session is required");
  }

  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );

  if (typeof targetSession.setDevicePermissionHandler === "function") {
    targetSession.setDevicePermissionHandler(() => false);
  }
}

function createSecureWebPreferences({ preloadPath }) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

function normalizeUpdateChannel(value) {
  if (value == null || String(value).trim() === "") {
    return undefined;
  }

  const channel = String(value).trim();
  if (!UPDATE_CHANNEL_PATTERN.test(channel)) {
    throw new Error(
      "UPDATE_CHANNEL must start with an alphanumeric character and contain at most 32 alphanumeric, dot, underscore, or dash characters",
    );
  }
  return channel;
}

function normalizeUpdateUrl(value) {
  let updateUrl;
  try {
    updateUrl = new URL(String(value).trim());
  } catch {
    throw new Error("UPDATE_URL must be a valid absolute URL");
  }

  const isSecure = updateUrl.protocol === "https:";
  const isLoopbackHttp =
    updateUrl.protocol === "http:" &&
    ["127.0.0.1", "[::1]", "localhost"].includes(updateUrl.hostname);

  if (!isSecure && !isLoopbackHttp) {
    throw new Error(
      "UPDATE_URL must use HTTPS (HTTP is allowed only for a loopback test server)",
    );
  }
  if (updateUrl.username || updateUrl.password) {
    throw new Error("UPDATE_URL must not contain embedded credentials");
  }
  if (updateUrl.hash) {
    throw new Error("UPDATE_URL must not contain a fragment");
  }

  return updateUrl.toString();
}

function resolveUpdateConfiguration({
  isPackaged,
  baseEnvironment = {},
  resourcesPath,
  fileExists = fs.existsSync,
}) {
  if (!isPackaged) {
    return {
      enabled: false,
      source: "unpackaged",
      feed: undefined,
      channel: undefined,
    };
  }

  const configuredUrl = baseEnvironment.UPDATE_URL?.trim();
  const channel = normalizeUpdateChannel(baseEnvironment.UPDATE_CHANNEL);

  if (configuredUrl) {
    return {
      enabled: true,
      source: "environment",
      feed: {
        provider: "generic",
        url: normalizeUpdateUrl(configuredUrl),
        ...(channel ? { channel } : {}),
      },
      channel,
    };
  }

  const packagedConfigurationPath = resourcesPath
    ? path.join(resourcesPath, "app-update.yml")
    : undefined;
  if (
    packagedConfigurationPath &&
    fileExists(packagedConfigurationPath)
  ) {
    return {
      enabled: true,
      source: "packaged",
      feed: undefined,
      channel,
      packagedConfigurationPath,
    };
  }

  if (channel) {
    throw new Error(
      "UPDATE_CHANNEL requires UPDATE_URL or packaged app-update.yml metadata",
    );
  }

  return {
    enabled: false,
    source: "none",
    feed: undefined,
    channel: undefined,
    packagedConfigurationPath,
  };
}

module.exports = {
  configureSessionPermissions,
  createDesktopServerEnvironment,
  createDesktopBaseEnvironment,
  createSecureWebPreferences,
  isAllowedAppNavigation,
  isAllowedExternalUrl,
  loadOrCreateDesktopSecret,
  normalizeExternalUrl,
  normalizeUpdateChannel,
  normalizeUpdateUrl,
  resolveUserDataPath,
  resolveUpdateConfiguration,
  toPrismaFileUrl,
};
