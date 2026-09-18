# Warm Path Audit — Product Specification

**Status:** Working product specification, pre-implementation

**Working repository/package slug:** `warm-path-audit`

**Product category:** Local-first GTM network coverage auditor

**One-line promise:** Find qualified buyers and credible paths into target accounts that are already hiding in networks your team is authorized to use.

## 1. Product thesis

Revenue teams regularly buy more contact data while overlooking people and relationship paths already present in their own authorized records. The problem is not merely network search. It is **coverage diagnosis**:

1. Which direct contacts already match the ICP but are absent from or neglected in pipeline?
2. Which direct contacts work at target accounts and could credibly coach or champion a sale, even if they are not the buyer persona?
3. Which network contributors can introduce the team to a target stakeholder?
4. Which contributors can introduce the team to another employee who may coach, champion, or route the team internally?

Warm Path Audit answers those four questions with inspectable evidence, confidence, staleness, and policy checks. It does not scrape LinkedIn, infer a relationship from the public web, send outreach, or turn contributed networks into a shared contact database.

## 2. Positioning and wedge

### Positioning

> Warm Path Audit is a local-first, open-source GTM network coverage auditor. Import authorized contact exports, define the buyers and accounts that matter, and inspect explainable direct and warm paths without uploading the network to a vendor or automating the ask.

### Initial wedge

The MVP is a **one-time or periodic audit**, not a relationship-intelligence CRM and not a conversational people-search engine. A successful run produces a reviewable coverage report organized into four mutually intelligible opportunity classes, plus suppression and uncertainty queues.

The wedge is deliberately narrower than incumbent platforms:

- deterministic audit against explicit ICP, persona, and target-account inputs;
- local SQLite persistence by default;
- CSV-first, useful before any OAuth integration;
- every result names its source and reason;
- contributor consent and withdrawal are first-class;
- no autonomous activation.

### Why this can be open source

The reusable engine, schemas, scoring rules, local CLI, and adapter contracts can be public. The defensible service layer remains outside the repository: a curated network, cross-member graph, proprietary context and outcome history, relationship-quality judgments, and managed human brokering.

## 3. Intended users

### Primary

- Founder-led sales teams auditing founder, executive, advisor, and colleague networks.
- RevOps/GTM engineering teams comparing network coverage against named accounts.
- Small B2B sales teams seeking warm paths before scaling cold outbound.
- Consultants running a privacy-conscious network audit for a client.

### Secondary

- Investors, accelerators, and communities auditing knowingly contributed networks inside a bounded workspace.
- Partnerships and ecosystem teams mapping authorized paths into strategic accounts.

### Not optimized for

- Consumer social discovery.
- Recruiting or candidate sourcing in the MVP.
- Data brokers, list sellers, or enrichment vendors.
- Organizations seeking silent employee surveillance or automatic intro requests.

## 4. Inputs

All inputs belong to a single workspace and carry source and policy metadata.

### 4.1 Required inputs

1. **Owner network export**
   - LinkedIn Connections CSV supplied by the user, or a generic contacts CSV.
   - The importer must support preamble/header variance and explicit field mapping.
2. **ICP definition**
   - Company attributes such as industry, geography, size, stage, technologies, or named exclusions.
   - Rules may be exact, enumerated, or range-based. Free text may be accepted only as input to a reviewable normalization step.
3. **Stakeholder personas**
   - Titles, seniority, functions, role aliases, positive rules, and exclusions.
4. **Target accounts**
   - Canonical account name plus optional domain, CRM ID, aliases, priority, and notes.

### 4.2 Optional inputs

- Knowingly contributed colleague/advisor/investor/customer network CSVs, each with an explicit consent record and scope.
- Authorized email metadata: participants, timestamps, thread IDs, and aggregate interaction signals; no message body by default.
- Authorized calendar metadata: participants, timestamps, organizer, RSVP/attendance when authoritative; no notes or description by default.
- Authorized CRM metadata: accounts, contacts, ownership, opportunity state, suppression state, and existing relationship attribution.
- Optional authorized enrichment results, stored as claims with provider, retrieval time, and terms—not as truth.

### 4.3 Forbidden acquisition

- LinkedIn scraping, browser automation, cookie/session reuse, or undocumented endpoints.
- Guessing LinkedIn URLs or relationship edges.
- Purchasing or silently appending third-party contact lists in the core product.
- Public-web inference presented as a first-degree relationship.
- Importing a colleague's network without their informed contribution or an independently valid organizational policy and notice.

## 5. Output taxonomy

