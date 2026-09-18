# Warm Path Audit — Decision Record

**Status:** Initial product decisions, 2026-09-18

**Working slug:** `warm-path-audit`

This record captures decisions that downstream implementation should treat as defaults unless an explicit later decision supersedes them.

## D-001 — Name: Warm Path Audit

**Decision:** Use **Warm Path Audit** as the working product/display name and `warm-path-audit` as the local repository and npm package slug.

**Why:**

- “Warm Path” is immediately legible to GTM users.
- “Audit” communicates a bounded diagnostic rather than a lead database, CRM, or autonomous activation product.
- It supports a simple verb: “run a warm-path audit.”
- It leaves room for direct-lead leakage and indirect target-account paths under one concept.
- It is less generic and less telecom-confusable than “Network Coverage.”

**Lightweight availability check (2026-09-18):**

- No exact public GitHub repository named `warm-path-audit` was found through GitHub's public search API.
- npm returned no package for `warm-path-audit`.
- General web search returned no exact software/product result for “Warm Path Audit” or “Warm Path Auditor”; results used “warm path” descriptively.
- The isolated project directory did not exist before this state.

**Caveat:** This is not legal clearance, a trademark opinion, or a reservation. Re-run GitHub/npm/web and a formal mark search before publication.

**Alternatives considered:**

- `network-coverage-auditor`: clear but long, generic, and heavily associated with telecom “network coverage.”
- `gtm-network-audit`: precise but less memorable.
- `warm-route`: concise, but sounds like routing/automation rather than diagnosis.
- `network-leak-audit`: makes direct lead leakage salient but underrepresents warm intro paths.
- `network-radar`: memorable but crowded/generic and less explicit.

## D-002 — Product category

**Decision:** Describe the project as a **local-first GTM network coverage auditor**.

It is not positioned as:

- an open-source clone of any named vendor;
- a social graph search engine;
- a personal CRM;
- a contact scraper;
- a lead database;
- an autonomous warm-introduction system.

**Reason:** A bounded audit has a concrete input/output contract, creates value before integrations, and supports stronger privacy promises.

## D-003 — Four output classes are first-class domain concepts

**Decision:** Preserve categories A–D as separate result types:

- A: direct ICP lead;
- B: direct target-account coach/champion candidate;
- C: broker path to target stakeholder;
- D: broker path to other target-account employee/coach/champion candidate.

A result may qualify for multiple categories, but the engine and report must not collapse them into one list or hide the reason for classification.

**Reason:** Each class implies a different review question and next action. In particular, a coach/champion candidate is not automatically a buyer and a broker is not the destination lead.

## D-004 — CSV-first, network-optional core

**Decision:** v0.1 must deliver the full audit from local files with no API key, no OAuth, and no outbound network dependency.

**Reason:**

- establishes a reproducible open-source core;
- lowers activation cost;
- makes privacy claims testable;
- avoids making platform/API access the product's foundation.

Authorized email, calendar, CRM, and enrichment systems enter later through optional contracts and mocks. They may improve context, freshness, and suppression, but are not required.

## D-005 — No LinkedIn scraping

**Decision:** Support user-provided LinkedIn Connections export CSVs, but prohibit scraping, browser automation, cookie reuse, undocumented endpoints, and guessed profile URLs.

**Reason:** The product's differentiated trust model should not depend on evading platform controls or silently building a third-party profile corpus.

## D-006 — A source assertion is evidence, not truth

**Decision:** Represent identity, employment, and relationship information as versioned claims with provenance, observed time, confidence, and review state.

**Reason:**

- exports become stale;
- names and companies collide;
- a first-degree source edge does not prove relationship strength or willingness;
- enrichment providers can be wrong.

No material claim should be flattened into an unqualified canonical fact.

## D-007 — Entity resolution is conservative

**Decision:** Exact source identifiers can create high-confidence claims, but ambiguous cross-source matches must enter a review queue. Never silently merge solely on name and company.

**Reason:** A false merge can expose one person's data as another's, invent a path, or misroute an intro request.

Initial matching hierarchy for later design:

1. exact normalized source profile URL supplied in the export;
2. exact verified/provider identifier in the same authorized namespace;
3. normalized unique email within the workspace;
4. compound claims such as name + employer only as resolution candidates, not automatic identity.

## D-008 — Relationship edges require authorized direct evidence

**Decision:** A first-degree relationship edge exists only when an authorized contributed source explicitly asserts it or when a user makes a scoped human attestation.

Do not infer direct relationships from:

- current or former co-employment;
- shared education;
- social follows;
- public web mentions;
- mutual group membership;
- model-generated speculation.

**Reason:** These may be contextual signals but are not equivalent to “can broker an introduction.”

