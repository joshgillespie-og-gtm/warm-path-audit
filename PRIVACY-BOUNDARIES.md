# Warm Path Audit — Privacy, Consent, and Product Boundaries

**Status:** Normative product boundary for design and implementation

**Applies to:** Core engine, CLI, examples, adapters, documentation, and future deployment guidance

## 1. Plain-language promise

Warm Path Audit helps a bounded workspace understand networks that people knowingly contributed or systems explicitly authorized. It does not scrape LinkedIn, construct a public people graph, sell contact data, send outreach, or treat a discovered path as permission to use it.

The product answers:

> “What coverage appears to exist, why does the system think so, and what must a human review?”

It does not answer:

> “Who can we contact automatically?”

## 2. Governing distinction: detection is not activation

A coverage result is a private analytical finding. It is not:

- permission to reveal a contributor's relationship;
- proof that the broker knows the destination well;
- proof that the destination is open to an introduction;
- proof that a person is a coach, champion, stakeholder, buyer, or lead;
- authorization to enrich, export, email, message, or create a CRM record.

The default product boundary ends at a human-reviewed `IntroCandidate`. Any later activation is a separate, explicit workflow.

## 3. Data allowed in the core product

### User-provided exports

Allowed when the workspace has a valid purpose and contributor record:

- LinkedIn Connections CSV exported and supplied by its account holder;
- generic contacts CSV;
- CRM/account/contact CSV exported by an authorized user;
- named target-account and ICP/persona configuration;
- human review decisions and scoped attestations.

### Authorized metadata adapters

Optional future adapters may collect narrowly defined metadata after explicit authorization:

- email participants, timestamps, stable source IDs, and aggregate interaction counts;
- calendar participants, timestamps, organizer and authoritative RSVP/attendance fields;
- CRM account/contact/opportunity/suppression state;
- enrichment claims about person/company attributes.

Default exclusions:

- email subject/body/attachments;
- calendar title, description, notes, or conference transcript;
- document content;
- private social messages;
- browsing history;
- phone numbers or personal email addresses when not needed for identity resolution and expressly allowed.

Adapters must declare purpose, scopes, fields, time window, retention, provider, and deletion behavior before collection.

## 4. Data acquisition prohibited

The public project must not implement, recommend, or document operational instructions for:

- scraping LinkedIn pages or search results;
- browser automation against LinkedIn;
- session cookie reuse or credential replay;
- undocumented/private LinkedIn APIs;
- CAPTCHA evasion or rate-limit circumvention;
- guessing profile URLs, emails, phone numbers, or relationships;
- importing purchased contact lists as if they were contributed relationships;
- covert employee, advisor, investor, customer, or partner network extraction;
- creating first-degree edges from shared employment, school, group, follow, or public-web co-mention.

## 5. Purpose limitation

Each workspace defines a versioned purpose such as:

> “Audit authorized team networks for direct ICP contacts and paths into the provided B2B target accounts.”

Data collected for that purpose may not silently be reused for:

- recruiting;
- consumer advertising;
- sale/resale of contact data;
- generalized model training;
- enrichment of unrelated workspaces;
- background screening;
- employment performance surveillance;
- political or sensitive-trait targeting;
- building a public directory.

Changing purpose requires a new policy version and, where applicable, renewed contributor consent.

## 6. Contributor consent model

### Required record

Every contributed dataset has a `ConsentRecord` (or explicitly documented organizational authorization where legally and ethically appropriate) containing:

- workspace and contributor IDs;
- purpose and plain-language notice version;
- source/data classes;
- allowed result categories;
- whether broker identity may be shown to named workspace roles;
- whether sanitized exports are allowed;
- granted timestamp and method;
- expiry/review date;
- withdrawal timestamp and reason (optional);
- retention/deletion policy version.

### Consent properties

Consent should be:

- informed: contributor understands what the audit does;
- specific: bounded workspace and purpose;
- revocable: withdrawal is supported, not merely promised;
- time-aware: expiry/review can be configured;
- non-transitive: contributor consent does not create destination consent;
- non-global: one workspace cannot make a contributor's data available to another.

### Organizational authorization

Future enterprise deployments may rely on another lawful basis or company policy for some business records. The reference product must not make legal conclusions. It must still represent:

- the authorization basis;
- notice state;
- purpose and field limits;
- role access;
- retention/deletion;
- objections/withdrawal where applicable.

It may never reinterpret “the company has access” as permission to expose employees' networks broadly.

## 7. Bilateral opt-in for introductions

