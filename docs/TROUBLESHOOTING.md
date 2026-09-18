# Troubleshooting

## `MISSING_FLAG`

Run `node dist/cli/main.js help` and supply the named flag. Prefer absolute paths and explicit ISO 8601 timestamps with offsets.

## Path rejected

Imports must be uncompressed regular files beneath the explicit `--import-root`. Database/reset/export paths reject unsafe targets and symlinks. Move the file into a private approved directory rather than weakening path checks.

## Header collision or required header missing

Header comparison applies Unicode normalization, trimming, and case folding. Remove duplicate/confusable columns and update the mapping to the exact authorized source format.

## Invalid UTF-8 or oversized input

Re-export as UTF-8 CSV without compression. Do not raise limits before inspecting the file. Split very large exports and test with synthetic data first.

## Cross-workspace denied

The workspace ID in contributor, consent, config, policy, adapter authorization, and records must match the CLI workspace. Do not copy internal IDs between workspaces.

## Consent or purpose blocked

Check:

- consent status and expiry;
- contributor status;
- purpose ID;
- allowed source kind;
- allowed A-D category;
- disclosure permission;
- policy effective time.

Do not change consent retroactively just to make a result appear.

## Identity or organization unresolved

Use `review list` and inspect the authorized evidence. Approve only when the candidate is unambiguous. Names, titles, shared emails, similar domains, and subsidiaries are insufficient by themselves.

## No A-D findings

Inspect blocked and review-only candidates, then verify:

- current employment evidence;
- explicit relationship edges for C/D;
- ICP/persona rule values;
- exact target organization IDs;
- approved aliases;
- suppressions and exclusions;
- evidence freshness.

A result count of zero can be correct.

## Finding disappeared

Display-time revalidation intentionally removes findings after consent expiry/withdrawal, contributor deactivation, or suppression. The historical audit run remains traceable.

## Reviewer export is still redacted

Both `--view reviewer` and `--authorized-reviewer` are required, and the contributor must permit disclosure. The CLI flag is not a way to override contributor policy.

## Output already exists

Exports refuse overwrite by default. Choose a new private path or intentionally pass `--overwrite` after reviewing the destination.

## Audit chain invalid

Stop using the workspace for decisions. Preserve the database read-only, compare backups, and investigate possible corruption or unsupported concurrent writes. Do not rewrite events to make validation pass.

## Native SQLite installation fails

Use a supported Node.js 20+ environment with build tooling compatible with `better-sqlite3`, or a platform with a matching prebuilt binary. Re-run `npm install`, then `npm run check`.

## Provider connector expected

Production Attio, HubSpot, Salesforce, email, and calendar connectors are not implemented. Provider mappings in documentation are illustrative. Use CSV or the local synthetic fixture unless you independently build and security-review an adapter against the contracts.
