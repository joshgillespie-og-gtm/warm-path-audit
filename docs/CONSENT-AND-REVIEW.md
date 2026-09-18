# Contributor consent, resolution review, and withdrawal

## Purpose-scoped consent

Each contributed source is bound to a contributor and consent record. Consent declares the workspace purpose, allowed source classes, allowed A-D categories, disclosure setting, effective period, and status.

A result is eligible only while all dependencies retain active, correctly bound consent. Consent is checked during evaluation and again during display/export.

## Recommended contributor flow

1. Explain the audit purpose, data fields, allowed result categories, retention, review/export views, and withdrawal procedure.
2. Register the contributor in the correct workspace.
3. Record explicit purpose-scoped consent.
4. Import only authorized sources.
5. Resolve ambiguity with named actors and reasons.
6. Share only the minimum report view the contributor authorized.
7. Obtain bilateral opt-in before any introduction.

Do not treat employment, team participation, an address book, or a manager's approval as individual broker consent.

## Review queues

Imports can produce person-resolution and organization-alias candidates. List them locally:

```sh
node dist/cli/main.js review list \
  --db /absolute/private/workspace.db \
  --workspace workspace_acme --json
```

Approve or reject one candidate with an accountable actor, reason, and explicit clock:

```sh
node dist/cli/main.js review decide \
  --db /absolute/private/workspace.db \
  --workspace workspace_acme \
  --candidate candidate_id \
  --decision approve \
  --actor actor_reviewer \
  --reason "Verified against authorized internal record" \
  --at 2026-09-18T12:00:00.000Z
```

Review decisions are immutable. Organization-alias authorization is checked against the stored candidate and exact source/canonical organization, alias kind/value, workspace, actor, reason, and time. A config string alone cannot authorize an alias.

## Suppression

A suppression can apply to a person, organization, domain, source kind, snapshot, category, or available CRM state.

```sh
node dist/cli/main.js suppress add \
  --db /absolute/private/workspace.db \
  --workspace workspace_acme \
  --kind person --value person_id \
  --reason OPERATOR_SUPPRESSION \
  --actor actor_operator \
  --at 2026-09-18T12:00:00.000Z
```

Display-time checks hide affected prior findings immediately. A later run creates a new trace; it does not rewrite the prior audit.

## Withdrawal

```sh
node dist/cli/main.js consent withdraw \
  --db /absolute/private/workspace.db \
  --workspace workspace_acme \
  --consent consent_id \
  --actor actor_operator \
  --reason "Contributor requested withdrawal" \
  --at 2026-09-18T12:00:00.000Z --json
```

Withdrawal deletes consent-dependent snapshots, evidence, claims, edges, and dependent findings, then writes a minimized deletion receipt. Unrelated workspace results are preserved.

## Limits of deletion

Withdrawal cannot recall:

- reports already copied or shared;
- raw exports retained outside the tool;
- operating-system or cloud backups;
- screenshots or downstream systems;
- provider-side source data.

Document these residuals in the deletion receipt and complete the operator's external deletion checklist. Avoid unnecessary exports in the first place.

## Bilateral opt-in

A C or D result may identify a plausible broker path. It does not authorize disclosure or contact. Before an introduction:

1. Ask the broker privately whether they are willing to help in this specific context.
2. Ask the destination whether they are open to the introduction, directly or through an approved process.
3. Share only mutually approved context.
4. Do not automate either side's consent.
