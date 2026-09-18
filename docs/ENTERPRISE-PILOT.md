# Enterprise pilot checklist

Use this checklist for a small, time-bounded, read-only pilot. It is not a compliance certification.

## Scope and ownership

- [ ] Executive/data owner is named.
- [ ] Purpose ID and written purpose are approved.
- [ ] Pilot dates, retention, success criteria, and stop conditions are defined.
- [ ] Operators, reviewers, contributors, report recipients, and deletion owner are named.
- [ ] A-D categories and target list scope are approved.
- [ ] No outreach, CRM writes, enrichment, or autonomous introduction is in scope.

## Data and consent

- [ ] Every source is user-provided or otherwise authorized.
- [ ] Every contributor receives a clear notice and withdrawal path.
- [ ] Consent captures purpose, source classes, categories, duration, and disclosure.
- [ ] Provider terms, employment policy, privacy obligations, and contracts are reviewed.
- [ ] Real data never enters source control, issue trackers, or public logs.

## Environment

- [ ] Managed endpoint with full-disk encryption and current patches.
- [ ] Dedicated private directory with least-privilege OS access.
- [ ] SQLite DB and reports excluded from sync/public backup or protected appropriately.
- [ ] Approved backup, recovery, and withdrawal reconciliation procedure.
- [ ] Node.js and dependencies are pinned and scanned.

## Configuration and testing

- [ ] `npm run check`, build, and audit pass in the pilot environment.
- [ ] Full synthetic demo passes before real data.
- [ ] CSV mapping is reviewed against the real header set using minimized samples.
- [ ] ICP, persona, coach-candidate, target, freshness, and suppression rules are signed off.
- [ ] Policy workspace, purpose, effective time, and categories are correct.
- [ ] Reviewer tests a known block, consent expiry, suppression, and withdrawal.

## Operation

- [ ] Imports are separated by contributor and consent record.
- [ ] Ambiguous identities and aliases are reviewed by a named actor with a reason.
- [ ] Blocks are investigated before eligible queues.
- [ ] B and D remain candidate-only labels.
- [ ] Scores are not described as warmth, influence, or willingness.
- [ ] Safe export is the default; reviewer disclosure is exceptional and authorized.
- [ ] Every copied report has owner, recipients, location, and deletion date.

## Introduction policy

- [ ] C/D are treated as path hypotheses only.
- [ ] Broker willingness is confirmed for the specific context.
- [ ] Destination openness is confirmed through an approved process.
- [ ] Only mutually approved context is shared.
- [ ] No automated LinkedIn messaging or introduction sending is used.

## Closeout

- [ ] New imports and exports are stopped.
- [ ] Contributors are informed of closeout as promised.
- [ ] Local database, raw exports, reports, and staging files are deleted per policy.
- [ ] Backups and copied artifacts are reconciled.
- [ ] Minimal deletion receipts and non-personal lessons learned are retained.
- [ ] Any incident is handled under the organization's process.