## D-009 — Confidence is decomposed, not magical

**Decision:** Store and display separate account-fit, persona-fit, relationship, employment, freshness, and path confidence components. A review-priority score may rank results but cannot replace components.

**Reason:** A single opaque “warmth score” encourages overclaiming and cannot explain why a path is weak.

## D-010 — Coach/champion is always a candidate label

**Decision:** Categories B and D must use “coach/champion candidate” or similarly qualified language.

**Reason:** Employment and role can suggest routing value; they do not prove influence, intent, willingness, or advocacy.

## D-011 — Consent is scoped and reversible

**Decision:** Each contributor dataset requires a consent/policy record with purpose, scope, disclosure rule, granted time, expiry, and withdrawal state. Withdrawal immediately makes their edges and derived paths ineligible and triggers recomputation/deletion policy.

**Reason:** “Uploaded once” must not become perpetual permission to expose or activate someone's relationships.

Organizational policy may be represented later, but it cannot silently downgrade the safer individual-consent default.

## D-012 — Discovery is not activation

**Decision:** The core product stops at a reviewed `IntroCandidate`. It does not send, draft-and-send, create a CRM record, or contact a broker/destination.

A later activation workflow must require:

1. reviewer selects a path;
2. broker sees the exact destination, purpose, and proposed ask;
3. broker explicitly opts in;
4. the broker controls whether/how to approach the destination;
5. no claim that the destination consented until they actually do.

**Reason:** Audit visibility is not consent to use or disclose a relationship.

## D-013 — Local-first isolation

**Decision:** Local SQLite is the reference persistence layer. Every identifier and query is workspace-scoped, even in a single-user demo.

**Reason:** Designing isolation in the domain model prevents local convenience from becoming a cross-tenant production flaw later.

## D-014 — Raw, normalized, and derived data remain separate

**Decision:** Preserve three layers:

1. source snapshots/checksums and row references;
2. normalized claims and review decisions;
3. derived A–D results and paths.

**Reason:** Supports replay, deletion, correction, explainability, and withdrawal without rewriting history or pretending derived data is source truth.

## D-015 — Deterministic engine; optional LLM explainer

**Decision:** Matching, classification, confidence, and eligibility are deterministic and versioned. An LLM may optionally summarize recorded reasons, but must not create edges, merge identities, or supply unrecorded evidence.

**Reason:** The audit must work offline and be reproducible. The pre-existing BYOC engine's fit-prefilter and rationale pattern is useful, but its LLM ranking must not become an authority in this public reference design.

## D-016 — Reuse ideas, not private implementation or data

**Decision:** Learn from the local prior-art implementation without copying it wholesale.

Reusable concepts:

- robust detection of LinkedIn CSV headers after a Notes preamble;
- normalized source identity preference for supplied URLs;
- adapter boundary for optional enrichment;
- fit-led ranking with separate signals;
- local durable storage and atomic operations;
- explicit consent gating for contributed networks;
- human-readable dossier/report as output.

Required improvements before public implementation:

- workspace-scoped IDs instead of email-derived storage slugs;
- no contributor emails in broker output by default;
- no silent name+company identity as a stable cross-member key;
- transactional SQLite rather than per-user raw folders as the primary model;
- explicit withdrawal/deletion and staleness;
- deterministic core classifications rather than LLM authority;
- no private records, sample dossiers, API endpoints, credentials, user paths, or Consigliere brand logic copied into the project.

## D-017 — Public/proprietary boundary

**Decision:** Public repository may include:

- schemas and importers;
- deterministic coverage engine;
- synthetic fixtures;
- CLI and local report;
- policy and adapter contracts;
- generic playbook and documentation.

It must not include:

- Consigliere member/contact data;
- curated cross-member network graph;
- context or relationship intelligence from real members;
- outcome and introduction history;
- proprietary ranking derived from managed outcomes;
- human brokerage operations or customer-specific configurations.

**Reason:** Open source is a credibility/distribution wedge, not publication of the network moat.

## D-018 — License is provisionally Apache-2.0

**Decision:** Recommend Apache-2.0 for the implementation scaffold, subject to Josh's publication decision.

**Reason:** Permissive use plus an express patent grant is appropriate for a reusable engine and adapter contracts. No license file is created in this planning state.

## D-019 — Competitive language remains factual and independent

**Decision:** Mention Happenstance, Commsor, The Swarm, Affinity, Introhive, and open-source alternatives only for factual category comparison with dated citations. Do not claim compatibility, affiliation, endorsement, copied functionality, or superiority without evidence.

**Reason:** The product should have its own thesis rather than market as an unauthorized clone.

## D-020 — Naming and publication remain gated

**Decision:** The working name is not a publishing authorization. Before release:

