# Privacy and security guide

This document summarizes operational controls. It is not legal advice or a compliance certification. Review [`THREAT-MODEL.md`](../THREAT-MODEL.md) and [`PRIVACY-BOUNDARIES.md`](../PRIVACY-BOUNDARIES.md) for the detailed model.

## Data minimization

Collect only fields needed for the declared coverage purpose. Avoid email bodies, calendar titles/descriptions, attachments, transcripts, personal notes, credentials, and portable relationship graphs. Adapter contracts intentionally omit content fields.

Imported profile URLs remain inert evidence strings. The system never dereferences them.

## Local-first does not mean risk-free

The SQLite database is plaintext. Restrictive file modes do not replace:

- full-disk encryption;
- OS account separation;
- endpoint security and patching;
- encrypted, access-controlled backups;
- secret management around any future connector;
- retention and deletion procedures;
- incident response.

Do not run real data on an unmanaged personal device merely because the tool is local.

## Key controls

| Risk                           | Reference control                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Hostile CSV                    | Strict UTF-8, bounded bytes/rows/fields, duplicate-header rejection, private staging |
| Spreadsheet/terminal injection | Formula neutralization and terminal-control sanitization                             |
| Identity collision             | Conservative exact-identifier rules and human review                                 |
| Bad organization alias         | Same-workspace immutable, fully bound approval                                       |
| Cross-workspace access         | Workspace checks in stores, services, adapters, and tests                            |
| Consent drift                  | Purpose/source/category/expiry checks at evaluation and display                      |
| Broker disclosure              | Safe-view redaction and contributor disclosure permission                            |
| Replay or duplicate input      | Stable source IDs, digests, cursor checks, and idempotency                           |
| Unsafe deletion                | Guarded reset, dependency-aware withdrawal, minimized receipts                       |
| External side effects          | No network client, provider connector, send path, or CRM mutation path               |

## Sensitive artifacts

Never commit or publish:

- real contact exports;
- contributor JSON or consent records;
- target account lists tied to a client;
- SQLite databases, WAL, or SHM files;
- generated reports;
- API tokens, OAuth credentials, or environment files;
- proprietary Consigliere data or managed brokering records.

Synthetic fixtures must use reserved example domains and fictional people.

## Authorization

The CLI is not a multi-user authentication service. `--authorized-reviewer` is an operator assertion, not identity proof. Production use requires access control around the machine, directories, CLI invocation, report distribution, and any wrapper service.

Adapter authorizations bind workspace, provider tenant, purpose, capability, exact field allowlist, collection window, expiry/revocation, and contributor consent. The current executable adapter is a network-free local fixture only.

## Retention and withdrawal

Choose a short documented retention period. Raw-source retention is disabled inside the importer, but the original source file remains the operator's responsibility. Withdrawal removes dependent local entities and findings, while copied reports and backups require separate reconciliation.

## Incident response minimum

1. Stop imports, runs, and exports.
2. Preserve only security logs needed for investigation; avoid copying personal data.
3. Identify affected workspace, artifacts, recipients, and backups.
4. Revoke access and connector authorization where applicable.
5. Notify the data owner and follow applicable contractual/legal procedures.
6. Delete unnecessary investigation copies.
7. Document cause, remediation, and prevention without publishing personal data.

## Vulnerability reporting

Follow [`SECURITY.md`](../SECURITY.md). Do not open a public issue containing real people, exports, credentials, exploit details, or relationship data.