Before an introduction:

1. A workspace reviewer chooses a specific path and purpose.
2. The broker receives the exact destination identity, requesting party, reason, and proposed context.
3. The broker explicitly chooses whether to participate.
4. If participating, the broker controls the approach to the destination using their normal channel.
5. The destination can accept or decline; silence is not consent.
6. Only after acceptance may an introduction be marked accepted/completed.

Core v0.1 does not implement these communications. It only records that an `IntroCandidate` needs approval.

No batch consent, implied consent from upload, or “opt out after send” behavior is permitted.

## 8. Visibility and relation exposure

### Workspace-private default

Coverage results remain inside the originating workspace. Role-based guidance for future deployments:

- contributors can view their own contribution and withdrawal status;
- reviewers can view eligible paths needed for the stated purpose;
- exports omit relation detail unless policy explicitly allows it;
- destinations do not become browsable directory entries;
- contributor email addresses and raw source identifiers do not appear in routine reports.

### Need-to-know display

Show the minimum needed for review:

- category and target account;
- destination role/person according to policy;
- broker identity only to authorized reviewers;
- reason, provenance class, confidence, and staleness;
- not raw source rows, private email metadata, or unrelated contacts.

### No graph portability by default

Do not provide a bulk edge-list export by default. Sanitized coverage reports can export selected results, but portable raw relationship graphs require a separate explicit policy and should remain out of the reference MVP.

## 9. Identity and relationship safeguards

### Identity

- Source identifiers are claims, not globally authoritative identity.
- Normalize supplied profile URLs; never fabricate them.
- Exact email can aid resolution only within authorized scope.
- Name + employer creates a review candidate, not an automatic merge.
- Shared domains and household emails require caution.
- Conflicts remain visible; they are not averaged away.

### Employment

- Every claim has source and observed time.
- Current employment decays or becomes review-required according to policy.
- Conflicting employment stays unresolved until reviewed.
- A target account match must identify aliases/domain/CRM mappings used.

### Relationships

- First-degree means a source explicitly asserted a direct connection.
- Interaction frequency can support recency/context but not willingness or trust.
- Human attestations name the attestor and scope.
- Public overlap is never silently promoted into a direct edge.

## 10. Confidence language

Allowed:

- “Direct connection asserted by contributor CSV imported on [date].”
- “Employment claim matches target account; last observed [date].”
- “Persona rules matched: function=sales, seniority=VP.”
- “Review required: identity collision.”

Disallowed without explicit supporting evidence:

- “Strong relationship.”
- “Will introduce.”
- “Champion.”
- “Trusted by.”
- “Knows well.”
- “Interested buyer.”

Use “coach/champion candidate” for B/D and “potential direct ICP lead” for A.

## 11. Retention and deletion

### Configurable policy

A workspace must define retention for:

- raw source snapshots;
- normalized claims;
- derived paths/results;
- audit events;
- sanitized exports.

Recommended reference defaults to evaluate in implementation:

- never copy raw CSV into project storage; delete project-owned staging on success or failure, while operator-owned source-file lifecycle remains explicit and outside the database;
- expire employment/relationship review confidence rather than silently deleting evidence;
- keep minimal tamper-evident audit receipts longer than person-level content where possible;
- make report exports separately discoverable and deletable.

### Contributor withdrawal

Withdrawal must:

- take effect immediately for eligibility;
- prevent new audits from using the contributor's edges;
- invalidate cached/derived paths;
- trigger recomputation;
- remove or tombstone data according to policy;
- preserve only the minimum audit proof needed to show the operation occurred;
- not reveal other contributors in the receipt.

### Workspace deletion

The local CLI must eventually support:

- preview/dry run;
- explicit confirmation;
- safe path checks;
- transactional deletion or documented failure state;
- deletion of database, raw snapshots, caches, and generated reports controlled by the project;
- a receipt listing categories/counts, not deleted personal values.

Backups and external exports must be disclosed as separate operator responsibilities.

## 12. Security boundaries

### Input files are hostile

Implementation must anticipate:

- CSV formulas beginning with `=`, `+`, `-`, `@`, tabs, or carriage returns;
- malformed quoting/encoding;
- giant rows, fields, or files;
- duplicate headers and ambiguous mappings;
- path traversal in supplied names;
- embedded URLs that should never be fetched automatically;
- content designed to manipulate an LLM or operator.

The importer must bound resources, validate mappings, avoid outbound fetches, and sanitize exports.

### Workspace isolation

