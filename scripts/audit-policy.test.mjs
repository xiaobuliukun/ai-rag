import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAuditPolicy, parseAuditResult } from "./audit-policy.mjs";

function result(vulnerabilities = {}) {
  const counts = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
  };
  for (const entry of Object.values(vulnerabilities)) {
    counts[entry.severity]++;
    counts.total++;
  }
  return {
    status: counts.total ? 1 : 0,
    stdout: JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities,
      metadata: { vulnerabilities: counts },
    }),
  };
}

const advisory = { source: 123, name: "leaf", severity: "moderate" };
const allowlist = {
  advisories: { 123: { package: "leaf", severity: "moderate" } },
};

test("accepts a complete clean report", () => {
  assert.deepEqual(
    evaluateAuditPolicy(parseAuditResult(result()), allowlist),
    [],
  );
});

test("audit outages, subprocess failures and partial JSON fail closed", () => {
  for (const entry of [
    { status: 1, stdout: '{"error":{"code":"ENOAUDIT"}}' },
    { status: 1, stdout: "{}" },
    { status: 0, stdout: "null" },
    { status: 0, stdout: '{"auditReportVersion":2,"vulnerabilities":{}}' },
    { status: 1, stdout: "{" },
    { status: 1, stdout: "" },
    { ...result(), status: 2 },
    { ...result(), status: null, signal: "SIGTERM" },
    { ...result(), error: new Error("spawn failed") },
  ])
    assert.throws(() => parseAuditResult(entry));
});

test("rejects truncated reports and inconsistent summary counts", () => {
  const report = JSON.parse(result().stdout);
  report.metadata.vulnerabilities.total = 1;
  assert.throws(
    () => parseAuditResult({ status: 1, stdout: JSON.stringify(report) }),
    /counts/,
  );
  report.metadata.vulnerabilities.high = 1;
  assert.throws(
    () => parseAuditResult({ status: 1, stdout: JSON.stringify(report) }),
    /counts/,
  );
});

test("reviewed advisories propagate through transitive dependencies and cycles", () => {
  const report = parseAuditResult(
    result({
      parent: { severity: "moderate", via: ["child"] },
      child: { severity: "moderate", via: ["parent", "leaf"] },
      leaf: { severity: "moderate", via: [advisory] },
    }),
  );
  assert.deepEqual(evaluateAuditPolicy(report, allowlist), []);
});

test("new advisories block every affected transitive package", () => {
  const report = parseAuditResult(
    result({
      parent: { severity: "moderate", via: ["leaf"] },
      leaf: {
        severity: "moderate",
        via: [advisory, { ...advisory, source: 456 }],
      },
    }),
  );
  const violations = evaluateAuditPolicy(report, allowlist);
  assert.deepEqual(
    violations.map((entry) => entry.name),
    ["parent", "leaf"],
  );
  for (const entry of violations) assert.deepEqual(entry.unapproved, ["456"]);
});

test("a package mismatch or severity escalation invalidates an exception", () => {
  for (const changed of [
    { ...advisory, name: "different" },
    { ...advisory, severity: "high" },
  ]) {
    const report = parseAuditResult(
      result({ leaf: { severity: changed.severity, via: [changed] } }),
    );
    assert.deepEqual(evaluateAuditPolicy(report, allowlist)[0].unapproved, [
      "123",
    ]);
  }
});

test("unexplained findings and broken advisory references cannot pass", () => {
  const unexplained = parseAuditResult(
    result({ leaf: { severity: "high", via: [] } }),
  );
  assert.equal(evaluateAuditPolicy(unexplained, allowlist).length, 1);
  for (const via of [["missing"], [null], [{}]]) {
    const report = parseAuditResult(
      result({ leaf: { severity: "high", via } }),
    );
    assert.throws(() => evaluateAuditPolicy(report, allowlist));
  }
});
