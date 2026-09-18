# 15-minute local demo

Warm Path Audit is credential-free and makes no network calls. Use Node.js 20+.

## Minute 0–3: verify and build

```sh
npm install
npm run check
npm run build
```

## Minute 3–6: run the complete synthetic audit

The fixture uses reserved `example.com` domains and a fixed clock. It creates one eligible finding in each category plus blocked stale and conflicted near-misses.

```sh
npm run demo
```

Expected summary:

```text
Eligible: 4  A:1 B:1 C:1 D:1
Blocked: 2  Review-only: 0  Display-invalidated: 0
```

Artifacts are written mode `0600` to `/tmp/warm-path-audit-demo/reports/`:

- `coverage-report.json`: stable machine-readable safe view
- `coverage-report.csv`: spreadsheet-safe cells with broker details redacted

B and D are always **review-pending coach/champion candidates**, never proven influence or warmth. Scores only order human review. Findings are not permission to contact.

## Minute 6–10: inspect and export

Copy the run ID printed by the demo.

```sh
node dist/cli/main.js inspect findings \
  --db /tmp/warm-path-audit-demo/workspace.db \
  --workspace workspace_demo \
  --run RUN_ID \
  --config examples/demo-engine-config.json \
  --at 2026-09-18T12:00:00.000Z
```

For a normal workspace, use `init`, `contributor add`, `consent add`, `import csv`, `review list`, `review decide`, `config validate`, and `run`. `warm-path-audit help` shows every flag. CSV imports require an absolute path, an explicit import root, and an explicit mapping.

Default exports are safe views. Reviewer exports require both `--view reviewer` and `--authorized-reviewer`, and still honor each contributor's disclosure setting. Existing files are not overwritten without `--overwrite`.

## Minute 10–13: demonstrate immediate invalidation

```sh
node dist/cli/main.js suppress add \
  --db /tmp/warm-path-audit-demo/workspace.db \
  --workspace workspace_demo \
  --kind person --value person_casey \
  --reason OPERATOR_SUPPRESSION --actor actor_demo \
  --at 2026-09-18T12:00:00.000Z
```

Re-run `inspect findings` at that clock. Category C disappears immediately from display without mutating the earlier audit run. Run the engine again at an explicit later clock to produce a new deterministic run with selective recomputation.

`consent withdraw` deletes consent-dependent source snapshots, evidence, claims, edges, and dependent findings, writes a minimal deletion receipt, and invalidates display immediately. Backups and previously copied exports remain an explicit operator action in the receipt.

## Minute 13–15: audit and guarded reset

```sh
node dist/cli/main.js inspect audit \
  --db /tmp/warm-path-audit-demo/workspace.db \
  --workspace workspace_demo --json

node dist/cli/main.js reset \
  --db /tmp/warm-path-audit-demo/workspace.db \
  --allowed-root /tmp/warm-path-audit-demo --yes
```

Reset rejects relative paths, symlinks, directories, sensitive top-level paths, and targets outside the explicit root.
