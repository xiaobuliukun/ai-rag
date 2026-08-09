import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowlistPath = resolve(projectRoot, "security/audit-allowlist.json");
const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
const allowedSources = new Set(Object.keys(allowlist.advisories));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["audit", "--json"], {
  cwd: projectRoot,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024
});

if (!result.stdout.trim()) {
  process.stderr.write(result.stderr || "npm audit returned no JSON output.\n");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  process.stderr.write(`Unable to parse npm audit output: ${error.message}\n`);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const sourcesByPackage = new Map();

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  const directSources = new Set(
    (vulnerability.via ?? [])
      .filter((entry) => typeof entry === "object" && entry !== null)
      .map((entry) => String(entry.source))
  );
  sourcesByPackage.set(name, directSources);
}

let changed = true;
while (changed) {
  changed = false;
  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    const sources = sourcesByPackage.get(name) ?? new Set();
    for (const entry of vulnerability.via ?? []) {
      if (typeof entry !== "string") {
        continue;
      }
      for (const source of sourcesByPackage.get(entry) ?? []) {
        if (!sources.has(source)) {
          sources.add(source);
          changed = true;
        }
      }
    }
    sourcesByPackage.set(name, sources);
  }
}

const violations = [];
for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  const sources = [...(sourcesByPackage.get(name) ?? [])];
  const unapproved = sources.filter((source) => !allowedSources.has(source));
  if (sources.length === 0 || unapproved.length > 0) {
    violations.push({
      name,
      severity: vulnerability.severity,
      sources,
      unapproved
    });
  }
}

if (violations.length > 0) {
  process.stderr.write("npm audit found vulnerabilities outside the reviewed allowlist:\n");
  process.stderr.write(`${JSON.stringify(violations, null, 2)}\n`);
  process.exit(1);
}

const metadata = report.metadata?.vulnerabilities ?? {};
process.stdout.write(
  `npm audit policy passed: ${metadata.total ?? 0} findings ` +
    `(${metadata.critical ?? 0} critical, ${metadata.high ?? 0} high, ` +
    `${metadata.moderate ?? 0} moderate) resolve only to reviewed advisories ` +
    `${[...allowedSources].join(", ")}.\n`
);
