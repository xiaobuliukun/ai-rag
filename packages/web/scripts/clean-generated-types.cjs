/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const webRoot = path.resolve(__dirname, "..");
const generatedTypeDirectories = [
  path.join(webRoot, ".next", "types"),
  path.join(webRoot, ".next", "dev", "types"),
];

for (const directory of generatedTypeDirectories) {
  fs.rmSync(directory, { recursive: true, force: true });
}
