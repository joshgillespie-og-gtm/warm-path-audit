# Adversarial Audit

**Project:** Warm Path Audit  
**Audit date:** 2026-09-18  
**Scope:** local repository through the documented public release boundary  
**Disposition:** **PASS WITH PRODUCTION LIMITATIONS**

## Executive conclusion

The release candidate is fit to proceed to private release-candidate assembly. It is not a hosted multi-user service, a production credential broker, an outreach system, or a system of record. No Git repository, remote, tag, release, npm publication, external adapter call, CRM mutation, or outreach action was created during this audit.

The audit found and fixed release-relevant defects in repository immutability, consent scope enforcement, output/reset path safety, adapter page validation, adapter transaction consistency, consent chronology, and packaged CLI execution. The complete verification matrix is green after correction.

## Severity-ranked findings and fixes

### High - consent records could be widened or reactivated by generic upsert

**Attack:** overwrite a persisted consent record with added source classes, altered binding, or an active state after withdrawal.  
**Impact:** imported evidence or findings could regain eligibility without a fresh, explicit consent grant.  
**Fix:** both in-memory and SQLite repositories now reject source/category widening, contributor/purpose/authorization rebinding, and terminal-to-active reactivation. Contributor reactivation is also denied. Legitimate narrowing and active-to-terminal lifecycle updates remain possible.  
**Regression coverage:** `tests/adversarial-audit.test.ts` exercises both repository implementations.

### High - provenance and adapter metadata were mutable

**Attack:** replace an existing source snapshot or adapter metadata record under the same deterministic ID.  
**Impact:** provenance could be rebound after downstream evidence and results were created.  
**Fix:** `source_snapshot` and `adapter_metadata_record` now join evidence refs and review decisions as immutable repository entities. Duplicate identical writes remain idempotent.

### High - private report writes and reset accepted hardlink/symlink escape shapes

**Attack:** point an allowed output parent through a symlink, overwrite a multiply linked regular file, or reset a hardlinked database/unsafe SQLite sidecar.  
**Impact:** a local operator could unintentionally overwrite or delete a file outside the intended workspace boundary.  
**Fix:** report writing now checks the canonical parent after directory creation, rejects parent escapes, symlinks, non-regular files, and link counts other than one. Reset rejects hardlinked DB files and unsafe `-wal`/`-shm` sidecars. Files remain mode `0600`; report directories remain `0700`.  
**Regression coverage:** parent symlink escape, hardlink overwrite, and hardlink reset tests.

### Medium - CSV import checked consent identity but not the full authorization scope

**Attack:** import an allowed contributor's data using a purpose-mismatched consent, an inactive contributor, or an unconsented source class.  
**Impact:** source data could enter a workspace outside the recorded authorization scope.  
**Fix:** import now requires workspace-purpose binding, active contributor state, active/non-withdrawn/non-expired consent at the import clock, and compatible source-class coverage. Existing documented connection-export aliases remain narrowly supported.

### Medium - adapter pages were insufficiently defensive at the ingest boundary

**Attack:** return malformed pages, over-limit record arrays, or inconsistent provider records.  
**Impact:** a faulty future provider implementation could bypass bounded-page expectations or create partial provenance.  
**Fix:** every page is runtime-parsed with the strict page schema, record count is checked against the requested bound, cursor loops remain rejected, and metadata/provenance/domain materialization now occurs in one repository transaction. The contract statically and dynamically requires `networkAccessed: false`; this is an audit-only local fixture boundary, not a network connector.

### Medium - consent chronology/status combinations were underconstrained

**Attack:** persist a consent whose grant occurred after expiry, an active consent carrying withdrawal metadata, or a withdrawn consent without a withdrawal timestamp.  
**Impact:** runtime eligibility could become ambiguous at exact boundaries.  
**Fix:** the domain schema now validates chronology and terminal-state consistency and rejects duplicate source/category grants. Equality of grant and expiry remains schema-valid but never evaluates active, preserving existing exact-boundary tests.

### Medium - installed CLI silently did nothing through npm's symlink

**Attack:** install the packed tarball in a clean project and invoke `node_modules/.bin/warm-path-audit`.  
**Impact:** immediate usability failure despite source-tree tests passing.  
**Fix:** CLI entrypoint detection now compares canonical real paths, so npm's bin symlink executes correctly while library import stays side-effect free.

### Low - broad secret regex produced expected false positives

A deliberately broad base64/hash scan flagged package-lock integrity values, synthetic SHA-256 examples, a GitHub URL, and security documentation terms. A focused credential/key scan excluding expected hash fixtures and the lockfile found no credentials or private keys. This is documented rather than weakened in the project's built-in self-test.