All repository operations must require workspace scope. Composite uniqueness and foreign keys must prevent:

- cross-workspace person/edge/result reads;
- reuse of an approval/review in another workspace;
- source snapshot rebinding;
- cross-workspace deduplication based on email/profile URL.

A local demo is not an excuse to use global identifiers.

### External adapters

Adapters are untrusted boundaries and must support:

- explicit capabilities and field allowlists;
- least-privilege credentials;
- source event IDs and idempotency;
- rate limits/retries without duplicate evidence;
- observed/retrieved timestamps;
- deletion/revocation;
- redacted logs;
- no mutation in audit-only mode.

Credential-free mocks must never be marketed as production connectors.

## 13. LLM boundary

The core product does not require an LLM.

An optional LLM may:

- explain deterministic rule matches in plain language;
- suggest a human-readable summary from already eligible structured data;
- help map user-written ICP text into draft rules that require approval.

It may not:

- create a relationship edge;
- guess identity, profile URL, contact details, employer, or persona;
- silently merge people;
- determine consent;
- override suppression or staleness;
- send or approve an introduction;
- receive raw contact datasets through a hosted model by default.

If configured, model/provider, fields sent, retention terms, and operator approval must be explicit.

## 14. Sensitive data and prohibited inference

The project should not solicit or infer sensitive traits such as health, religion, race/ethnicity, sexual orientation, political affiliation, disability, or precise location. ICP/persona configuration should focus on business account and role attributes.

Suppress and warn on attempts to configure sensitive-trait targeting. This is not a complete legal compliance rule set; deployments require their own review.

## 15. Public open-source boundary

### Safe to publish

- generic schemas and algorithms;
- synthetic people/companies/domains reserved for examples;
- deterministic test fixtures;
- policy templates;
- local CLI and SQLite reference implementation;
- vendor-neutral adapter contracts and credential-free mocks;
- documentation of safe adoption and limitations.

### Never publish from private systems

- real member/customer/prospect contacts;
- raw Connections CSVs;
- real relationship edges or email/calendar metadata;
- generated client dossiers;
- credentials, tokens, API endpoints containing private identifiers;
- private Consigliere prompts, context, ranking logic, outcome records, or member policies;
- paths under private user/session data;
- customer-specific target accounts or ICPs without explicit publication rights.

Synthetic fixtures must use reserved domains such as `example.com` and obviously fictional people/companies.

## 16. Proprietary Consigliere boundary

Warm Path Audit may teach the general audit motion. It must not contain or reconstruct:

- Consigliere's curated member network;
- a cross-member graph assembled from Consigliere operations;
- private context intelligence or decision ledgers;
- match and introduction outcomes;
- proprietary relationship-quality or broker judgment;
- managed bilateral brokering workflow;
- customer-specific GTM strategy and economics.

A future Consigliere service may run or extend the public engine, but paid work never grants access to unrelated member data. The open-source project operates on the adopter's own authorized inputs.

## 17. Product copy guardrails

Prefer:

- “Audit networks you are authorized to use.”
- “Potential path; human review required.”
- “Source assertion last observed on…”
- “No scrape, no send, no shared contact database.”

Avoid:

- “Unlock anyone's network.”
- “Find anyone.”
- “Turn employees into a lead database.”
- “Guaranteed warm introductions.”
- “AI knows your strongest relationship.”
- “GDPR/CCPA compliant” without deployment-specific legal review.

## 18. Required tests before public release

Later implementation/audit states must prove:

- withdrawn contributor paths disappear;
- one workspace cannot read another's matching identifiers or paths;
- ambiguous same-name people are not silently merged;
- stale employment cannot qualify as current without review/policy;
- CSV formulas are neutralized in exports;
- profile URLs are never fetched or guessed;
- network-disabled test/demo succeeds;
- no adapter performs mutation in audit mode;
- synthetic fixtures contain no real/private identifiers;
- package/archive excludes local databases, raw CSVs, reports, environment files, and credentials;
- deterministic inputs produce deterministic categories and reasons.

## 19. Operator responsibilities

Open source cannot guarantee safe deployment by itself. Operators remain responsible for:

- establishing a lawful basis and clear purpose;
- giving required notices and honoring rights;
- choosing retention and access controls;
- securing local devices, backups, and exports;
- reviewing third-party adapter/model terms;
- deciding whether a relationship ask is appropriate;
- ensuring the broker and destination can freely decline;
- avoiding discriminatory or sensitive-trait use.

Documentation must state these responsibilities without presenting legal advice.
