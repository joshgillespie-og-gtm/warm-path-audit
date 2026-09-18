# CSV import and mapping

Warm Path Audit accepts **user-provided exports that the operator is authorized to use**. A LinkedIn Connections CSV is one possible input. The project does not log into LinkedIn, automate a browser, scrape profiles, call private APIs, fetch imported URLs, or help bypass provider controls.

## Input requirements

The importer accepts an absolute path to an uncompressed, regular UTF-8 CSV beneath an explicit import root. An optional UTF-8 BOM and up to 100 preamble lines are supported for common export formats.

Default ceilings:

| Limit       | Default |
| ----------- | ------: |
| File        | 100 MiB |
| Data rows   | 100,000 |
| Logical row |   1 MiB |
| Field       | 256 KiB |
| Columns     |     256 |
| Errors      |   1,000 |

Files outside the approved root, symlinks, duplicate normalized headers, invalid UTF-8, excessive fields, oversized rows, and malformed quoted records fail closed. Parsing and SHA-256 hashing are incremental. Raw source retention is disabled after private staging.

## Mapping

Mappings declare required source headers, target fields, transforms, limits, and `network_behavior: "never_fetch"`. Start with [`examples/import-mapping.example.json`](../examples/import-mapping.example.json).

The canonical target vocabulary includes names, authorized identifiers, company name/domain, title, connected date, and inert profile URL evidence. Unknown columns are ignored when the mapping says so.

Example excerpt:

```json
{
  "source_kind": "linkedin_connections_export",
  "header": {
    "mode": "detect_required_headers",
    "required_source_headers": [
      "First Name",
      "Last Name",
      "Company",
      "Position"
    ]
  },
  "columns": [
    {
      "source_header": "First Name",
      "target_field": "first_name",
      "transforms": ["trim", "unicode_nfkc", "control_character_reject"]
    },
    {
      "source_header": "Company",
      "target_field": "company_name",
      "transforms": ["trim", "unicode_nfkc", "control_character_reject"]
    }
  ],
  "network_behavior": "never_fetch"
}
```

Use an exact copy of the full example as a starting point; the excerpt is not a complete mapping.

## Import command

Before importing, create a workspace, register a contributor, and register an active consent record that allows the source kind and intended result categories.

```sh
node dist/cli/main.js import csv \
  --db /absolute/private/workspace.db \
  --workspace workspace_acme \
  --contributor contributor_jane \
  --consent consent_jane_network_audit \
  --source-kind linkedin_connections_export \
  --mapping /absolute/config/import-mapping.json \
  --file /absolute/imports/Connections.csv \
  --import-root /absolute/imports \
  --actor actor_operator \
  --at 2026-09-18T12:00:00.000Z
```

The source kind must be authorized by consent and consistent with the mapping.

## Materialized records

An accepted row can create workspace-scoped:

- source snapshot metadata and evidence references;
- person and identity claims;
- organization claims;
- employment claims;
- explicit relationship edges when the source semantics and consent permit them;
- person or organization review candidates for ambiguity.

The importer does not silently turn similar names, shared addresses, titles, subsidiaries, or co-employment into a resolved identity or relationship.

## Formula and terminal safety

CSV report exports neutralize spreadsheet formulas in every cell. Terminal output escapes control sequences. These output protections do not make source files safe to distribute; keep raw exports private and delete them according to policy.

## Operational checklist

- Confirm you are allowed to use the export for the stated purpose.
- Copy it into a private, access-controlled import directory.
- Use an explicit contributor and purpose-scoped consent record.
- Validate mapping and source headers before a production-sized import.
- Review ambiguity candidates before matching.
- Keep backups and copied exports in the withdrawal/retention procedure.
- Never commit real exports, generated databases, or reports.
