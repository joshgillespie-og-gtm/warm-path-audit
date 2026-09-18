# Operator guide

This guide describes a controlled network coverage audit. It does not authorize sourcing, outreach, enrichment, or introductions.

## Roles

- **Data owner:** approves purpose, retention, sources, and recipients.
- **Operator:** runs imports, reviews, matching, and exports.
- **Contributor:** explicitly authorizes defined use of their source data.
- **Reviewer:** resolves ambiguity and evaluates findings.
- **Security/privacy reviewer:** approves local deployment and deletion controls.

Keep these roles separate where practical.

## 1. Define the audit

Write down:

- workspace and purpose ID;
- ICP rules and named target accounts;
- stakeholder persona and candidate rules;
- allowed A-D categories;
- source kinds and collection window;
- retention period;
- who may see safe versus reviewer views;
- suppression sources;
- withdrawal and bilateral opt-in procedures.

## 2. Prepare a private workspace

Use an encrypted, access-controlled device and private directory. Do not place the database in a synced public folder or source repository.

```sh
node dist/cli/main.js init \
  --db /absolute/private/workspace.db \
  --workspace workspace_acme \
  --name "Acme network audit" \
  --owner actor_owner \
  --purpose purpose_q4_coverage \
  --at 2026-09-18T12:00:00.000Z
```

## 3. Register contributors and consent

Create contributor and consent JSON files from the schemas/examples. Explain disclosure and withdrawal before importing. Never assume consent from employment or file possession.

## 4. Import authorized CSVs

Use only user-provided exports or other files you are authorized to process. Keep each contributor's consent and snapshot separate. Validate on a small synthetic file first. See [CSV import](CSV-IMPORT.md).

## 5. Review ambiguity

List person and organization candidates. Require a named reviewer and substantive reason. Reject uncertain merges. Result volume is not a justification for weakening resolution standards.

## 6. Validate config and run

Review target/account data for private or client information before storing it. Validate engine config and policy, then run at an explicit timestamp. A changed clock can affect freshness and expiry.

## 7. Triage output

Start with blocked cases and reason codes to find data-quality problems. Then review A-D findings:

- A is a potential direct ICP lead.
- B and D are candidate-only queues.
- C is a consented path hypothesis.
- None grants contact permission.

Do not rank only by score. Inspect evidence timestamps, identity/employment status, and current consent.

## 8. Export minimally

Prefer the safe view. Export only the rows and fields needed for the recipient. Record the artifact owner, location, recipients, and deletion date. Avoid portable edge lists.

## 9. Conduct bilateral opt-in outside the tool

Before an introduction, independently confirm the broker's willingness and destination's openness. Do not paste unapproved private context into outreach.

## 10. Withdraw, suppress, and close

Apply suppressions immediately when requested. Use `consent withdraw` for contributor withdrawal, reconcile external copies/backups, and retain the minimized receipt. At pilot close, delete the local DB and reports under the approved retention plan.

## Operating cadence

For a bounded pilot:

- Before each run: recheck consent, policy effective time, config, and target list.
- After each run: inspect audit validity and blocked reasons.
- Before each export: recheck recipients, suppressions, and disclosure.
- Weekly: review stale evidence and pending resolution decisions.
- At expiry: stop collection, delete data, and document residual backups.

There is no scheduler in the reference implementation. Operators must not improvise unattended polling without a separate security review.
