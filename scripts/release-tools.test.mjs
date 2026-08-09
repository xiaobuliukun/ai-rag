import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";

import { assembleDesktopRelease } from "./assemble-desktop-release.mjs";
import {
  createChecksumManifest,
  verifyChecksumManifests,
} from "./release-artifacts.mjs";

const projectVersion = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

function write(root, relativePath, contents = "fixture") {
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents);
}

function updateFile(root, url) {
  const contents = fs.readFileSync(path.join(root, url));
  return {
    url,
    sha512: createHash("sha512").update(contents).digest("base64"),
    size: contents.length,
  };
}

function updateMetadata(root, url) {
  const file = updateFile(root, url);
  return dumpYaml({
    version: projectVersion,
    files: [file],
    path: url,
    sha512: file.sha512,
    releaseDate: "2026-08-09T00:00:00.000Z",
  });
}

const validSbom = JSON.stringify({
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  metadata: { timestamp: "2026-08-09T00:00:00.000Z" },
  components: [{ type: "library", name: "fixture", version: "1.0.0" }],
});

test("assembles multi-platform artifacts and verifies SHA-256 manifests", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "moxu-release-"));
  const inputRoot = path.join(fixtureRoot, "input");
  const outputRoot = path.join(fixtureRoot, "output");

  try {
    for (const arch of ["arm64", "x64"]) {
      write(
        inputRoot,
        `desktop-macos-${arch}/Moxu-${projectVersion}-${arch}.dmg`,
      );
      write(
        inputRoot,
        `desktop-macos-${arch}/Moxu-${projectVersion}-${arch}.zip`,
      );
      write(
        inputRoot,
        `desktop-macos-${arch}/latest-mac.yml`,
        updateMetadata(
          path.join(inputRoot, `desktop-macos-${arch}`),
          `Moxu-${projectVersion}-${arch}.zip`,
        ),
      );
      write(
        inputRoot,
        `desktop-macos-${arch}/SBOM-macos-${arch}.cdx.json`,
        validSbom,
      );
    }
    write(
      inputRoot,
      `desktop-windows-x64/Moxu-Setup-${projectVersion}-x64.exe`,
    );
    write(
      inputRoot,
      `desktop-windows-x64/Moxu-Portable-${projectVersion}-x64.exe`,
    );
    write(
      inputRoot,
      "desktop-windows-x64/latest.yml",
      updateMetadata(
        path.join(inputRoot, "desktop-windows-x64"),
        `Moxu-Setup-${projectVersion}-x64.exe`,
      ),
    );
    write(
      inputRoot,
      "desktop-windows-x64/SBOM-windows-x64.cdx.json",
      validSbom,
    );
    write(
      inputRoot,
      `desktop-linux-x64/Moxu-${projectVersion}-x64.AppImage`,
    );
    write(inputRoot, `desktop-linux-x64/Moxu-${projectVersion}-x64.deb`);
    write(
      inputRoot,
      `desktop-linux-x64/Moxu-${projectVersion}-x64.AppImage.asc`,
    );
    write(
      inputRoot,
      `desktop-linux-x64/Moxu-${projectVersion}-x64.deb.asc`,
    );
    write(inputRoot, "desktop-linux-x64/Moxu-Linux-Signing-Key.asc");
    write(
      inputRoot,
      "desktop-linux-x64/latest-linux.yml",
      updateMetadata(
        path.join(inputRoot, "desktop-linux-x64"),
        `Moxu-${projectVersion}-x64.AppImage`,
      ),
    );
    write(
      inputRoot,
      "desktop-linux-x64/SBOM-linux-x64.cdx.json",
      validSbom,
    );

    const assembled = assembleDesktopRelease(inputRoot, outputRoot);
    assert.ok(assembled.files.includes("latest-mac.yml"));
    assert.throws(
      () => assembleDesktopRelease(inputRoot, outputRoot),
      /output already exists/,
    );

    const merged = loadYaml(
      fs.readFileSync(path.join(outputRoot, "latest-mac.yml"), "utf8"),
    );
    assert.equal(merged.files.length, 2);
    assert.equal(merged.path, `Moxu-${projectVersion}-x64.zip`);

    const created = createChecksumManifest(outputRoot);
    assert.equal(path.basename(created.manifestPath), "SHA256SUMS.txt");
    const verified = verifyChecksumManifests(outputRoot);
    assert.equal(verified.verifiedFiles, created.files.length);

    const checksumContents = fs.readFileSync(created.manifestPath, "utf8");
    fs.writeFileSync(
      created.manifestPath,
      checksumContents.split(/\r?\n/).slice(1).join("\n"),
    );
    assert.throws(
      () => verifyChecksumManifests(outputRoot),
      /does not cover the complete release payload/,
    );
    fs.writeFileSync(created.manifestPath, checksumContents);

    fs.appendFileSync(
      path.join(outputRoot, `Moxu-${projectVersion}-x64.deb`),
      "tampered",
    );
    assert.throws(
      () => verifyChecksumManifests(outputRoot),
      /SHA-256 mismatch/,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
