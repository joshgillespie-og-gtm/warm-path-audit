# Warm Path Audit — Privacy and Security Threat Model

**Status:** Normative pre-implementation security design, 2026-09-18  
**Scope:** Local CLI, file import/export, SQLite persistence, deterministic matching, optional read-only adapters, and A–D coverage results  
**Normative inputs:** `SPEC.md`, `DECISIONS.md`, `PRIVACY-BOUNDARIES.md`

## 1. Security objectives

Warm Path Audit must:

1. process hostile files without fetching, interpreting, or executing their contents;
2. keep every identifier, claim, edge, result, review, and receipt inside one workspace;
3. surface only claims supported by inspectable provenance, confidence, and freshness;
4. prevent ambiguous people or organizations from becoming automatic facts or paths;
5. make contributor consent, expiry, withdrawal, deletion, and recomputation enforceable;
6. produce deterministic, idempotent, audit-ready results and safe exports;
7. remain useful with outbound networking disabled;
8. never mutate email, calendar, CRM, social, or outreach systems in audit mode; and
9. publish no real contacts, private graphs, customer target lists, secrets, or Consigliere logic.

This is a product threat model, not a claim of legal compliance or protection from an operator who fully controls and maliciously alters the local runtime.

## 2. Assets and sensitivity

| Asset                        | Sensitivity                 | Required protection                                                                       |
| ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| Raw source files             | Highest                     | hostile-input handling, short retention, restrictive permissions, no export/fetch/execute |
| Identity/employment claims   | High personal/business data | workspace scope, provenance, minimization, review state                                   |
| Relationship edges           | Highest network data        | contributor scope, consent eligibility, no graph export                                   |
| Target accounts/ICP/personas | Confidential GTM strategy   | workspace isolation, sanitized logs/exports                                               |
| Email/calendar metadata      | High contextual data        | allowlisted fields only; no body, subject, title, description, notes, transcript          |
| CRM metadata/credentials     | High                        | read-only authorization, least privilege, redacted logs, no writes                        |
| Derived A–D results          | High                        | consent/suppression before display/export; recompute on withdrawal                        |
| Audit/deletion receipts      | Moderate                    | counts/hashes/policy versions, no deleted personal values                                 |
| Sanitized exports            | High and portable           | policy gate, relation minimization, formula neutralization                                |

## 3. Trust boundaries and actors

- **Operator/workspace owner:** trusted to control the local machine and state a lawful purpose; not trusted to bypass policy accidentally.
- **Contributor:** authorizes a bounded dataset; does not authorize other purposes, workspaces, or introductions.
- **Imported file:** always untrusted bytes regardless of filename or source.
- **Adapter/provider:** external, optional, and untrusted; read-only and field-allowlisted.
- **Reviewer:** can resolve candidates and review findings only within assigned workspace/role.
- **Destination person:** has not consented merely because a result exists.
- **Exporter/spreadsheet:** an execution boundary; opening CSV can evaluate formulas.
- **Optional LLM:** outside the trusted deterministic core; receives no raw contact data by default and creates no evidence.

Data flow: hostile bytes → bounded decoder/parser → validated mapping → immutable source-row evidence → normalized claims → conservative resolution/review → policy/consent filter → deterministic A–D evaluation → need-to-know report → sanitized export. No stage dereferences imported URLs or executes imported content.

## 4. Threats and mandatory controls

### T-01 Spreadsheet formula injection

**Attack:** A field begins with a spreadsheet trigger (`=`, `+`, `-`, `@`) after spaces, Unicode whitespace, tabs, carriage returns, line feeds, BOM, or other leading control/format characters. A malicious value can execute when a CSV is opened.

**Controls:**

- Treat every exported string cell as untrusted, including headers, names, titles, domains, IDs, reason text, and reviewer comments.
- Before CSV serialization, inspect the first significant code point after any leading characters in: ASCII controls `U+0000–U+001F`/`U+007F`, Unicode format controls, BOM, and Unicode whitespace. If it is `=`, `+`, `-`, or `@`, prefix the entire original cell with ASCII apostrophe (`'`).
- Also prefix if the first raw character is tab, CR, or LF. Never rely on quoting alone.
- Remove NULs and reject forbidden controls that cannot be safely represented; preserve a reason-coded audit error.
- Use the same neutralizer for all CSV exporters. JSON output remains data, but consumers must not convert it to CSV without this control.
- Test ordinary, whitespace-prefixed, tab/CR/LF-prefixed, BOM/zero-width-prefixed, and quoted formula variants.

### T-02 Malformed encodings and CSV structure