A match may appear in more than one category, but each category is evaluated and displayed separately. Results must never collapse the connector and destination into a single “lead.”

### A — Direct ICP lead

**Normative account scope:** A is not target-list-only. It may include a direct contact at any organization that deterministically satisfies the configured ICP rules, including a named target account. B, C, and D remain target-list-only.

**Question:** Does a person directly connected to a contributor fit the stakeholder persona and work at an ICP-fit company?

Required evidence:

- a direct relationship edge from an authorized source;
- a current-enough employment claim;
- company ICP fit;
- stakeholder persona fit;
- no suppression policy conflict.

Use: identify potential in-network pipeline leakage, including contacts missing from the CRM or lacking recent review.

### B — Direct target-account coach/champion candidate

**Question:** Is a direct contact currently at a named target account but outside the configured stakeholder persona?

Required evidence:

- direct relationship edge;
- employment claim matching a target account;
- non-stakeholder or uncertain persona classification;
- no suppression conflict.

The label is **candidate**, never a claim that the person is willing, influential, or supportive. The report explains possible routing value based on role/function and asks for human review.

### C — Broker path to target stakeholder

**Question:** Does a contributor have a direct relationship to a person at a target account who matches a stakeholder persona?

Path shape:

`workspace user → contributor/broker → target stakeholder`

Required evidence:

- contributor is authorized for this audit and eligible under disclosure policy;
- direct relationship edge between broker and destination;
- current-enough target employment;
- persona fit;
- confidence and provenance on every claim.

No intro is requested until a reviewer approves the path and the broker separately opts in to the specific ask. The destination's identity must not be disclosed outside the authorized workspace merely because the path was found.

### D — Broker path to target-account coach/champion candidate

**Question:** Does a contributor have a direct relationship to a non-stakeholder employee at a target account who may help route or coach?

Path shape:

`workspace user → contributor/broker → target-account employee`

This has the same evidence and consent requirements as C, but does not require stakeholder persona fit. The result must state why the person might be relevant and explicitly avoid claiming influence or willingness.

### Suppressed and review-only results

The engine also returns:

- ambiguous identity or employment matches;
- stale claims;
- withdrawn contributors;
- policy-suppressed people/accounts/domains;
- existing customers/open opportunities when configured to suppress;
- insufficient-evidence paths;
- duplicate paths grouped without destructive merging.

## 6. Explainability contract

Every surfaced result must provide:

- stable result and workspace identifiers;
- category A, B, C, or D;
- destination person and canonical account IDs;
- broker/contributor ID when applicable;
- fit score components rather than only a blended score;
- human-readable reason codes;
- source record IDs and import timestamps;
- relationship provenance and relationship confidence;
- employment provenance, observed date, and staleness status;
- ICP/persona rule version and matched/failed rules;
- entity-resolution confidence and unresolved conflicts;
- consent/policy disposition;
- review status and reviewer decision history.

LLM-generated summaries may explain structured results but may not create evidence, edges, identity merges, or scores that cannot be reproduced from recorded inputs.

## 7. Proposed scoring model

Scores rank review order; they do not certify relationship strength or buyer intent.

Separate 0–100 components:

- `account_fit`: target-account exact match or ICP rule evaluation.
- `persona_fit`: stakeholder rule evaluation.
- `relationship_confidence`: confidence that a declared/direct source edge exists.
- `employment_confidence`: confidence and freshness of employer claim.
- `path_confidence`: minimum/weighted composition of required edge and identity claims.
- `freshness`: transparent decay based on source dates.
- `review_priority`: configured blend used only for ordering.

Rules:

- deterministic default weights, versioned per run;
- hard evidence, consent, resolution, freshness, target-account, and suppression gates run before scoring and cannot be overridden by any score;
- missing evidence lowers confidence rather than being imputed;
- target-account exact matching and ICP fit are distinct;
- “warmth” is unknown unless supported by authorized interaction metadata or human attestation;
- no engagement/relationship score may be exposed as an objective social truth;
- category C must require persona fit; category D must not masquerade as C.

## 8. Core workflows

### Workflow 1 — Owner-only coverage audit

1. Create a local workspace and retention policy.
2. Import owner CSV.
3. Validate and normalize records.
4. Review ambiguous identity/employment claims.
5. Load ICP, persona, target accounts, and suppressions.
6. Run A–D audit (C/D may be empty with only a single owner network unless destination-edge data exists).
7. Review categorized report and export a sanitized artifact.

### Workflow 2 — Combined team audit

