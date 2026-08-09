#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDirectory, "..");
const packageFiles = [
  "package.json",
  "packages/app/package.json",
  "packages/desktop/package.json",
  "packages/server/package.json",
  "packages/shared/package.json",
  "packages/web/package.json",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function assertReleaseVersion(
  projectRoot = defaultProjectRoot,
  releaseTag = "",
) {
  const versions = packageFiles.map((relativePath) => ({
    relativePath,
    version: readJson(path.join(projectRoot, relativePath)).version,
  }));
  const rootVersion = versions[0].version;

  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(rootVersion)) {
    throw new Error(`Invalid root package version: ${rootVersion}`);
  }

  const mismatches = versions.filter(({ version }) => version !== rootVersion);
  if (mismatches.length > 0) {
    throw new Error(
      `Workspace versions must match ${rootVersion}: ${mismatches
        .map(({ relativePath, version }) => `${relativePath}=${version}`)
        .join(", ")}`,
    );
  }

  const lockfile = readJson(path.join(projectRoot, "package-lock.json"));
  const lockVersion = lockfile.packages?.[""]?.version;
  if (lockVersion !== rootVersion) {
    throw new Error(
      `package-lock.json root version ${lockVersion || "<missing>"} does not match ${rootVersion}`,
    );
  }

  const normalizedTag = releaseTag.trim();
  if (normalizedTag && rootVersion.includes("-")) {
    throw new Error(
      `Stable desktop releases cannot publish prerelease version ${rootVersion}; use a dedicated prerelease channel workflow`,
    );
  }
  if (normalizedTag && normalizedTag !== `v${rootVersion}`) {
    throw new Error(
      `Release tag ${normalizedTag} must exactly match package version v${rootVersion}`,
    );
  }

  return { version: rootVersion, tag: normalizedTag || null };
}

function isMainModule() {
  return (
    process.argv[1] &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  );
}

if (isMainModule()) {
  try {
    const result = assertReleaseVersion(defaultProjectRoot, process.argv[2] || "");
    console.log(
      `[release] workspace version ${result.version}${result.tag ? ` matches ${result.tag}` : " is consistent"}`,
    );
  } catch (error) {
    console.error(
      `[release] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
