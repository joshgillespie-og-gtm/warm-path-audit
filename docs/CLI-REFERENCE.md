# CLI reference

Build before using the local CLI:

```sh
npm run build
node dist/cli/main.js help
```

All paths should be absolute. All commands are local and credential-free. Use `--json` where supported for machine-readable output.

## `init`

Create a private local workspace.

```sh
node dist/cli/main.js init --db PATH --workspace ID --name NAME --owner ACTOR --purpose ID --at ISO
```

## `contributor add`

Register a contributor from a JSON file conforming to the domain schema.

```sh
node dist/cli/main.js contributor add --db PATH --workspace ID --file contributor.json --actor ID --at ISO
```

The JSON workspace must match `--workspace`.

## `consent add`

Register purpose-scoped consent.

```sh
node dist/cli/main.js consent add --db PATH --workspace ID --file consent.json --actor ID --at ISO
```

See [`consent-record.example.json`](../examples/consent-record.example.json).

## `consent withdraw`

Withdraw consent and remove dependent local data.

```sh
node dist/cli/main.js consent withdraw --db PATH --workspace ID --consent ID --actor ID --reason TEXT --at ISO [--json]
```

Returns a minimized deletion receipt.

## `import csv`

```sh
node dist/cli/main.js import csv \
  --db PATH --workspace ID --contributor ID --consent ID \
  --source-kind KIND --mapping mapping.json --file data.csv \
  --import-root DIR --at ISO [--actor ID] [--json]
```

Optional `--mapping-id` and `--mapping-version` override CLI defaults. The input must be a regular UTF-8 file beneath `--import-root`. See [CSV import](CSV-IMPORT.md).

## `review list`

```sh
node dist/cli/main.js review list --db PATH --workspace ID [--json]
```

Lists pending person-resolution and organization-alias candidates.

## `review decide`

```sh
node dist/cli/main.js review decide \
  --db PATH --workspace ID --candidate ID --decision approve|reject \
  --actor ID --reason TEXT --at ISO [--json]
```

Decisions are immutable and audited.

## `config validate`

```sh
node dist/cli/main.js config validate --config config.json --policy policy.json [--json]
```

Checks runtime schemas and cross-workspace consistency.

## `run`

```sh
node dist/cli/main.js run \
  --db PATH --workspace ID --config config.json --policy policy.json \
  --at ISO [--actor ID] [--json]
```

Reports eligible, blocked, and review-only counts. Save the audit run ID.

## `inspect`

```sh
node dist/cli/main.js inspect findings|blocked|dependencies|consent|suppressions|audit|receipts \
  --db PATH --workspace ID [--run ID --config FILE --at ISO] [--json]
```

`findings`, `blocked`, and `dependencies` need the run/config/clock fields. `audit` verifies the hash chain.

## `suppress add`

```sh
node dist/cli/main.js suppress add \
  --db PATH --workspace ID --kind KIND --value VALUE --reason CODE \
  --actor ID --at ISO [--expires ISO]
```

Supported kinds are constrained by the runtime suppression schema.

## `suppress remove`

```sh
node dist/cli/main.js suppress remove \
  --db PATH --workspace ID --suppression ID --actor ID --reason TEXT --at ISO
```

Removal is audited.

## `export json|csv`

```sh
node dist/cli/main.js export json|csv \
  --db PATH --workspace ID --run ID --config FILE --at ISO --out PATH \
  [--view safe|reviewer] [--authorized-reviewer] [--overwrite] [--actor ID]
```

Safe is the default. Reviewer view requires `--authorized-reviewer` and still honors contributor disclosure permission. See [safe exports](SAFE-EXPORTS.md).

## `demo`

```sh
node dist/cli/main.js demo --db PATH --reports DIR [--overwrite]
```

Runs the fixed-clock synthetic A-D scenario. `npm run demo` supplies paths under `/tmp`.

## `reset`

```sh
node dist/cli/main.js reset --db PATH --allowed-root DIR --yes
```

Reset rejects relative paths, symlinks, directories, sensitive top-level paths, and targets outside the explicit root. It removes the database and SQLite sidecars; it does not delete copied reports or backups.

## Exit and error behavior

The CLI exits nonzero and writes a sanitized error for invalid input or a failed hard boundary. Error codes are intended for operators and tests but are not yet a versioned external API. Try the same operation on synthetic data before automating it.
