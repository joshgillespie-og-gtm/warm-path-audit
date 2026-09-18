#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const leadingRisk =
  /^[\u0000-\u0020\u007f\u0080-\u009f\u00a0\u1680\u2000-\u200f\u2028\u202f\u205f\u2060\u2066-\u2069\u3000\ufeff]*/u;
export function neutralizeCsvCell(value) {
  const original = String(value).replaceAll("\u0000", "");
  const prefix = original.match(leadingRisk)?.[0] ?? "";
  const next = original.slice(prefix.length, prefix.length + 1);
  if (/^[=+\-@]$/.test(next) || /^[\t\r\n]$/.test(original.slice(0, 1)))
    return `'${original}`;
  return original;
}

const dangerous = [
  "=1+1",
  "+cmd",
  "-2+3",
  "@SUM(A1:A2)",
  " =1+1",
  "\t=1+1",
  "\r@cmd",
  "\n+cmd",
  "\ufeff=1+1",
  "\u200b=1+1",
  "\u2060@cmd",
  "\u00a0-1+2",
  "\u0001+cmd",
];
for (const value of dangerous)
  assert.equal(
    neutralizeCsvCell(value).startsWith("'"),
    true,
    JSON.stringify(value),
  );
for (const value of ["Alex Example", "42", "example.com", "'already text"])
  assert.equal(neutralizeCsvCell(value), value);
assert.equal(neutralizeCsvCell("\u0000=1+1"), "'=1+1");

const allFiles = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? allFiles(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
const excludedDirectories = [".git", "node_modules", "dist"];
const publishable = allFiles(root).filter(
  (file) =>
    !excludedDirectories.some((directory) =>
      file.includes(`${path.sep}${directory}${path.sep}`),
    ),
);
const forbiddenExtensions = /\.(sqlite|sqlite3|db|pem|key|p12|pfx|env)$/i;
for (const file of publishable)
  assert.equal(
    forbiddenExtensions.test(file),
    false,
    `forbidden artifact: ${file}`,
  );

const textFiles = publishable.filter((f) => /\.(md|json|csv|mjs|ts)$/i.test(f));
const sourceFiles = publishable.filter(
  (f) => f.includes(`${path.sep}src${path.sep}`) && f.endsWith(".ts"),
);
const networkOrProcessPatterns = [
  /from ["']node:(?:http|https|net|tls|child_process|dgram)["']/,
  /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/,
  /\b(?:axios|got|undici|node-fetch)\b/,
];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of networkOrProcessPatterns)
    assert.equal(
      pattern.test(text),
      false,
      `network/process primitive in ${file}`,
    );
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|github_pat|sk_live|sk_test)_[A-Za-z0-9_\-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:xox[baprs]-)[A-Za-z0-9-]{10,}\b/,
];
for (const file of textFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of secretPatterns)
    assert.equal(pattern.test(text), false, `secret-like value in ${file}`);
}

const examples = allFiles(path.join(root, "examples"));
const allowedDomains = new Set(["example.com"]);
const domainRegex = /\b(?:[a-z0-9-]+\.)+[a-z]{2,63}\b/gi;
for (const file of examples) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(domainRegex)) {
    const domain = match[0].toLowerCase();
    assert.equal(
      [...allowedDomains].some(
        (allowed) => domain === allowed || domain.endsWith(`.${allowed}`),
      ),
      true,
      `non-reserved domain ${domain} in ${file}`,
    );
  }
}

const report = JSON.parse(
  fs.readFileSync(
    path.join(root, "examples/coverage-report.example.json"),
    "utf8",
  ),
);
assert.deepEqual(
  new Set(report.results.map((r) => r.category)),
  new Set(["A", "B", "C", "D"]),
);
for (const r of report.results) {
  if (r.category === "C" || r.category === "D")
    assert.ok(r.broker_contributor_id && r.relationship_edge_id);
  else
    assert.equal(
      "broker_contributor_id" in r || "relationship_edge_id" in r,
      false,
    );
}
const safeReport = JSON.parse(
  fs.readFileSync(
    path.join(root, "examples/safe-coverage-report.example.json"),
    "utf8",
  ),
);
assert.deepEqual(
  safeReport.findings.map((r) => r.category),
  ["A", "B", "C", "D"],
);
assert.equal(safeReport.sanitization.portable_edge_list_included, false);
assert.equal(safeReport.sanitization.raw_rows_included, false);
assert.equal(
  /contributor_broker|edge_person_casey|edge_person_devon/.test(
    JSON.stringify(safeReport),
  ),
  false,
);
for (const r of safeReport.findings.filter(
  (x) => x.category === "B" || x.category === "D",
))
  assert.equal(r.candidate_label, "review-pending coach/champion candidate");
console.log(
  `Security self-test passed: ${dangerous.length} formula variants; ${publishable.length} files scanned; ${sourceFiles.length} source files network/process-scanned; ${examples.length} synthetic example files; A-D present.`,
);
