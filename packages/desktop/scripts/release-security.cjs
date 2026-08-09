const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MAC_NOTARIZATION_STRATEGIES = [
  {
    name: "App Store Connect API key",
    keys: ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"],
  },
  {
    name: "Apple ID",
    keys: ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
  },
  {
    name: "notarytool keychain profile",
    keys: ["APPLE_KEYCHAIN_PROFILE"],
    relatedKeys: ["APPLE_KEYCHAIN"],
  },
];

function environmentValue(environment, name) {
  const value = environment[name];
  return typeof value === "string" ? value.trim() : "";
}

function collectMacReleaseEnvironmentErrors(
  environment,
  { hasLocalSigningIdentity = false } = {},
) {
  const errors = [];
  const cscLink = environmentValue(environment, "CSC_LINK");
  const configuredCscName = environmentValue(environment, "CSC_NAME");
  const cscName = configuredCscName === "-" ? "" : configuredCscName;
  const automaticDiscovery =
    environmentValue(environment, "CSC_IDENTITY_AUTO_DISCOVERY").toLowerCase() !==
    "false";
  const canUseLocalIdentity = automaticDiscovery && hasLocalSigningIdentity;

  if (!cscLink && !cscName && !canUseLocalIdentity) {
    errors.push(
      "Configure a Developer ID Application identity with CSC_LINK, CSC_NAME, or an installed keychain identity.",
    );
  }
  if (environmentValue(environment, "CSC_KEY_PASSWORD") && !cscLink) {
    errors.push("CSC_KEY_PASSWORD is set without CSC_LINK.");
  }

  let completeNotarizationStrategy = false;
  for (const strategy of MAC_NOTARIZATION_STRATEGIES) {
    const configuredKeys = strategy.keys.filter((key) =>
      Boolean(environmentValue(environment, key)),
    );
    const relatedConfigured = (strategy.relatedKeys || []).some((key) =>
      Boolean(environmentValue(environment, key)),
    );
    const strategyWasConfigured = configuredKeys.length > 0 || relatedConfigured;

    if (configuredKeys.length === strategy.keys.length) {
      completeNotarizationStrategy = true;
    } else if (strategyWasConfigured) {
      const missing = strategy.keys.filter(
        (key) => !environmentValue(environment, key),
      );
      errors.push(
        `${strategy.name} notarization configuration is incomplete; missing ${missing.join(", ")}.`,
      );
    }
  }

  if (!completeNotarizationStrategy) {
    errors.push(
      "Configure one complete notarization strategy: App Store Connect API key, Apple ID, or notarytool keychain profile.",
    );
  }

  return errors;
}

function createMacReleaseVerificationPlan(releaseRoot) {
  const resolvedRoot = path.resolve(releaseRoot);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Desktop release directory does not exist: ${resolvedRoot}`);
  }

  const appBundles = findPaths(
    resolvedRoot,
    (entry) => entry.isDirectory() && entry.name.endsWith(".app"),
    { stopAtMatch: true },
  );
  const diskImages = findPaths(
    resolvedRoot,
    (entry) => entry.isFile() && entry.name.endsWith(".dmg"),
  );
  const zipArchives = findPaths(
    resolvedRoot,
    (entry) => entry.isFile() && entry.name.endsWith(".zip"),
  );

  const missing = [];
  if (appBundles.length === 0) missing.push("a packaged .app bundle");
  if (diskImages.length === 0) missing.push("a .dmg artifact");
  if (zipArchives.length === 0) missing.push("a .zip artifact");
  if (missing.length > 0) {
    throw new Error(
      `Signed macOS release is incomplete; missing ${missing.join(", ")} in ${resolvedRoot}`,
    );
  }

  const commands = appBundles.flatMap((appBundle) => [
    {
      command: "codesign",
      args: ["--verify", "--deep", "--strict", "--verbose=2", appBundle],
    },
    {
      command: "spctl",
      args: ["--assess", "--type", "execute", "--verbose=4", appBundle],
    },
    {
      command: "xcrun",
      args: ["stapler", "validate", appBundle],
    },
  ]);

  return {
    releaseRoot: resolvedRoot,
    appBundles,
    diskImages,
    zipArchives,
    commands,
  };
}

function findPaths(root, matches, { stopAtMatch = false } = {}) {
  const found = [];
  const pending = [root];

  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (matches(entry)) {
        found.push(entryPath);
        if (stopAtMatch) {
          continue;
        }
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
      }
    }
  }

  return found.sort();
}

function runChecked(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`Unable to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}` +
        (output ? `\n${output}` : ""),
    );
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`.trim();
}

function assertMacReleasePrerequisites(environment = process.env) {
  if (process.platform !== "darwin") {
    throw new Error("macOS release preflight must run on macOS.");
  }

  runChecked("xcrun", ["--find", "codesign"]);
  runChecked("xcrun", ["--find", "spctl"]);
  runChecked("xcrun", ["--find", "notarytool"]);

  let hasLocalSigningIdentity = false;
  if (
    environmentValue(environment, "CSC_IDENTITY_AUTO_DISCOVERY").toLowerCase() !==
    "false"
  ) {
    const identities = runChecked("security", [
      "find-identity",
      "-v",
      "-p",
      "codesigning",
    ]);
    hasLocalSigningIdentity = /Developer ID Application:/i.test(identities);
  }

  const errors = collectMacReleaseEnvironmentErrors(environment, {
    hasLocalSigningIdentity,
  });
  if (errors.length > 0) {
    throw new Error(`macOS release preflight failed:\n- ${errors.join("\n- ")}`);
  }
}

function verifyMacRelease(releaseRoot) {
  if (process.platform !== "darwin") {
    throw new Error("macOS release verification must run on macOS.");
  }

  const plan = createMacReleaseVerificationPlan(releaseRoot);
  for (const command of plan.commands) {
    runChecked(command.command, command.args);
  }
  return plan;
}

function runCli(argv = process.argv.slice(2)) {
  const [action, releaseRoot] = argv;
  if (action === "preflight") {
    assertMacReleasePrerequisites();
    console.log(
      "[desktop-release] signing identity, notarization credentials, and macOS tooling are ready",
    );
    return;
  }
  if (action === "verify") {
    if (!releaseRoot) {
      throw new Error("Usage: release-security.cjs verify <release-directory>");
    }
    const plan = verifyMacRelease(releaseRoot);
    console.log(
      `[desktop-release] verified ${plan.appBundles.length} signed and notarized app bundle(s) plus DMG/ZIP artifacts`,
    );
    return;
  }

  throw new Error(
    "Usage: release-security.cjs <preflight|verify> [release-directory]",
  );
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `[desktop-release] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

module.exports = {
  collectMacReleaseEnvironmentErrors,
  createMacReleaseVerificationPlan,
  findPaths,
  runCli,
};
