const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
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
} = require("../src/runtime.cjs");

test("creates and reuses a protected desktop AI config secret", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "moxu-secret-"));

  try {
    const first = loadOrCreateDesktopSecret(tempRoot);
    const second = loadOrCreateDesktopSecret(tempRoot);
    const secretPath = path.join(tempRoot, "ai-config-secret");

    assert.equal(first, second);
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(fs.readFileSync(secretPath, "utf8").trim(), first);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(secretPath).mode & 0o777, 0o600);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("creates an isolated desktop environment before the HTTP listener starts", () => {
  const environment = createDesktopBaseEnvironment({
    baseEnvironment: {},
    userDataPath: "/tmp/moxu-user-data",
    aiConfigSecret: "generated-desktop-secret-1234567890",
  });

  assert.equal(environment.NODE_ENV, "production");
  assert.equal(environment.ALLOW_REMOTE_API, "false");
  assert.equal(environment.AI_CONFIG_SECRET, "generated-desktop-secret-1234567890");
  assert.equal(environment.DATABASE_URL, "file:/tmp/moxu-user-data/moxu.db");
  assert.equal(
    environment.SCAN_JOBS_FILE,
    "/tmp/moxu-user-data/scan-jobs.json",
  );
  assert.equal(environment.PORT, undefined);
});

test("creates a loopback Nest server environment for Electron", () => {
  const environment = createDesktopServerEnvironment({
    baseEnvironment: {},
    userDataPath: "/tmp/moxu-user-data",
    aiConfigSecret: "generated-desktop-secret-1234567890",
  });

  assert.equal(environment.HOST, "127.0.0.1");
  assert.equal(environment.PORT, "0");
  assert.equal(environment.CORS_ORIGINS, "null");
  assert.equal(environment.ELECTRON_RUN_AS_NODE, "1");
});

test("honors an explicit desktop API port while defaulting to ephemeral", () => {
  const environment = createDesktopServerEnvironment({
    baseEnvironment: { MOXU_API_PORT: "43123" },
    userDataPath: "/tmp/moxu-user-data",
  });

  assert.equal(environment.PORT, "43123");
});

test("isolates development user data while preserving an explicit override", () => {
  assert.equal(
    resolveUserDataPath({
      baseEnvironment: {},
      projectRoot: "/workspace/ai-rag",
      isPackaged: false,
    }),
    "/workspace/ai-rag/.moxu/desktop-user-data",
  );
  assert.equal(
    resolveUserDataPath({
      baseEnvironment: { MOXU_USER_DATA_DIR: "~/moxu" },
      projectRoot: "/workspace/ai-rag",
      isPackaged: false,
    }),
    path.resolve("~/moxu"),
  );
  assert.equal(
    resolveUserDataPath({
      baseEnvironment: {},
      projectRoot: "/workspace/ai-rag",
      isPackaged: true,
    }),
    undefined,
  );
});

test("allows only browser-safe protocols for external URLs", () => {
  assert.equal(isAllowedExternalUrl("https://example.com/guide"), true);
  assert.equal(isAllowedExternalUrl("http://example.com/guide"), true);
  assert.equal(isAllowedExternalUrl("mailto:hello@example.com"), true);
  assert.equal(isAllowedExternalUrl("file:///etc/passwd"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
  assert.equal(isAllowedExternalUrl("data:text/html,hello"), false);
  assert.equal(isAllowedExternalUrl("not a URL"), false);
  assert.equal(
    normalizeExternalUrl(" HTTPS://Example.com/guide "),
    "https://example.com/guide",
  );
});

test("allows only the renderer entry file for file navigation", () => {
  const applicationUrl = "file:///Applications/Moxu.app/Contents/Resources/app/dist/renderer/index.html";
  assert.equal(
    isAllowedAppNavigation(
      `${applicationUrl}#/book/1/2`,
      applicationUrl,
    ),
    true,
  );
  assert.equal(
    isAllowedAppNavigation(
      "file:///Applications/Moxu.app/Contents/Resources/app/other.html",
      applicationUrl,
    ),
    false,
  );
  assert.equal(isAllowedAppNavigation("file:///etc/passwd", applicationUrl), false);
});

test("installs deny-by-default session permission handlers", () => {
  let checkHandler;
  let requestHandler;
  let deviceHandler;
  const targetSession = {
    setPermissionCheckHandler(handler) {
      checkHandler = handler;
    },
    setPermissionRequestHandler(handler) {
      requestHandler = handler;
    },
    setDevicePermissionHandler(handler) {
      deviceHandler = handler;
    },
  };

  configureSessionPermissions(targetSession);

  assert.equal(checkHandler(null, "geolocation", "http://127.0.0.1"), false);
  assert.equal(deviceHandler({ deviceType: "usb" }), false);

  let granted = true;
  requestHandler(null, "notifications", (allowed) => {
    granted = allowed;
  });
  assert.equal(granted, false);
});

test("does not inject an HTTP API URL into the native renderer", () => {
  assert.deepEqual(
    createSecureWebPreferences({ preloadPath: "/app/preload.cjs" }),
    {
      preload: "/app/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  );
});

test("uses packaged updater metadata without requiring a runtime URL", () => {
  const resourcesPath = path.join(path.sep, "Applications", "Moxu", "resources");
  const configuration = resolveUpdateConfiguration({
    isPackaged: true,
    resourcesPath,
    fileExists: (candidate) =>
      candidate === path.join(resourcesPath, "app-update.yml"),
  });

  assert.equal(configuration.enabled, true);
  assert.equal(configuration.source, "packaged");
  assert.equal(configuration.feed, undefined);
  assert.equal(
    configuration.packagedConfigurationPath,
    path.join(resourcesPath, "app-update.yml"),
  );
});

test("supports a secure generic updater override and channel", () => {
  const configuration = resolveUpdateConfiguration({
    isPackaged: true,
    baseEnvironment: {
      UPDATE_URL: " https://updates.example.com/moxu ",
      UPDATE_CHANNEL: "beta",
    },
    resourcesPath: "/unused",
    fileExists: () => false,
  });

  assert.equal(configuration.enabled, true);
  assert.equal(configuration.source, "environment");
  assert.deepEqual(configuration.feed, {
    provider: "generic",
    url: "https://updates.example.com/moxu",
    channel: "beta",
  });
  assert.equal(configuration.channel, "beta");
});

test("keeps updates disabled when neither packaged metadata nor an override exists", () => {
  const configuration = resolveUpdateConfiguration({
    isPackaged: true,
    resourcesPath: "/missing",
    fileExists: () => false,
  });

  assert.equal(configuration.enabled, false);
  assert.equal(configuration.source, "none");
});

test("rejects unsafe update URL and channel configuration", () => {
  assert.equal(normalizeUpdateUrl("http://127.0.0.1:8080/updates"), "http://127.0.0.1:8080/updates");
  assert.equal(normalizeUpdateChannel(" stable-1 "), "stable-1");
  assert.throws(
    () => normalizeUpdateUrl("http://updates.example.com/moxu"),
    /HTTPS/,
  );
  assert.throws(
    () => normalizeUpdateUrl("https://user:secret@example.com/moxu"),
    /credentials/,
  );
  assert.throws(() => normalizeUpdateChannel("../beta"), /UPDATE_CHANNEL/);
  assert.throws(
    () =>
      resolveUpdateConfiguration({
        isPackaged: true,
        baseEnvironment: { UPDATE_CHANNEL: "beta" },
        resourcesPath: "/missing",
        fileExists: () => false,
      }),
    /requires UPDATE_URL/,
  );
});