**Attack:** Invalid UTF-8, UTF-16 masquerading as CSV, inconsistent quoting, embedded newlines, duplicate/confusable headers, delimiter confusion, NUL bytes, or trailing garbage causes column shifts or hidden mutation.

**Controls:**

- v0.1 accepts strict UTF-8, with an optional leading UTF-8 BOM only. Reject invalid byte sequences and UTF-16/32 BOMs; do not guess or silently transcode.
- Reject NUL bytes anywhere.
- RFC 4180-style quoted fields may contain delimiters/newlines; malformed/unclosed quoting rejects the whole import transaction.
- Header matching uses Unicode NFKC plus trim and case-fold only for collision detection. Reject exact duplicates and normalized/confusable collisions; never select “first wins.”
- Require an explicit mapping and exact source header reference after header detection. Unknown columns are ignored, not interpreted.
- Record physical line/logical row and source-row digest; errors are actionable and contain no full personal row.

### T-03 Resource exhaustion

**Attack:** Giant files, rows, fields, preambles, compression bombs, or too many errors consume memory/disk/CPU.

**Controls:**

- Stream uncompressed regular files; never accept archives in v0.1 and never load the whole CSV.
- Defaults: 100 MiB/file, 100,000 data rows, 1 MiB/logical row, 256 KiB/field, 256 columns, 100 preamble lines, and 1,000 collected validation errors. Abort transactionally on any limit.
- Hash while streaming. Use bounded parser buffers and SQLite transactions/staging tables.
- CLI overrides may only lower limits by default; raising a hard cap requires an explicit unsafe/operator policy and must be audit logged. Reference implementation should retain absolute ceilings.

### T-04 Filesystem traversal and symlink attacks

**Attack:** User-supplied filenames, workspace IDs, archive paths, or symlinks escape the workspace, overwrite sensitive files, or cause deletion outside project-controlled roots.

**Controls:**

- User data never determines output paths directly. Generate internal opaque filenames.
- Resolve canonical paths; require imported files to be regular files; reject symlinks and non-files using `lstat`, then open with no-follow semantics where supported and verify inode/device after open to limit TOCTOU.
- Reject paths outside the operator-selected import roots. Do not process directories, FIFOs, devices, sockets, archives, or `file://`/URL inputs.
- Create workspace directories/files with restrictive permissions; write exports atomically with exclusive creation unless explicit overwrite.
- Deletion enumerates only database-owned artifacts under a canonical workspace root, rejects the root itself and symlinks, supports dry-run/confirmation, and writes a count-only receipt outside the deleted content set.

### T-05 Malicious URLs and active content

**Attack:** Profile/avatar/site URLs induce SSRF, local-file access, credential leakage, tracking, or browser execution.

**Controls:**

- URLs are inert strings/claims. The importer and matching engine never perform DNS, HTTP, browser, image, metadata, or redirect requests.
- Reject dangerous schemes for typed URL claims; allow only `https` (and policy-approved `http` if later required) as syntax. Never allow `file`, `data`, `javascript`, localhost/private-network fetching, or guessed completion.
- Normalize only supplied URLs deterministically for comparison; preserve original evidence separately.
- Reports render URLs as escaped text by default, not clickable HTML. No raw HTML export in v0.1.

### T-06 Identity collision and duplicate contacts

**Attack:** Same/similar names, confusable characters, recycled/shared emails, duplicate rows, or conflicting source IDs cause false person merges and fabricated paths.

**Controls:**

- IDs are workspace-local and source claims remain immutable.
- Automatic linkage is limited to exact identifiers in an authorized namespace or exact normalized unique email only after email classification and collision checks. Name+employer, title, domain, fuzzy similarity, and model suggestions only create `ResolutionCandidate`s.
- Shared/role (`sales@`, `info@`, `support@`), household/family, mailing-list, disposable, and known multi-person emails are never automatic person keys. Company domain alone never identifies a person.
- Unicode skeleton/confusable similarity is a warning/review signal, never an auto-merge key.
- Duplicate records are grouped non-destructively. Conflicting exact identifiers quarantine the candidate and block path eligibility until review.
- Merge decisions are workspace-scoped, actor/reason/timestamp audited, reversible, and cannot be reused across workspaces.

### T-07 Employment/account-resolution errors

**Attack:** Stale or conflicting employment, subsidiaries, account aliases, domain collisions, generic email domains, or CRM mappings incorrectly qualify a target account.

**Controls:**

