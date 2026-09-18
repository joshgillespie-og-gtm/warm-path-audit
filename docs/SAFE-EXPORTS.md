# Safe reports, exports, and redaction

Warm Path Audit supports terminal, JSON, and CSV output. Every view is generated after current consent and suppression checks.

## Safe view

The default safe view includes:

- A-D category and exact category definition;
- destination display name and account;
- persona outcome and review status;
- review-priority and component scores with a warning;
- reason codes;
- consent and suppression status;
- aggregate evidence/provenance summaries;
- dependency counts.

For C and D, broker identity and the exact relationship edge are redacted.

The safe view excludes contributor emails, raw rows, credentials, private source metadata, portable edge lists, and guessed relationship strength.

## Reviewer view

Reviewer export requires both:

```text
--view reviewer --authorized-reviewer
```

That flag is an explicit local assertion, not authentication. The report still honors contributor disclosure permission. Deployments must put real identity, authorization, and access control around reviewer use.

## Export

```sh
node dist/cli/main.js export json \
  --db /absolute/private/workspace.db \
  --workspace workspace_acme \
  --run audit_run_id \
  --config /absolute/config/engine-config.json \
  --at 2026-09-18T12:00:00.000Z \
  --out /absolute/private/reports/coverage.json

node dist/cli/main.js export csv \
  --db /absolute/private/workspace.db \
  --workspace workspace_acme \
  --run audit_run_id \
  --config /absolute/config/engine-config.json \
  --at 2026-09-18T12:00:00.000Z \
  --out /absolute/private/reports/coverage.csv
```

Existing files are not overwritten unless `--overwrite` is provided. Output paths reject unsafe symlink behavior and files use restrictive permissions where supported.

## Spreadsheet safety

Every CSV cell is formula-neutralized, including values beginning with spreadsheet formula triggers. Consumers must still treat all exports as untrusted and keep spreadsheet external-link and macro protections enabled.

## Terminal safety

Control and escape sequences are sanitized before terminal display. Machine consumers should prefer JSON and validate it against [`safe-coverage-report.schema.json`](../schemas/output/safe-coverage-report.schema.json).

## Determinism

For the same stored run and display-time state, finding order and machine output are stable. Display-time suppression or withdrawal can change what is visible without mutating the historical run.

## Interpretation

Every report carries this caveat:

> Results are hypotheses for human review, not permission to contact.

B and D are review-pending coach/champion candidates. Scores order review and do not represent strength, influence, or consent.

## Sharing checklist

- Use safe view unless broker disclosure is essential and authorized.
- Confirm consent and suppressions at export time.
- Remove rows not needed by the recipient.
- Share through an access-controlled channel.
- Set an expiry and deletion owner.
- Track copied artifacts for withdrawal response.
- Never upload a report to a shared lead database without separate authority and purpose review.
