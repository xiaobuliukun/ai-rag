#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const INSTALLER_PATTERN = /\.(?:dmg|zip|exe|appimage|deb)$/i;
const RELEASE_FILE_PATTERN =
  /(?:\.(?:dmg|zip|exe|appimage|deb|blockmap|cdx\.json|asc)$)|(?:^latest.*\.ya?ml$)/i;
const CHECKSUM_PATTERN = /^SHA256SUMS(?:-[0-9A-Za-z._-]+)?\.txt$/;

function walkFiles(root) {
  const files = [];
  const pending = [root];

  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function safeRelativePath(root, candidate) {
  const normalized = candidate.replaceAll("\\", "/");
  if (
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Unsafe checksum path: ${candidate}`);
  }

  const resolved = path.resolve(root, normalized);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Checksum path escapes release directory: ${candidate}`);
  }
  return resolved;
}

export function createChecksumManifest(releaseRoot, label = "") {
  const root = path.resolve(releaseRoot);
  if (!fs.existsSync(root)) {
    throw new Error(`Release directory does not exist: ${root}`);
  }

  const files = walkFiles(root).filter((filePath) => {
    const name = path.basename(filePath);
    return RELEASE_FILE_PATTERN.test(name) && !CHECKSUM_PATTERN.test(name);
  });
  if (!files.some((filePath) => INSTALLER_PATTERN.test(filePath))) {
    throw new Error(`No desktop installer artifacts found in ${root}`);
  }

  const safeLabel = label.trim().replace(/[^0-9A-Za-z._-]+/g, "-");
  const manifestName = safeLabel
    ? `SHA256SUMS-${safeLabel}.txt`
    : "SHA256SUMS.txt";
  const manifestPath = path.join(root, manifestName);
  const lines = files.map((filePath) => {
    const relative = path.relative(root, filePath).split(path.sep).join("/");
    return `${sha256(filePath)}  ${relative}`;
  });

  fs.writeFileSync(manifestPath, `${lines.join("\n")}\n`);
  return { manifestPath, files };
}

export function verifyChecksumManifests(releaseRoot) {
  const root = path.resolve(releaseRoot);
  if (!fs.existsSync(root)) {
    throw new Error(`Release directory does not exist: ${root}`);
  }

  const manifests = walkFiles(root).filter((filePath) =>
    CHECKSUM_PATTERN.test(path.basename(filePath)),
  );
  if (manifests.length === 0) {
    throw new Error(`No SHA256SUMS manifest found in ${root}`);
  }

  const expectedFiles = walkFiles(root)
    .filter((filePath) => {
      const name = path.basename(filePath);
      return RELEASE_FILE_PATTERN.test(name) && !CHECKSUM_PATTERN.test(name);
    })
    .map((filePath) => path.relative(root, filePath).split(path.sep).join("/"));
  const coveredFiles = new Set();
  let verifiedFiles = 0;
  for (const manifestPath of manifests) {
    const lines = fs
      .readFileSync(manifestPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    if (lines.length === 0) {
      throw new Error(`Checksum manifest is empty: ${manifestPath}`);
    }

    for (const line of lines) {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
      if (!match) {
        throw new Error(`Invalid checksum entry in ${manifestPath}: ${line}`);
      }
      const filePath = safeRelativePath(root, match[2]);
      const relative = path.relative(root, filePath).split(path.sep).join("/");
      if (coveredFiles.has(relative)) {
        throw new Error(`Duplicate checksum entry for ${relative}`);
      }
      coveredFiles.add(relative);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error(`Checksummed file is missing: ${match[2]}`);
      }
      const actual = sha256(filePath);
      if (actual !== match[1]) {
        throw new Error(`SHA-256 mismatch for ${match[2]}`);
      }
      verifiedFiles += 1;
    }
  }

  const missing = expectedFiles.filter((filePath) => !coveredFiles.has(filePath));
  const unexpected = [...coveredFiles].filter(
    (filePath) => !expectedFiles.includes(filePath),
  );
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `SHA256SUMS does not cover the complete release payload` +
        (missing.length > 0 ? `; missing ${missing.join(", ")}` : "") +
        (unexpected.length > 0 ? `; unexpected ${unexpected.join(", ")}` : ""),
    );
  }

  return { manifests, verifiedFiles };
}

function isMainModule() {
  return (
    process.argv[1] &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  );
}

if (isMainModule()) {
  try {
    const [action, releaseRoot, label] = process.argv.slice(2);
    if (action === "create" && releaseRoot) {
      const result = createChecksumManifest(releaseRoot, label);
      console.log(
        `[release] wrote ${result.manifestPath} for ${result.files.length} file(s)`,
      );
    } else if (action === "verify" && releaseRoot) {
      const result = verifyChecksumManifests(releaseRoot);
      console.log(
        `[release] verified ${result.verifiedFiles} checksum(s) from ${result.manifests.length} manifest(s)`,
      );
    } else {
      throw new Error(
        "Usage: release-artifacts.mjs <create|verify> <release-directory> [label]",
      );
    }
  } catch (error) {
    console.error(
      `[release] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