- Employment is a claim with source, observed/retrieved time, confidence, and current/ended/unknown state.
- Default: claims observed within 365 days may be current-enough; 366–730 days are review-only; older or undated claims are stale/ineligible. A later explicit ended claim overrides eligibility; conflicting current employers are review-only.
- Exact target CRM ID in the same authorized namespace may match automatically. Exact canonical domain or explicitly approved alias may match. Name/domain similarity creates an organization-resolution candidate only.
- Free email, shared service, redirect, parent/subsidiary, and multi-tenant domains never establish employer/account identity by themselves.
- Account alias decisions are versioned, workspace-scoped, reviewed, and named in result provenance.

### T-08 Relationship inference overclaim

**Attack:** Co-employment, education, follows, public co-mentions, interaction frequency, or an LLM is treated as a direct/warm edge or willingness.

**Controls:**

- Eligible direct edges require an authorized contributor export explicitly asserting the direct connection or a scoped human attestation.
- Public overlap, company membership, CRM co-occurrence, calendar/email metadata, and enrichment cannot create first-degree edges.
- Interaction metadata can affect freshness/context only and never proves strength, willingness, influence, or destination consent.
- B/D always say “coach/champion candidate”; C requires stakeholder persona fit; D cannot be promoted to C without deterministic persona evidence.

### T-09 Consent expiry, withdrawal, and derived remnants

**Attack:** Expired/withdrawn contributor data remains in cached paths, reports, indexes, snapshots, exports, or later refreshes.

**Controls:**

- No contributor import without an active record whose workspace, purpose, source class, categories, disclosure, export, and retention scope covers it.
- Default contributor consent expires after 365 days and requires renewal; missing expiry is schema-invalid. Expiry makes edges ineligible at the instant, independent of a scheduled job.
- Withdrawal sets immediate ineligibility, revokes future refresh, deletes/tombstones contributor claims per policy, invalidates every derived result/edge/index, and transactionally recomputes impacted runs.
- Derived records carry contributing snapshot/consent IDs, enabling dependency deletion. No aggregate or cached score may survive if it depends solely on withdrawn data.
- Already exported artifacts cannot be recalled; track them and flag/delete project-controlled copies. Receipts list counts, hashes/policy versions, and completion/failure, not personal values or other contributor identities.
- Re-import never reactivates withdrawn consent; new consent requires a new record and explicit grant.

### T-10 Cross-workspace leakage

**Attack:** Global deduplication, predictable IDs, cache keys, joins, approvals, snapshots, or exports expose one workspace to another.

**Controls:**

- Every table uses `workspace_id`; primary/unique/foreign keys include it. No global email/profile URL/person index.
- Workspace-scoped keyed identifiers/hashes prevent cross-workspace equality leakage; source IDs include adapter namespace.
- Repository APIs require workspace context rather than optional filters. Deny on missing/mismatched scope.
- Consent, policy, review, deletion, and adapter authorization cannot be rebound across workspaces.
- Separate workspace directories and export manifests; test identical identifiers in two workspaces.

### T-11 Sensitive target/account and metadata exposure

**Attack:** Logs, reports, exports, crash dumps, examples, or optional adapters leak target strategy or private communications.

**Controls:**

- Treat target accounts, exclusions, and result paths as confidential. Routine logs use opaque IDs, counts, reason codes, and hashes.
- Email allowlist: normalized participant addresses or provider-scoped participant IDs, event timestamp, thread ID, direction relative to authorized mailbox, and aggregate counts. Exclude subject/body/snippet/attachments/labels unless separately approved later.
- Calendar allowlist: participant IDs/addresses, start/end timestamps, organizer, and authoritative RSVP/attendance. Exclude title/summary/description/location/notes/conference URL/transcripts.
- Minimize participant addresses to workspace-local hashes after resolution when raw values are no longer needed.
- No sensitive-trait targeting; configurations attempting it are rejected/warned and require no inferred traits.

### T-12 CRM/adapter authorization and confused deputy

**Attack:** Excess OAuth scope, stale credentials, retries, or a crafted source event causes writes, duplicate evidence, or data from another tenant.

**Controls:**

- v0.1 ships contracts/mocks only. Future adapters declare provider, account/tenant, authorization basis, scopes, field allowlist, time window, retention, capabilities, revocation, and a stable authorization ID.
- Audit mode rejects any capability containing write/send/delete/mutate. Core exposes no mutation interface.
- Bind each event to workspace, adapter, provider tenant, authorization, and source event ID; enforce idempotency and reject rebinding.
- Store no credentials in config/snapshots/audit logs; use OS secret facilities in future. Redact provider errors and payloads.

### T-13 Replay, tampering, and non-determinism

