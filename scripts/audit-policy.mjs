import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowlistPath = resolve(projectRoot, "security/audit-allowlist.json");
const severities = ["info", "low", "moderate", "high", "critical"];

export function parseAuditResult(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error(
      `npm audit did not complete: ${result.error?.message || result.signal || `exit ${result.status}`}`,
    );
  }
  if (!result.stdout?.trim()) {
    throw new Error("npm audit returned no JSON output.");
  }
  const report = JSON.parse(result.stdout);
  if (!report || report.error) {
    throw new Error(
      `npm audit failed: ${report?.error?.code || "invalid report"}`,
    );
  }
  if (
    report.auditReportVersion !== 2 ||
    !isRecord(report.vulnerabilities) ||
    !isRecord(report.metadata?.vulnerabilities)
  ) {
    throw new Error("npm audit returned an incomplete or unsupported report.");
  }
  const counts = report.metadata.vulnerabilities;
  if (
    ![...severities, "total"].every(
      (key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0,
    ) ||
    severities.reduce((sum, key) => sum + counts[key], 0) !== counts.total ||
    Object.keys(report.vulnerabilities).length !== counts.total
  ) {
    throw new Error("npm audit returned inconsistent vulnerability counts.");
  }
  return report;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function evaluateAuditPolicy(report, allowlist) {
  const allowedSources = new Set(Object.keys(allowlist.advisories));
  const vulnerabilities = report.vulnerabilities;
  const sourcesByPackage = new Map();
  const unapprovedSources = new Set();

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (
      !isRecord(vulnerability) ||
      !Array.isArray(vulnerability.via) ||
      !severities.includes(vulnerability.severity)
    ) {
      throw new Error(`npm audit returned an invalid entry for ${name}.`);
    }
    for (const entry of vulnerability.via) {
      if (typeof entry === "string") {
        if (!Object.hasOwn(vulnerabilities, entry)) {
          throw new Error(
            `npm audit referenced an unknown dependency: ${entry}.`,
          );
        }
      } else if (
        !isRecord(entry) ||
        !Number.isSafeInteger(entry.source) ||
        typeof entry.name !== "string" ||
        !severities.includes(entry.severity)
      ) {
        throw new Error(`npm audit returned an invalid advisory for ${name}.`);
      } else {
        const approved = allowlist.advisories[String(entry.source)];
        if (
          !approved ||
          approved.package !== entry.name ||
          approved.severity !== entry.severity
        ) {
          unapprovedSources.add(String(entry.source));
        }
      }
    }
    const directSources = new Set(
      vulnerability.via
        .filter((entry) => typeof entry === "object" && entry !== null)
        .map((entry) => String(entry.source)),
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
    const unapproved = sources.filter(
      (source) => !allowedSources.has(source) || unapprovedSources.has(source),
    );
    if (sources.length === 0 || unapproved.length > 0) {
      violations.push({
        name,
        severity: vulnerability.severity,
        sources,
        unapproved,
      });
    }
  }

  return violations;
}

function main() {
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  // npm.cmd cannot be executed directly by spawnSync on Windows. npm run
  // supplies the JS entry point, which also preserves the pinned npm version.
  const npmCli = process.env.npm_execpath;
  const report = parseAuditResult(
    spawnSync(
      npmCli ? process.execPath : npmCommand,
      [...(npmCli ? [npmCli] : []), "audit", "--json"],
      {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120_000,
        shell: !npmCli && process.platform === "win32",
      },
    ),
  );
  const violations = evaluateAuditPolicy(report, allowlist);
  if (violations.length > 0) {
    process.stderr.write(
      "npm audit found vulnerabilities outside the reviewed allowlist:\n",
    );
    process.stderr.write(`${JSON.stringify(violations, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const metadata = report.metadata?.vulnerabilities ?? {};
  process.stdout.write(
    `npm audit policy passed: ${metadata.total ?? 0} findings ` +
      `(${metadata.critical ?? 0} critical, ${metadata.high ?? 0} high, ` +
      `${metadata.moderate ?? 0} moderate) resolve only to reviewed advisories ` +
      `${Object.keys(allowlist.advisories).join(", ")}.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Audit policy could not verify dependencies: ${error.message}\n`,
    );
    process.exitCode = 1;
  }
}
