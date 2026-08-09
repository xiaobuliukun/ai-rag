const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  configureSessionPermissions,
  createLocalCorsOrigins,
  createSecureWebPreferences,
  createServerEnvironment,
  createWebEnvironment,
  findStandaloneServer,
  isAllowedAppNavigation,
  isAllowedExternalUrl,
  loadOrCreateDesktopSecret,
  normalizeExternalUrl,
  normalizeUpdateChannel,
  normalizeUpdateUrl,
  parsePort,
  readAdditionalArgument,
  resolveUpdateConfiguration,
  toPrismaFileUrl,
} = require("../src/runtime.cjs");

test("creates one packaged database URL for the server and migrations", () => {
  const userDataPath = path.join(path.sep, "tmp", "Moxu Data");
  const environment = createServerEnvironment({
    baseEnvironment: {},
    host: "127.0.0.1",
    apiPort: 4311,
    webPort: 4300,
    userDataPath,
  });

  assert.equal(
    environment.DATABASE_URL,
    toPrismaFileUrl(path.join(userDataPath, "moxu.db")),
  );
  assert.equal(environment.PORT, "4311");
  assert.equal(
    environment.CORS_ORIGINS,
    "http://127.0.0.1:4300,http://localhost:4300",
  );
  assert.equal(
    environment.SCAN_JOBS_FILE,
    path.join(userDataPath, "scan-jobs.json"),
  );
});

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

test("injects a desktop AI config secret without replacing an explicit one", () => {
  const generated = createServerEnvironment({
    baseEnvironment: {},
    host: "127.0.0.1",
    apiPort: 4311,
    webPort: 4300,
    userDataPath: "/tmp/moxu",
    aiConfigSecret: "generated-desktop-secret-1234567890",
  });
  const explicit = createServerEnvironment({
    baseEnvironment: {
      AI_CONFIG_SECRET: "explicit-environment-secret-1234567890",
    },
    host: "127.0.0.1",
    apiPort: 4311,
    webPort: 4300,
    userDataPath: "/tmp/moxu",
    aiConfigSecret: "generated-desktop-secret-1234567890",
  });

  assert.equal(
    generated.AI_CONFIG_SECRET,
    "generated-desktop-secret-1234567890",
  );
  assert.equal(
    explicit.AI_CONFIG_SECRET,
    "explicit-environment-secret-1234567890",
  );
});

test("preserves an explicit database URL in the shared server environment", () => {
  const environment = createServerEnvironment({
    baseEnvironment: { DATABASE_URL: "file:/custom/library.db" },
    host: "127.0.0.1",
    apiPort: 3001,
    webPort: 3000,
    userDataPath: "/ignored",
  });

  assert.equal(environment.DATABASE_URL, "file:/custom/library.db");
});

test("builds local CORS origins for a custom desktop web port", () => {
  assert.equal(
    createLocalCorsOrigins("127.0.0.1", 4320),
    "http://127.0.0.1:4320,http://localhost:4320",
  );
});

test("keeps standalone web and API ports separate", () => {
  const environment = createWebEnvironment({
    baseEnvironment: {},
    host: "127.0.0.1",
    webPort: 4300,
    apiPort: 4311,
  });

  assert.equal(environment.PORT, "4300");
  assert.equal(environment.HOSTNAME, "127.0.0.1");
  assert.equal(environment.MOXU_API_PORT, "4311");
  assert.equal(
    environment.NEXT_PUBLIC_API_BASE_URL,
    "http://127.0.0.1:4311/api",
  );
});

test("validates configured service ports", () => {
  assert.equal(parsePort(undefined, 3000, "MOXU_WEB_PORT"), 3000);
  assert.equal(parsePort("4311", 3001, "MOXU_API_PORT"), 4311);
  assert.throws(
    () => parsePort("not-a-port", 3001, "MOXU_API_PORT"),
    /MOXU_API_PORT/,
  );
});

test("finds the monorepo standalone entry and reads preload arguments", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "moxu-desktop-"));
  const entry = path.join(tempRoot, "web", "packages", "web", "server.js");
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, "");

  try {
    assert.equal(findStandaloneServer(tempRoot), entry);
    assert.equal(
      readAdditionalArgument(
        ["electron", "--moxu-api-base-url=http://127.0.0.1:4311/api"],
        "moxu-api-base-url",
      ),
      "http://127.0.0.1:4311/api",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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

test("allows renderer navigation only within the desktop web origin", () => {
  const applicationUrl = "http://127.0.0.1:4300";

  assert.equal(
    isAllowedAppNavigation(
      "http://127.0.0.1:4300/library?book=1#chapter",
      applicationUrl,
    ),
    true,
  );
  assert.equal(
    isAllowedAppNavigation("http://localhost:4300/library", applicationUrl),
    false,
  );
  assert.equal(
    isAllowedAppNavigation("https://example.com/library", applicationUrl),
    false,
  );
  assert.equal(
    isAllowedAppNavigation(
      "blob:http://127.0.0.1:4300/8a28a896-6ebc-4a12-991e-21091cb792df",
      applicationUrl,
    ),
    false,
  );
  assert.equal(isAllowedAppNavigation("not a URL", applicationUrl), false);
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

test("creates sandboxed renderer preferences for the local desktop app", () => {
  assert.deepEqual(
    createSecureWebPreferences({
      preloadPath: "/app/preload.cjs",
      apiBaseUrl: "http://127.0.0.1:4311/api",
    }),
    {
      preload: "/app/preload.cjs",
      additionalArguments: [
        "--moxu-api-base-url=http://127.0.0.1:4311/api",
      ],
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