**Attack:** Same file imports twice, source IDs are rebound, mutable config changes results invisibly, timestamps/random ordering alter output, or audit history is edited.

**Controls:**

- Snapshot identity is a workspace-scoped digest of raw bytes plus contributor, source kind, mapping version, and consent; identical active snapshot import is idempotent.
- Audit run records hashes of all snapshots/config/policies/rule versions plus engine/schema/transform versions.
- Stable IDs derive from workspace-scoped canonical inputs; sort every output collection by documented stable keys. Exclude wall-clock generated timestamps from replay comparison or inject a run clock.
- Append-only audit events use sequence numbers and a hash chain; SQLite constraints/transactions detect gaps/rebinding. This is tamper-evident, not tamper-proof against the machine owner.
- Failed imports commit no normalized or derived rows beyond a sanitized failure audit event.

### T-14 Unsafe exports and relation disclosure

**Attack:** Export triggers formulas, includes raw relationship graph/source rows/emails, leaks broker identity contrary to consent, or is confused with outreach authorization.

**Controls:**

- CSV formula neutralization is mandatory code behavior described in T-01, not documentation-only.
- Export only schema-defined selected results after suppression, consent, expiry, role, and disclosure checks. No bulk edge list, raw rows, contributor email, private metadata, or source credentials.
- Default broker disclosure is `authorized_reviewers`; external/sanitized exports redact broker person ID and exact edge evidence unless consent explicitly permits it.
- Include `sanitization` metadata and policy/config hashes. Export is never an activation record.
- JSON serialization escapes strings; CSV uses a standards-compliant serializer after cell neutralization; terminal output strips/escapes controls to prevent terminal injection.

## 5. Retention and deletion defaults

Safe provisional defaults:

- Raw imported bytes: stream, normalize transactionally, then delete immediately after successful commit (`0 days`). Keep only SHA-256, byte/row counts, mapping/version, and row-level evidence digests. Failed staging files are deleted best-effort immediately.
- Optional retained raw snapshot: disabled; if a later operator enables it, encryption and key management are required and are deployment responsibilities.
- Normalized claims and derived results: 365 days maximum or earlier consent expiry/withdrawal/workspace deletion.
- Project-controlled sanitized exports: 30 days by default and tracked in an export manifest.
- Minimal audit/deletion receipts: 730 days, with no direct identifiers or deleted values.
- Policy checks occur at read/display/export time as well as recomputation, so expiry cannot leak during a delayed job.

Deletion is cryptographic only where encrypted retained blobs exist; SQLite deletion should use foreign keys, transactionally delete dependencies, checkpoint/secure-delete guidance, and disclose that filesystem copies/backups may require operator action.

## 6. Required security tests

Before release, automated tests must cover:

1. formula neutralization with ASCII/Unicode whitespace and controls;
2. malformed UTF-8, BOM, NUL, quoting, duplicate/confusable headers;
3. every size/count bound and transactional rollback;
4. path traversal, symlink, FIFO/device, overwrite, and deletion-root attacks;
5. URL no-fetch/no-DNS behavior under network denial;
6. same-name/confusable/shared-email collisions and no automatic ambiguous merge;
7. stale/conflicting employment and account aliases;
8. no relationship inference from co-employment/public/interaction evidence;
9. consent expiry/withdrawal removing all dependent C/D paths and caches;
10. cross-workspace identical identifiers with no reads/joins/review reuse;
11. metadata field allowlists and CRM no-mutation capability checks;
12. byte-stable deterministic replay and idempotent import;
13. safe CSV/JSON/terminal export and broker redaction;
14. deletion receipts and partial-failure recovery; and
15. repository/archive scans for real/private identifiers, databases, raw exports, credentials, and Consigliere artifacts.

## 7. Residual risks

- A malicious local administrator can inspect files/memory or modify the program; local-first is not protection from the host owner.
- Spreadsheet software differs; apostrophe prefixing is the conservative cross-tool default but must be regression-tested in major spreadsheet applications.
- Deleted bytes may remain in filesystem snapshots, backups, SQLite free pages, or user-copied exports.
- Company aliases, free/shared domains, title taxonomies, and employment freshness remain review-heavy and culturally/regionally variable.
- Consent/lawful basis is deployment-specific; schema records support governance but do not make legal determinations.
- Metadata minimization reduces but does not remove sensitivity: communication patterns can reveal relationships.
- Hash chains provide evidence of change, not independent immutability; signed/external transparency logs are deferred.
- SQLite encryption at rest is not provided by default; operators must secure the device, directory permissions, and backups.
