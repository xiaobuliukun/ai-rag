#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";

const RELEASE_ASSET_PATTERN =
  /(?:\.(?:dmg|zip|exe|appimage|deb|blockmap|cdx\.json|asc)$)|(?:^latest.*\.ya?ml$)/i;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const expectedVersion = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
).version;
const expectedSbomNames = [
  "SBOM-linux-x64.cdx.json",
  "SBOM-macos-arm64.cdx.json",
  "SBOM-macos-x64.cdx.json",
  "SBOM-windows-x64.cdx.json",
];

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

function mergeMacUpdateMetadata(metadataPaths) {
  if (metadataPaths.length !== 2) {
    throw new Error(
      `Expected two latest-mac.yml files, received ${metadataPaths.length}`,
    );
  }

  const documents = metadataPaths.map((metadataPath) =>
    loadYaml(fs.readFileSync(metadataPath, "utf8")),
  );
  const versions = new Set(documents.map((document) => document?.version));
  if (versions.size !== 1 || !documents[0]?.version) {
    throw new Error("macOS update metadata versions do not match");
  }

  const filesByUrl = new Map();
  for (const document of documents) {
    if (!Array.isArray(document.files) || document.files.length === 0) {
      throw new Error("macOS update metadata does not contain files");
    }
    for (const file of document.files) {
      if (!file?.url || !file?.sha512) {
        throw new Error("macOS update metadata contains an invalid file entry");
      }
      filesByUrl.set(file.url, file);
    }
  }

  const files = [...filesByUrl.values()].sort((left, right) =>
    String(left.url).localeCompare(String(right.url), "en"),
  );
  const zipFiles = files.filter((file) => String(file.url).endsWith(".zip"));
  const arm64Files = zipFiles.filter((file) => /arm64/i.test(file.url));
  const x64Files = zipFiles.filter((file) => /x64/i.test(file.url));
  if (zipFiles.length !== 2 || arm64Files.length !== 1 || x64Files.length !== 1) {
    throw new Error("macOS update metadata must contain x64 and arm64 ZIP files");
  }

  const legacyFile = x64Files[0];
  const releaseDates = documents
    .map((document) => new Date(document.releaseDate || 0))
    .filter((date) => !Number.isNaN(date.getTime()));
  const releaseDate = releaseDates.sort(
    (left, right) => right.getTime() - left.getTime(),
  )[0];

  return {
    ...documents[0],
    files,
    path: legacyFile.url,
    sha512: legacyFile.sha512,
    ...(releaseDate ? { releaseDate: releaseDate.toISOString() } : {}),
  };
}

function sha512(filePath) {
  return createHash("sha512").update(fs.readFileSync(filePath)).digest("base64");
}

function metadataAssetName(urlValue) {
  const value = String(urlValue || "");
  if (!value) {
    throw new Error("Update metadata contains an empty asset URL");
  }
  const parsed = new URL(value, "https://release.invalid/");
  const name = path.posix.basename(decodeURIComponent(parsed.pathname));
  if (!name || name === "." || name === "/") {
    throw new Error(`Update metadata contains an invalid asset URL: ${value}`);
  }
  return name;
}

function validateMetadataFileEntry(file, outputRoot, metadataName) {
  if (!file || typeof file !== "object" || !file.url || !file.sha512) {
    throw new Error(`${metadataName} contains an invalid file entry`);
  }
  const assetName = metadataAssetName(file.url);
  const assetPath = path.join(outputRoot, assetName);
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    throw new Error(`${metadataName} references missing asset ${assetName}`);
  }
  const stat = fs.statSync(assetPath);
  if (file.size != null && Number(file.size) !== stat.size) {
    throw new Error(`${metadataName} contains an invalid size for ${assetName}`);
  }
  if (String(file.sha512) !== sha512(assetPath)) {
    throw new Error(`${metadataName} contains an invalid SHA-512 for ${assetName}`);
  }
  return assetName;
}

function validateUpdateMetadata(outputRoot, metadataName, requiredExtension) {
  const metadataPath = path.join(outputRoot, metadataName);
  const document = loadYaml(fs.readFileSync(metadataPath, "utf8"));
  if (!document || typeof document !== "object") {
    throw new Error(`${metadataName} is not a YAML object`);
  }
  if (document.version !== expectedVersion) {
    throw new Error(
      `${metadataName} version ${document.version || "<missing>"} does not match ${expectedVersion}`,
    );
  }
  if (!Array.isArray(document.files) || document.files.length === 0) {
    throw new Error(`${metadataName} does not contain update files`);
  }

  const referencedAssets = document.files.map((file) =>
    validateMetadataFileEntry(file, outputRoot, metadataName),
  );
  if (
    !referencedAssets.some((assetName) =>
      assetName.toLowerCase().endsWith(requiredExtension.toLowerCase()),
    )
  ) {
    throw new Error(
      `${metadataName} does not reference a ${requiredExtension} update artifact`,
    );
  }

  if (document.path || document.sha512) {
    if (!document.path || !document.sha512) {
      throw new Error(`${metadataName} legacy path and SHA-512 must be paired`);
    }
    const legacyName = metadataAssetName(document.path);
    const legacyPath = path.join(outputRoot, legacyName);
    if (!fs.existsSync(legacyPath) || sha512(legacyPath) !== document.sha512) {
      throw new Error(`${metadataName} contains invalid legacy update metadata`);
    }
  }

  return document;
}

