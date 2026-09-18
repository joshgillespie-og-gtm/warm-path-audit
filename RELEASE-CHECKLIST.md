# v0.1.0 private release checklist

This checklist separates locally verified behavior from later publication and production decisions. It does not authorize an external action.

## Candidate identity and boundaries

- [x] Package name is `warm-path-audit` and version is `0.1.0`.
- [x] `private: true` remains set; npm publication is blocked by metadata.
- [x] Apache-2.0 license file and package metadata agree.
- [x] ESM root export, type declaration, and `warm-path-audit` CLI bin are declared.
- [x] Package allowlist contains only runtime build output, schemas, synthetic examples, user docs, license, changelog, release notes, security, support, and governance files.
- [x] No Git repository, remote, commit, tag, release, or registry publication exists.

## Verified local capabilities

- [x] Formatting, lint, typecheck, tests, schema/example validation, docs links, and security self-test pass.
- [x] Clean TypeScript build passes.
- [x] Dependency audit reports no vulnerabilities at `--audit-level=low`.
- [x] Source scan finds no runtime network client, browser automation, WebSocket, or child-process primitive.
- [x] Focused credential/private-key scan passes.
- [x] Synthetic demo is deterministic with A:1/B:1/C:1/D:1 and two blocked near-misses.
- [x] npm tarball installs in a clean local project with lifecycle scripts enabled.
- [x] Installed CLI help, demo, and ESM library import pass.
- [x] npm tarball and source ZIP are rebuilt twice and compared for byte identity where feasible.
- [x] SHA-256 sums, archive listings, sizes, manifest, and validation logs accompany the artifacts.

## Explicit production gaps

- [ ] At-rest encryption is not implemented; local SQLite is plaintext.
- [ ] Multi-process/concurrent-writer behavior is not production-qualified.
- [ ] Production provider adapters, authentication, revocation, rate limiting, tenant controls, and provider-specific reviews do not exist.
- [ ] Native `better-sqlite3` installation compatibility is not guaranteed for every platform.
- [ ] Production-volume performance and disk-space benchmarks do not exist.
- [ ] Reviewer identity, RBAC, MFA, and cryptographic approval signatures do not exist.
- [ ] Withdrawal cannot delete backups, copied reports, or external copies.
- [ ] No legal opinion or regulatory/platform compliance certification has been obtained.
- [ ] Findings remain human-review hypotheses and never confer permission to contact or introduce.

## Human publication gate, not approved here

- [ ] Approve or change project/package/repository name after final naming and trademark review.
- [ ] Choose repository owner and confirm public visibility.
- [ ] Confirm Josh Gillespie attribution and Apache-2.0 licensing for publication.
- [ ] Confirm release version `v0.1.0` and whether to publish GitHub source/release assets now.
- [ ] Decide whether commit and tag must be signed and what provenance/checksum policy applies.
- [ ] Decide whether npm publication is in scope; if yes, remove `private` only after registry ownership, access, 2FA, and trusted publishing/provenance are configured and reverified.
- [ ] Confirm whether production limitations are acceptable in README/release language without adding connector or compliance claims.
- [ ] Explicitly authorize the specific external publication actions. Until then, do nothing externally.