1. Invite or locally register contributors.
2. Record informed consent with purpose, scope, expiry, and disclosure policy.
3. Import each contributor's CSV into the same bounded workspace.
4. Resolve identities without silent merges.
5. Run audit and show which contributor creates each path.
6. Keep findings workspace-private.
7. For a chosen path, request permission from the contributor for that specific introduction outside the tool or through a later approval-gated workflow.

### Workflow 3 — Refresh and regression

1. Import a newer snapshot with source time.
2. Preserve prior claims and mark superseded state rather than rewriting history.
3. Recompute results.
4. Show new, changed, stale, suppressed, and removed paths.
5. Never reactivate a withdrawn contributor through refresh.

### Workflow 4 — Contributor withdrawal

1. Verify contributor/workspace authorization.
2. Mark consent withdrawn with effective timestamp.
3. Make their relationship edges ineligible immediately.
4. Delete or cryptographically/tombstone derived data according to policy.
5. Recompute impacted paths and record an audit event.
6. Export a receipt without leaking other contributors' data.

### Workflow 5 — Optional metadata adapter

1. Administrator authorizes a narrow connector scope.
2. Adapter declares capabilities and allowed fields.
3. Import metadata into evidence claims with source and retention.
4. Use it only to adjust freshness/confidence or flag existing CRM state.
5. Never send email, create CRM records, or request intros in audit mode.

## 9. Conceptual data model

### Workspace and governance

- `Workspace`: isolation boundary, owner, policy version, timestamps.
- `Contributor`: person or organizational source contributing a network.
- `ConsentRecord`: purpose, scope, source classes, granted/withdrawn time, expiry, disclosure rules.
- `RetentionPolicy`: TTL by record type, deletion behavior, export restrictions.
- `SuppressionRule`: person/account/domain/source/category exclusions.

### People and organizations

- `Person`: workspace-local canonical entity with no globally public identity assumption.
- `IdentityClaim`: email, profile URL from supplied data, name, or provider ID plus provenance and confidence.
- `Organization`: canonical workspace-local account.
- `OrganizationClaim`: name/domain/CRM ID/alias claim.
- `EmploymentClaim`: person, organization, title/function, current state, observed-at, source, confidence.

### Relationships and evidence

- `RelationshipEdge`: contributor knows destination directly according to a named authorized source; never inferred solely from co-employment.
- `InteractionEvidence`: minimized metadata or human attestation supporting freshness/context; not proof of willingness.
- `EvidenceRef`: immutable pointer/hash to imported source record and transform.
- `SourceSnapshot`: import identity, checksum, contributor, consent, mapping, timestamps.

### GTM configuration

- `IcpRuleSet`: versioned company-fit rules.
- `PersonaRuleSet`: versioned stakeholder-fit rules.
- `TargetAccount`: canonical organization, aliases, priority.
- `ExistingRevenueState`: optional CRM-derived customer/opportunity/suppression facts.

### Evaluation and review

- `AuditRun`: immutable config/input snapshot hashes and engine version.
- `CoverageResult`: category, component scores, reason codes, evidence, policy disposition.
- `Path`: broker and destination nodes plus eligible edges.
- `ResolutionCandidate`: potential duplicate/alias with human review state.
- `ReviewDecision`: actor, decision, reason, timestamp, prior state.
- `IntroCandidate`: approval-gated record; not an outbound message or executed introduction.
- `AuditEvent`: append-only security and governance history.

## 10. Trust model

### Trust assumptions

- The workspace owner controls the local runtime and storage.
- Imported files may be malformed or malicious and are untrusted until validated.
- A contributor's export is evidence of a source assertion, not proof of current closeness or willingness.
- Employment and persona data become stale.
- Authorized providers remain authoritative for their own records.
- Human review is authoritative for identity merges and intro readiness.

### Security/privacy principles

1. Local SQLite and local file processing by default.
2. Network-disabled core must remain fully useful.
3. Workspace and contributor scoping on all IDs and queries.
4. Raw source snapshots separated from normalized claims and derived results.
5. Data minimization; no message bodies/calendar descriptions by default.
6. Provenance and observed timestamps on every material claim.
7. No silent entity merge above ambiguity thresholds.
8. Consent limits processing; withdrawal invalidates downstream paths.
9. Audit result visibility is not permission to expose or contact a person.
10. An introduction requires bilateral opt-in: broker first, then recipient through the broker's normal human process; no automatic reveal/send.
11. Export sanitization prevents formula execution and unauthorized relation disclosure.
12. Retention and deletion are configurable and demonstrable.

## 11. MVP scope (v0.1)

### Included