function validateSboms(outputRoot, names) {
  const actualNames = names
    .filter((name) => /^SBOM-.*\.cdx\.json$/i.test(name))
    .sort((left, right) => left.localeCompare(right, "en"));
  if (
    actualNames.length !== expectedSbomNames.length ||
    actualNames.some((name, index) => name !== expectedSbomNames[index])
  ) {
    throw new Error(
      `Desktop release SBOM set must be exactly ${expectedSbomNames.join(", ")}`,
    );
  }

  for (const name of actualNames) {
    let document;
    try {
      document = JSON.parse(fs.readFileSync(path.join(outputRoot, name), "utf8"));
    } catch (error) {
      throw new Error(
        `${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (
      document?.bomFormat !== "CycloneDX" ||
      typeof document.specVersion !== "string" ||
      !document.metadata ||
      !Array.isArray(document.components) ||
      document.components.length === 0
    ) {
      throw new Error(`${name} is not a complete CycloneDX SBOM`);
    }
  }
}

function validateAssembledRelease(outputRoot) {
  const names = fs
    .readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const count = (pattern) => names.filter((name) => pattern.test(name)).length;
  const requirements = [
    ["macOS DMG", count(/\.dmg$/i), 2],
    ["macOS ZIP", count(/\.zip$/i), 2],
    ["Windows executable", count(/\.exe$/i), 2],
    ["Linux AppImage", count(/\.AppImage$/i), 1],
    ["Linux DEB", count(/\.deb$/i), 1],
    ["Linux detached signature", count(/\.(?:AppImage|deb)\.asc$/i), 2],
  ];

  for (const [label, actual, minimum] of requirements) {
    if (actual < minimum) {
      throw new Error(
        `Assembled desktop release is missing ${label}: expected ${minimum}, found ${actual}`,
      );
    }
  }
  for (const metadataName of ["latest-mac.yml", "latest.yml", "latest-linux.yml"]) {
    if (!names.includes(metadataName)) {
      throw new Error(`Assembled desktop release is missing ${metadataName}`);
    }
  }

  validateSboms(outputRoot, names);
  if (!names.includes("Moxu-Linux-Signing-Key.asc")) {
    throw new Error("Assembled desktop release is missing the Linux signing key");
  }
  for (const linuxAsset of names.filter((name) => /\.(?:AppImage|deb)$/i.test(name))) {
    if (!names.includes(`${linuxAsset}.asc`)) {
      throw new Error(`Assembled desktop release is missing ${linuxAsset}.asc`);
    }
  }
  validateUpdateMetadata(outputRoot, "latest-mac.yml", ".zip");
  validateUpdateMetadata(outputRoot, "latest.yml", ".exe");
  validateUpdateMetadata(outputRoot, "latest-linux.yml", ".AppImage");
}

export function assembleDesktopRelease(inputRoot, outputRoot) {
  const resolvedInput = path.resolve(inputRoot);
  const resolvedOutput = path.resolve(outputRoot);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Desktop artifact input does not exist: ${resolvedInput}`);
  }
  const inputToOutput = path.relative(resolvedInput, resolvedOutput);
  const outputToInput = path.relative(resolvedOutput, resolvedInput);
  const overlaps = (relativePath) =>
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..");
  if (overlaps(inputToOutput) || overlaps(outputToInput)) {
    throw new Error("Desktop artifact input and output directories must be disjoint");
  }
  if (fs.existsSync(resolvedOutput)) {
    throw new Error(
      `Desktop release output already exists; remove the generated directory explicitly before retrying: ${resolvedOutput}`,
    );
  }

  fs.mkdirSync(resolvedOutput, { recursive: true });

  const candidates = walkFiles(resolvedInput).filter((filePath) =>
    RELEASE_ASSET_PATTERN.test(path.basename(filePath)),
  );
  const macMetadata = candidates.filter(
    (filePath) => path.basename(filePath) === "latest-mac.yml",
  );

  for (const source of candidates) {
    const name = path.basename(source);
    if (name === "latest-mac.yml") continue;
    const destination = path.join(resolvedOutput, name);
    if (fs.existsSync(destination)) {
      throw new Error(`Duplicate release asset name: ${name}`);
    }
    fs.copyFileSync(source, destination);
  }

  const mergedMacMetadata = mergeMacUpdateMetadata(macMetadata);
  fs.writeFileSync(
    path.join(resolvedOutput, "latest-mac.yml"),
    dumpYaml(mergedMacMetadata, { lineWidth: -1, noRefs: true }),
  );

  validateAssembledRelease(resolvedOutput);
  return {
    outputRoot: resolvedOutput,
    files: fs.readdirSync(resolvedOutput).sort((left, right) =>
      left.localeCompare(right, "en"),
    ),
  };
}

function isMainModule() {
  return (
    process.argv[1] &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  );
}

if (isMainModule()) {
  try {
    const [inputRoot, outputRoot] = process.argv.slice(2);
    if (!inputRoot || !outputRoot) {
      throw new Error(
        "Usage: assemble-desktop-release.mjs <artifact-input> <release-output>",
      );
    }
    const result = assembleDesktopRelease(inputRoot, outputRoot);
    console.log(
      `[release] assembled ${result.files.length} desktop release file(s) in ${result.outputRoot}`,
    );
  } catch (error) {
    console.error(
      `[release] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
