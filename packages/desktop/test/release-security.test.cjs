const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const desktopPackage = require("../package.json");
const {
  collectMacReleaseEnvironmentErrors,
  createMacReleaseVerificationPlan,
} = require("../scripts/release-security.cjs");

test("accepts complete signing and App Store Connect notarization settings", () => {
  const errors = collectMacReleaseEnvironmentErrors({
    CSC_LINK: "base64-certificate",
    CSC_KEY_PASSWORD: "certificate-password",
    APPLE_API_KEY: "/secure/AuthKey.p8",
    APPLE_API_KEY_ID: "KEY123",
    APPLE_API_ISSUER: "issuer-uuid",
  });

  assert.deepEqual(errors, []);
});

test("accepts a discovered Developer ID identity and notarytool profile", () => {
  const errors = collectMacReleaseEnvironmentErrors(
    { APPLE_KEYCHAIN_PROFILE: "moxu-notary" },
    { hasLocalSigningIdentity: true },
  );

  assert.deepEqual(errors, []);
});

test("reports incomplete signing and notarization settings without exposing values", () => {
  const errors = collectMacReleaseEnvironmentErrors({
    CSC_KEY_PASSWORD: "should-not-appear",
    APPLE_ID: "developer@example.com",
  });

  assert.ok(errors.some((error) => error.includes("Developer ID Application")));
  assert.ok(errors.some((error) => error.includes("CSC_KEY_PASSWORD")));
  assert.ok(errors.some((error) => error.includes("APPLE_APP_SPECIFIC_PASSWORD")));
  assert.ok(errors.some((error) => error.includes("APPLE_TEAM_ID")));
  assert.equal(errors.join("\n").includes("should-not-appear"), false);
  assert.equal(errors.join("\n").includes("developer@example.com"), false);
});

test("does not use a local identity when automatic discovery is disabled", () => {
  const errors = collectMacReleaseEnvironmentErrors(
    {
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      APPLE_KEYCHAIN_PROFILE: "moxu-notary",
    },
    { hasLocalSigningIdentity: true },
  );

  assert.ok(errors.some((error) => error.includes("Developer ID Application")));
});

test("builds a verification plan for signed and notarized macOS artifacts", () => {
  const releaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "moxu-release-"));
  const appBundle = path.join(releaseRoot, "mac-arm64", "墨序.app");
  const diskImage = path.join(releaseRoot, "Moxu-0.1.0-arm64.dmg");
  const zipArchive = path.join(releaseRoot, "Moxu-0.1.0-arm64.zip");

  try {
    fs.mkdirSync(appBundle, { recursive: true });
    fs.writeFileSync(diskImage, "fixture");
    fs.writeFileSync(zipArchive, "fixture");

    const plan = createMacReleaseVerificationPlan(releaseRoot);

    assert.deepEqual(plan.appBundles, [appBundle]);
    assert.deepEqual(plan.diskImages, [diskImage]);
    assert.deepEqual(plan.zipArchives, [zipArchive]);
    assert.deepEqual(
      plan.commands.map(({ command }) => command),
      ["codesign", "spctl", "xcrun"],
    );
    assert.ok(plan.commands.every(({ args }) => args.includes(appBundle)));
  } finally {
    fs.rmSync(releaseRoot, { recursive: true, force: true });
  }
});

test("rejects an incomplete macOS release directory", () => {
  const releaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "moxu-release-"));

  try {
    assert.throws(
      () => createMacReleaseVerificationPlan(releaseRoot),
      /missing a packaged \.app bundle, a \.dmg artifact, a \.zip artifact/,
    );
  } finally {
    fs.rmSync(releaseRoot, { recursive: true, force: true });
  }
});

test("desktop build contains fixed update metadata and notarization config", () => {
  assert.match(desktopPackage.author, /xiaobuliukun@gmail\.com/);
  assert.equal(
    desktopPackage.homepage,
    "https://github.com/xiaobuliukun/ai-rag",
  );
  assert.deepEqual(desktopPackage.build.publish, [
    {
      provider: "github",
      owner: "xiaobuliukun",
      repo: "ai-rag",
      channel: "latest",
      releaseType: "release",
    },
  ]);
  assert.equal(desktopPackage.build.mac.hardenedRuntime, true);
  assert.equal(desktopPackage.build.mac.notarize, true);
  assert.equal(desktopPackage.build.mac.icon, "build/icon.icns");
  assert.equal(
    desktopPackage.build.mac.artifactName,
    "Moxu-${version}-${arch}.${ext}",
  );
  assert.equal(desktopPackage.build.win.icon, "build/icon.ico");
  assert.equal(
    desktopPackage.build.nsis.artifactName,
    "Moxu-Setup-${version}-${arch}.${ext}",
  );
  assert.equal(
    desktopPackage.build.portable.artifactName,
    "Moxu-Portable-${version}-${arch}.${ext}",
  );
  assert.equal(desktopPackage.build.linux.icon, "build/icon.png");
  assert.match(
    desktopPackage.build.linux.maintainer,
    /xiaobuliukun@gmail\.com/,
  );
  for (const icon of [
    desktopPackage.build.mac.icon,
    desktopPackage.build.win.icon,
    desktopPackage.build.linux.icon,
  ]) {
    assert.equal(fs.existsSync(path.resolve(__dirname, "..", icon)), true);
  }
  assert.match(desktopPackage.scripts["dist:mac:signed"], /release:check:mac/);
  assert.match(desktopPackage.scripts["dist:mac:signed"], /release:verify:mac/);
});