- repeat exact GitHub/npm availability checks;
- perform a stronger trademark/name review;
- confirm owner, visibility, license, attribution, and package policy;
- scan all artifacts for private/internal data;
- obtain Josh's explicit approval.

## Additive security and contract defaults — 2026-09-18

These decisions resolve the specification's open security/contract questions provisionally. They strengthen and do not supersede or weaken D-001–D-020 or `PRIVACY-BOUNDARIES.md`.

## D-021 — Hostile CSV limits and strict decoding

**Decision:** v0.1 accepts uncompressed regular UTF-8 files, with an optional leading UTF-8 BOM. It rejects invalid UTF-8, UTF-16/32 BOMs, NUL bytes, malformed quoting, duplicate or NFKC/trim/case-fold-colliding headers, archives, non-files, and imports outside approved roots.

Default hard ceilings are 100 MiB/file, 100,000 data rows, 1 MiB/logical row, 256 KiB/field, 256 columns, 100 preamble lines, and 1,000 collected errors. Parsing and hashing must be bounded and streaming; any violation rolls back the import.

## D-022 — Raw files are transient and inert

**Decision:** The default raw-source retention is zero days: hash and normalize transactionally, then delete raw bytes after successful normalization. Retained raw snapshots are disabled in the reference MVP. Imported URLs and paths are inert values and are never fetched, resolved, browsed, executed, or used as output paths.

**Reason:** Replay can use the operator's original authorized export plus the recorded checksum/mapping; keeping a second plaintext copy creates unnecessary risk.

## D-023 — Formula-safe export is mandatory behavior

**Decision:** Every CSV string cell passes through one central neutralizer. After scanning leading ASCII/Unicode whitespace, control and format characters, any value whose first significant character is `=`, `+`, `-`, or `@` is prefixed with an ASCII apostrophe. Tab/CR/LF-leading cells are also prefixed, and NULs are removed/rejected. Quoting alone is insufficient.

JSON/terminal exporters must escape controls; v0.1 does not emit raw HTML or bulk edge lists.

## D-024 — No ambiguous automatic person merge

**Decision:** No ambiguous person merge is automatic. Exact identifiers may link only inside an authorized namespace/workspace and only when collision checks pass. Name+company, shared/role/household email, company domain, Unicode-confusable similarity, and fuzzy/model matches create review candidates only. Duplicate rows are grouped non-destructively.

## D-025 — Employment and account freshness defaults

**Decision:** An employment claim observed within 365 days may be current-enough; 366–730 days is review-only; older or undated claims are stale/ineligible. A later ended claim blocks current eligibility, and conflicting current employers require review.

Exact same-namespace CRM IDs, canonical domains, and explicitly approved aliases can match accounts. Similar names/domains, parent/subsidiary relationships, free/shared/multi-tenant domains, and company domains used as person identity require review.

## D-026 — Consent expiry, withdrawal, and recomputation

**Decision:** Individual contribution records require an explicit expiry, defaulting to 365 days. Eligibility is checked at use/display/export time. Expiry or withdrawal immediately invalidates contributor edges and every dependent result/cache, blocks refresh, and triggers transactional deletion/tombstoning plus recomputation. Re-import cannot reactivate withdrawn consent; a new explicit grant is required.

Organizational-policy records remain representational, require notice state, and make no legal determination.

## D-027 — Retention defaults and receipts

**Decision:** Defaults are raw source 0 days; normalized claims and derived results up to 365 days or earlier consent action; project-controlled sanitized exports 30 days; minimal count/hash/policy-only audit and deletion receipts 730 days. Receipts contain no deleted personal values or identities of other contributors and disclose operator-controlled backups/copied exports as external actions.

## D-028 — Read-only minimized adapters

**Decision:** v0.1 defines adapter authorization contracts/mocks only. An authorization binds workspace, provider tenant, purpose, read-only capability, exact field allowlist, time window, retention, expiry/revocation, and source-event idempotency. Credentials are never embedded. Any write/send/delete/mutate capability is invalid in audit mode.

Email defaults exclude subject, body, snippet, attachments, and labels. Calendar defaults exclude title/summary, description, location, notes, conference links, and transcripts. Interaction metadata can adjust context/freshness only; it cannot create a relationship or imply willingness.

## D-029 — Workspace isolation and deterministic replay

**Decision:** All keys, indexes, joins, caches, approvals, and reviews are workspace-scoped. No global deduplication by email or profile URL exists. Snapshot idempotency binds raw checksum, contributor, source kind, mapping/version, consent, and workspace; rebinding is rejected.

Audit runs record input/config/policy/version hashes and emit stable sorted output. Wall-clock timestamps are excluded from byte-stable replay comparison or supplied by an injected run clock. Append-only audit events use sequence and hash-chain linkage as tamper evidence.

