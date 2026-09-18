#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats");

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const schemaFiles = walk(path.join(root, "schemas"))
  .filter((f) => f.endsWith(".schema.json"))
  .sort();
const schemas = schemaFiles.map(readJson);
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
addFormats(ajv);
for (const schema of schemas) ajv.addSchema(schema);
for (const schema of schemas) ajv.validateSchema(schema, true);

const bindings = new Map([
  [
    "import-mapping.example.json",
    "https://example.com/warm-path-audit/schemas/import/import-mapping.schema.json",
  ],
  [
    "source-snapshot.example.json",
    "https://example.com/warm-path-audit/schemas/import/source-snapshot.schema.json",
  ],
  [
    "consent-record.example.json",
    "https://example.com/warm-path-audit/schemas/policy/consent-record.schema.json",
  ],
  [
    "policy-config.example.json",
    "https://example.com/warm-path-audit/schemas/policy/policy-config.schema.json",
  ],
  [
    "audit-config.example.json",
    "https://example.com/warm-path-audit/schemas/policy/audit-config.schema.json",
  ],
  [
    "adapter-authorization.example.json",
    "https://example.com/warm-path-audit/schemas/policy/adapter-authorization.schema.json",
  ],
  [
    "adapter-record.example.json",
    "https://example.com/warm-path-audit/schemas/adapter/adapter-record.schema.json",
  ],
  [
    "engine-config.example.json",
    "https://example.com/warm-path-audit/schemas/policy/engine-config.schema.json",
  ],
  [
    "engine-policy.example.json",
    "https://example.com/warm-path-audit/schemas/policy/engine-policy.schema.json",
  ],
  [
    "coverage-report.example.json",
    "https://example.com/warm-path-audit/schemas/output/coverage-report.schema.json",
  ],
  [
    "deletion-receipt.example.json",
    "https://example.com/warm-path-audit/schemas/output/deletion-receipt.schema.json",
  ],
  [
    "safe-coverage-report.example.json",
    "https://example.com/warm-path-audit/schemas/output/safe-coverage-report.schema.json",
  ],
]);
let validated = 0;
for (const [name, schemaId] of bindings) {
  const file = path.join(root, "examples", name);
  const validate = ajv.getSchema(schemaId);
  const value = readJson(file);
  if (!validate(value)) {
    console.error(`${name}: INVALID`);
    console.error(JSON.stringify(validate.errors, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`${name}: valid`);
    validated += 1;
  }
}
if (!process.exitCode)
  console.log(
    `Validated ${schemas.length} schemas and ${validated} JSON examples.`,
  );
