# Warm Path Audit v0.1.0 release notes

**Status:** approved for the public GitHub `v0.1.0` release. The npm package remains private and unpublished.

Warm Path Audit v0.1.0 is a local-first reference implementation for auditing where authorized professional-network evidence overlaps an ICP and named target accounts. It emits four explainable classes of human-review hypotheses and makes no network calls, outreach actions, or CRM mutations.

## Verified local capabilities

- Imports explicitly mapped, user-provided CSV data only after workspace, purpose, contributor, active-consent, expiry, and source-scope checks.
- Stores workspace-scoped evidence in local SQLite with restrictive file modes.
- Resolves people and organizations conservatively, routing ambiguity to review rather than silently merging.
- Evaluates deterministic classes A-D with evidence, reason codes, policy/config hashes, consent dependencies, and stable ordering.
- Revalidates consent and suppressions at display time; withdrawal removes consent-dependent local material and emits a receipt.
- Produces safe terminal, JSON, and CSV output. Broker identity and exact edges are redacted by default.
- Includes a credential-free fixture adapter contract and deterministic synthetic demo.
- Includes no HTTP client, provider SDK, browser automation, child-process execution, outreach path, CRM write path, or shared global graph.

The release audit disposition is **PASS WITH PRODUCTION LIMITATIONS**. The private validation baseline is 13 test files / 91 tests, 14 schemas / 12 JSON examples, 29 Markdown files / 74 local links / 3 Mermaid blocks, and 117 repository files / 25 source files in the security and network/process scan. The demo yields A:1, B:1, C:1, D:1 and two blocked near-misses.

## Production gaps and non-claims

1. SQLite is local and unencrypted. Use an encrypted volume for sensitive data.
2. The implementation assumes one local operator/process; concurrent writers are not production-qualified.
3. Only a credential-free local fixture adapter ships. There is no production Attio, HubSpot, Salesforce, email, or calendar connector.
4. `better-sqlite3` needs a compatible native prebuild or build toolchain. Installing with `--ignore-scripts` cannot support SQLite CLI operations.
5. Production-scale throughput, memory, and disk use are unbenchmarked.
6. Reviewer identity is asserted by the caller; there is no RBAC, MFA, OS identity binding, or cryptographic approval signature.
7. Withdrawal cannot prove deletion from backups, copied exports, or external systems.
8. The threat model is engineering guidance, not legal advice or compliance certification.
9. Findings are hypotheses, not proof of current employment, relationship quality, influence, willingness, or permission to contact. Any introduction requires bilateral human opt-in outside the tool.
10. GitHub publication does not make this production-qualified or authorize npm distribution.

## Distribution and provenance

The npm artifact remains intentionally marked `private: true` and is distributed only as a GitHub release asset for local verification. Install the local tarball with lifecycle scripts enabled so `better-sqlite3` can install. Node.js 20 or newer is required.

The initial `v0.1.0` commit and tag are intentionally unsigned under the approved release policy. Future releases are expected to use cryptographic commit and tag signing. A fresh practical naming collision review is recorded in [NAME-REVIEW.md](NAME-REVIEW.md); it is not legal trademark clearance.

## Security fixes included

This candidate prevents terminal consent reactivation/widening, treats source snapshots and adapter metadata as immutable, checks full import authorization, strictly validates adapter pages and materializes them transactionally, validates consent chronology, protects report/reset operations from unsafe symlink/hardlink shapes, and executes correctly through npm's bin symlink.

See [AUDIT.md](AUDIT.md), [SECURITY.md](SECURITY.md), and [docs/PRODUCTION-BOUNDARIES.md](docs/PRODUCTION-BOUNDARIES.md) for the full boundary.
