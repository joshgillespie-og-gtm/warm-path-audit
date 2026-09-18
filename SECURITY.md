# Security policy

## Supported versions

Warm Path Audit is pre-release software. Until a stable release policy is published, only the latest tagged release is eligible for security fixes. Local development snapshots are unsupported.

## Reporting a vulnerability

Use GitHub private vulnerability reporting if it is enabled for the repository. Do not open a public issue containing exploit details, credentials, real contact data, private exports, relationship edges, target lists, or generated databases/reports.

If private vulnerability reporting is not available, contact the maintainer through a private channel listed on the repository profile without including sensitive details in the first message. Ask for an encrypted or otherwise appropriate reporting route.

Include when safe:

- affected version and commit;
- minimal synthetic reproduction;
- security impact and boundary crossed;
- whether network access or real data was involved;
- suggested remediation.

Never send real customer or contributor data as proof.

## Response targets

This is a community project with no SLA. Maintainers aim to acknowledge valid reports within seven days, provide a triage update within 14 days, and coordinate disclosure after a fix. These are goals, not guarantees.

## Scope

High-priority areas include workspace isolation, consent/withdrawal bypass, unsafe broker disclosure, import/path traversal, SQLite/reset safety, audit-chain integrity, formula/terminal injection, adapter authorization, dependency rebinding, and secret/private-data leakage.

Provider accounts, social engineering, third-party platforms, and production wrappers not shipped by this repository are outside scope, though connector-contract weaknesses are welcome.

## Safe research

Use synthetic fixtures and local environments. Do not access data you do not own or have permission to test, degrade services, scrape providers, send outreach, or publish personal information.

## Security posture

The reference implementation is local and has no executable network client or external mutation path. SQLite is plaintext, the CLI does not provide multi-user authentication, and production provider connectors are not implemented. See [`docs/PRIVACY-SECURITY.md`](docs/PRIVACY-SECURITY.md) and [`docs/PRODUCTION-BOUNDARIES.md`](docs/PRODUCTION-BOUNDARIES.md).
