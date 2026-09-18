# Changelog

All notable changes to Warm Path Audit are documented here.

## [0.1.0] - 2026-09-18

### Added

- Local-first TypeScript and SQLite audit core with deterministic identifiers, canonical hashes, workspace isolation, and append-only audit events.
- Bounded mapped CSV ingestion, synthetic examples, strict JSON Schemas, conservative identity and organization resolution, and review queues.
- Deterministic A-D network coverage evaluation for direct ICP leads, target-account coach/champion candidates, and broker-path hypotheses.
- Purpose-scoped contributor consent, expiry, withdrawal, suppressions, deletion receipts, and display-time eligibility checks.
- Safe terminal, JSON, and CSV reporting with broker redaction, spreadsheet neutralization, and restrictive output permissions.
- Credential-free CLI and deterministic synthetic demo.
- Vendor-neutral read-only adapter contracts and a local fixture adapter. No production connector or network client is included.
- Public-facing architecture, operator, privacy, security, contribution, support, and governance documentation.

### Security hardening

- Prevented terminal consent reactivation, consent widening, and contributor reactivation.
- Made source snapshots and adapter metadata immutable after creation.
- Enforced complete workspace, purpose, contributor, consent-state, expiry, and source-scope authorization during import.
- Added strict bounded adapter-page validation and transactional provenance/domain materialization.
- Rejected unsafe report/reset symlink and hardlink shapes.
- Added consent chronology and terminal-state consistency validation.
- Corrected packaged CLI execution through npm-created bin symlinks.

### Production limitations

This release candidate remains local reference software. SQLite is unencrypted, concurrent writers are not production-tested, adapters are fixture-only, `better-sqlite3` requires native installation support, scale is unbenchmarked, reviewer identity is asserted without RBAC, deletion cannot cover backups or copied exports, and no legal/compliance certification is provided. Findings are review hypotheses, not verified warmth or permission to contact. See [RELEASE-NOTES.md](RELEASE-NOTES.md) and [AUDIT.md](AUDIT.md).