- Local CLI and SQLite database.
- Owner and contributor registration with consent records.
- LinkedIn Connections CSV and generic CSV import with explicit mappings.
- Bounded parsing, validation, normalization, checksums, source snapshots.
- Conservative identity resolution and manual review queue.
- ICP/persona and target-account configuration files.
- A–D matching and reason-coded deterministic scoring.
- Staleness, suppression, duplicate grouping, and review states.
- Human-readable terminal report and sanitized JSON/CSV export.
- Contributor withdrawal and recomputation.
- Synthetic demo proving all four categories.
- Audit trail and no-network test mode.
- Credential-free adapter interfaces/mocks for later authorized metadata sources.

### Deferred

- Hosted multi-tenant service or web UI.
- Production OAuth connectors.
- Public enrichment or company-resolution service.
- Automated intro request workflow.
- CRM writes or automatic lead/contact creation.
- Continuous monitoring/alerts.
- Relationship-strength prediction from message content.
- A proprietary shared network or marketplace.

## 12. Functional requirements

- **FR-1:** Parse supported CSV forms without requiring LinkedIn credentials.
- **FR-2:** Reject unsupported/malformed files with actionable errors and no partial hidden mutation.
- **FR-3:** Scope all records and deterministic identifiers to a workspace.
- **FR-4:** Preserve source checksums, mappings, row provenance, and transform version.
- **FR-5:** Never silently merge ambiguous identities.
- **FR-6:** Resolve organization aliases separately from people.
- **FR-7:** Evaluate A–D independently and reproducibly.
- **FR-8:** Display reason codes, component scores, freshness, and confidence.
- **FR-9:** Apply suppressions and consent before results are eligible for display/export.
- **FR-10:** Immediately invalidate withdrawn contributor edges and derived paths.
- **FR-11:** Sanitize exported cells and relation detail according to policy.
- **FR-12:** Support complete local deletion and an auditable deletion receipt.
- **FR-13:** Make all external mutations impossible in default/audit mode.
- **FR-14:** Treat LLM output as optional explanatory text only.

## 13. Non-functional requirements

- Deterministic results for identical inputs/config/version.
- Useful with no API keys and no network access.
- Inspectable architecture and machine-readable schemas.
- Safe handling of at least 100,000 CSV rows without unbounded memory use (implementation target to validate).
- Transactional import and withdrawal operations.
- Idempotent re-import of identical snapshots.
- Clear error taxonomy and non-zero CLI exits.
- No raw secrets, message bodies, or private fixtures in package/repository.
- Cross-platform Node.js support where SQLite dependency permits.

## 14. Success metrics

MVP quality:

- Synthetic test suite covers all categories, suppression, ambiguity, staleness, and withdrawal.
- Every result traces to input rows and rule versions.
- Zero result paths survive contributor withdrawal.
- Re-running an identical audit yields byte-stable structured output, excluding generated timestamps.
- No-network demo completes in under five minutes on a laptop.

User value (future measured pilots):

- Percentage of target accounts with at least one review-approved path.
- Number of previously unreviewed direct ICP contacts surfaced.
- Reviewer acceptance/rejection rates by category and reason.
- False identity/employment/path rate.
- Time from import to a reviewable coverage report.

Do not optimize for messages sent or intros made without measuring trust and consent outcomes.

## 15. Explicit non-goals

Warm Path Audit will not:

- scrape LinkedIn or evade platform controls;
- create a public directory or central contact marketplace;
- claim that an edge is warm, strong, willing, or current without evidence;
- infer first-degree relationships from shared employers, schools, follows, or public pages;
- guess profile URLs or personal contact information;
- send email, DMs, intro requests, or outreach autonomously;
- auto-create CRM leads or advance opportunities by default;
- expose one contributor's network to another without workspace policy;
- use uploaded contacts to train a shared model or enrich other customers;
- score humans' worth, trustworthiness, or influence;
- replace human judgment about whether and how to ask for an introduction;
- include Consigliere's curated member graph, cross-member outcomes, context intelligence, or managed brokerage operations.

## 16. Open design questions for later states

- Exact import limits and safe streaming library.
- Whether source snapshots are encrypted at rest in the reference implementation or documented as deployment responsibility.
- Raw CSV bytes are never copied into project storage; operator-owned input remains outside the database and project-owned staging is deleted on success or failure.
- How organizational administrators establish lawful internal contribution policy without weakening individual consent defaults.
- Exact account/domain alias review UX in a CLI.
- Export formats that balance usefulness with contributor relation privacy.
- Package/module boundary between core matching engine and CLI.