## D-030 — Safe export disclosure defaults

**Decision:** Sanitized exports include only eligible schema-defined findings after consent, suppression, expiry, role, and disclosure checks. Broker identities and exact edge details are redacted by default outside authorized reviewer views; contributor emails, raw source rows, private metadata, source credentials, and portable edge lists are never included in v0.1.

## D-031 — Reference at-rest security boundary

**Decision:** SQLite/application-level encryption at rest is not a v0.1 core dependency. The reference implementation must use restrictive local permissions, document full-disk/device and backup security, keep raw bytes transient, and clearly state the residual risk. Optional encrypted retained snapshots are deferred until a concrete key-management design exists.

## D-033 — Deterministic category scope and evidence gates

**Decision:** Category A may include a direct contact at any organization that deterministically satisfies the configured ICP rules, including a named target account. Category B is target-list-only. Categories C and D are target-list-only and require an active eligible contributed direct edge from a contributor who is not configured as the workspace's direct contributor, plus active category/source-scoped broker consent. A/C require a deterministic stakeholder-persona match; B/D are mutually exclusive non-matches or uncertain matches and retain only the qualified “coach/champion candidate” label.

Hard gates for current non-conflicted employment, resolved identity, exact or explicitly approved account mapping, consent, relationship evidence, policy, and suppression run before scoring. Scores rank review order and never override a failed gate. Repeated runs bind canonical input, configuration, policy, engine version, and run clock hashes; direct A/B dependencies include the underlying contributor, consent, snapshots, and evidence but intentionally omit a fabricated broker path.

## D-032 — CLI alias review is explicit

**Decision:** Exact unresolved organization aliases are placed in a workspace-scoped review queue. The CLI must show proposed canonical account, alias kind/value, provenance, conflicts, and consequences, then require an explicit approve/reject decision with actor, reason, and timestamp. There is no fuzzy auto-accept or cross-workspace reuse.

## D-034: Alias authorization is persisted, immutable, and fully bound

**Decision:** Configuration cannot approve an organization alias. Every configured alias must reference a same-workspace `organization_alias_candidate` in `approved` state and an immutable `review_decision` whose subject is that candidate, decision is `approve`, prior state is `pending`, timestamp is not in the future, and actor/reason are present. The decision embeds source organization, canonical organization, alias kind, and alias value; all fields must exactly match the candidate and configuration. A later reject, defer, or revoke invalidates the approval. Missing, forged, stale, mismatched, or cross-workspace references fail the run before matching.

## D-035: One purpose and active consent across the complete dependency closure

**Decision:** The run policy must already be effective and its purpose must equal the workspace purpose. Every result dependency snapshot must bind to an active contributor and an active consent for that contributor, policy purpose, result category, and declared source kind. Mixed-source evidence uses `invalidate_entire_result`: one expired, withdrawn, future, mismatched, or out-of-scope dependency blocks the whole candidate with explicit reason codes.

## D-036: Suppressions are a deterministic union and source means source kind

**Decision:** Runtime config suppressions, config exclusions, and persisted workspace `suppression_rule` entities are unioned; any active matching rule blocks the candidate. `source` matches `SourceSnapshotMetadata.sourceKind`, while the distinct `snapshot` kind matches a snapshot ID. The same union is re-evaluated at display time by resolving persisted dependency snapshots. Display also rechecks contributor status and consent activity, purpose, category, source scope, and contributor binding so prior results cannot reappear after withdrawal, expiry, or policy suppression changes.

## D-038 — Optional adapters remain local, explicit, bounded, and non-relational

**Decision:** The public core implements vendor-neutral read-only CRM, email, and calendar metadata contracts plus one credential-free local-fixture adapter. It ships no provider network connector. Every invocation binds an active authorization to workspace, provider tenant, purpose, capability, exact field allowlist, time window, contributor consent, expiry/revocation, and provider record identity. Records are bounded, digested, deduplicated, checkpointed, provenance-carrying, and normalized through source snapshot, evidence, claims, workspace storage, and audit boundaries. Metadata never creates a relationship edge. Rate limits and temporary failures are returned as data; the core does not sleep or retry autonomously. Attio, HubSpot, and generic CRM mappings are illustrative only and are not production support claims.

## D-037: Semantic configuration validation is fail-closed

**Decision:** Beyond JSON shape validation, the engine rejects duplicate contributor, target, profile, alias, suppression, rule-set, or rule IDs; duplicate organization profiles; contradictory alias bindings; zero total scoring weight; and threshold order where `uncertainLowerBound >= personaMatchedThreshold`. Direct contributors must exist in the workspace and be active. Policy `effectiveAt` must be at or before the run clock.