## Verification evidence

- `npm run check`: passed
  - format, lint, TypeScript, tests, schemas, security self-test, documentation links
- Tests: **13 files / 91 tests passed**
- Schemas/examples: **14 schemas / 12 JSON examples valid**
- Documentation after release-candidate assembly: **32 Markdown files / 82 local links / 3 Mermaid blocks**
- Security self-test after release-candidate assembly: **13 formula variants / 121 files / 25 source files scanned for network/process APIs / 17 synthetic example files**
- Build: passed
- Dependency audit: **0 vulnerabilities** at `--audit-level=low`
- Runtime source scan: no HTTP clients, `fetch`, browser automation, WebSocket, or child-process execution in `src`
- Focused secret scan: no credentials/private keys
- Demo: exact expected distribution **A:1, B:1, C:1, D:1**, plus 2 blocked near misses
- Determinism: two fresh demo runs produced byte-identical JSON and CSV
  - CSV SHA-256: `dc7deca11660c76736686e4fb66dd66680c8ff41faf363a48b166b402daa840f`
  - JSON SHA-256: `c20d0cc6a72758f43f6a2157b57a81ec04edc5ac9ea8fa0abef2a7d9cbe8aee5`
- Private modes: DB `0600`, report files `0600`, report directory `0700`
- Clean tarball install: CLI help, demo, and package library import passed with install scripts enabled
- Final v0.1.0 package archive: **159 entries**, **142,533 bytes packed**, **723,856 bytes unpacked**
- Archive inspection: no `.env`, `.git`, `node_modules`, `tests`, `src`, DB/SQLite, reports, PEM, or key files
- Package SHA-1: `2465812f19b3ea35ef75efe4f0ce93fb7987f83a`
- Package SHA-256: `944fe697b1edd0bc762d5689386bca39c0e0b8e28f9016ae1b8a5657df29dbba`
- Package integrity: `sha512-c5H/xmYW33I0R10hlHAx5TFJ5aDDhD03kdg0rFj8YTMWGedRZihltoNSkEoWAYmWCqIcDhUjZMpIztl1qR12jw==`

## Invariants rechecked

- Workspace-scoped storage and foreign-reference validation
- No result eligibility from score alone
- Conservative identity/org resolution with explicit reviews
- Purpose/config/policy/consent dependency binding
- Exact-boundary expiry and withdrawal invalidation
- Default broker redaction and reviewer authorization requirement
- No relationship edge created by adapter metadata
- No autonomous outreach, CRM writes, browser automation, or URL guessing
- No Consigliere proprietary graph, client data, outcome history, or brokering workflow
- Deterministic IDs, ordering, output hashes, and audit-chain checks

## Residual production limitations

1. **Local trust boundary:** SQLite is process-local and unencrypted. Filesystem permissions are defense in depth, not encryption. Use an encrypted volume for sensitive data.
2. **Single-process model:** there is no tested concurrent-writer protocol beyond SQLite transactions. Do not share one workspace DB across competing processes without additional locking/concurrency work.
3. **Authorized adapters are contracts, not production connectors:** only the credential-free local fixture adapter exists. A real CRM/email/calendar connector requires separate authentication, tenant isolation, pagination, rate-limit, revocation, telemetry, and provider-specific threat review.
4. **Install scripts:** `better-sqlite3` requires its native install step or an available compatible prebuild/toolchain. An `--ignore-scripts` install cannot run SQLite-backed CLI commands. This is expected for the dependency but should be stated in release notes.
5. **Scale:** bounded imports and in-memory matching were tested with synthetic fixtures, not production-volume benchmarks. Perform representative load and disk-space testing before enterprise use.
6. **Operator authorization:** reviewer identity is asserted by the local caller. There is no OS identity, RBAC, MFA, or cryptographic approval signature.
7. **Deletion scope:** withdrawal removes consent-dependent local material and emits a receipt, but cannot prove deletion from backups, copied exports, or external systems.
8. **No legal/compliance certification:** the threat model is engineering guidance, not a legal opinion or certification under GDPR, CCPA, employment, communications, or platform terms.
9. **Hypothesis quality:** results remain explainable review hypotheses. They are not proof of relationship quality, willingness, influence, employment currency, or permission to contact.
10. **Publication remains gated:** repository naming/trademark, owner/license/version, public visibility, release signing/provenance, and final publication require Josh's explicit approval in the later publication gate.

## Release recommendation

Proceed to release-candidate assembly. Keep publication closed until the explicit human publication gate. Do not describe the fixture adapter as a production CRM integration, do not claim at-rest encryption, and do not position findings as verified warm paths or outreach permission.
