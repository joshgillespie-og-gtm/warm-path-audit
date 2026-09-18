# Optional read-only adapter contracts

## Exact status

| Surface                                                                                              | Status                         |  Network access |               Mutation |
| ---------------------------------------------------------------------------------------------------- | ------------------------------ | --------------: | ---------------------: |
| Vendor-neutral TypeScript contracts                                                                  | Implemented                    |            None | Impossible by contract |
| Local fixture reference adapter                                                                      | Implemented and tested         |            None |                   None |
| Dry-run validation                                                                                   | Implemented and tested         |            None |                   None |
| Normalization into local snapshot, evidence, identity, organization, employment and metadata records | Implemented and tested         |            None |                   None |
| Generic CRM field mapping                                                                            | Illustrative reference mapping |            None |                   None |
| Attio mapping                                                                                        | Illustrative only              | Not implemented |        Not implemented |
| HubSpot mapping                                                                                      | Illustrative only              | Not implemented |        Not implemented |
| Email/calendar contracts                                                                             | Implemented                    |            None |                   None |
| Email/calendar provider connectors                                                                   | Not implemented                | Not implemented |        Not implemented |

There is **no production provider support**. No OAuth flow, API key handling, HTTP client, polling daemon, or provider SDK is shipped. Adapters are disabled unless a caller explicitly constructs an authorization and invokes ingestion. The credential-free local fixture is the only executable reference adapter.

## Boundary

Every invocation binds the workspace, provider tenant, purpose, contributor consent, authorization, declared capability, field allowlist and time window. Authorizations must be active at use time and the reference implementation accepts only `authorized_local_fixture`. Revocation, expiry, wrong purpose, wrong tenant, cross-workspace records, unallowed fields, stale records and write/network declarations fail closed.

Records are bounded to 64 KiB canonical JSON, 1,000 records per page, 10,000 records and 100 pages per invocation. Cursors are opaque checkpoints; repeated cursors are rejected. A rate limit or temporary provider error is returned as normalized data with an optional `retryAfterSeconds`. The core never sleeps, retries, or loops autonomously.

Accepted records pass through the same local workspace store and become:

- a consent-bound `SourceSnapshotMetadata` with `rawRetained=false` and `networkAccessed=false`;
- immutable evidence carrying the record digest;
- conservative identity, organization and unknown-employment claims;
- a minimized adapter metadata record for CRM state or interaction metadata;
- an append-only audit event.

Adapter metadata **never creates a relationship edge** and cannot imply warmth, willingness, or permission to contact. Email subject/body/snippet/attachments/labels and calendar title/description/location/notes/conference links/transcripts are absent from the contract.

## CRM-first normalized fields

The generic CRM contract permits explicitly allowlisted person name/email/provider ID, organization name/domain, account/contact/owner IDs, opportunity stage and suppression state. These are audit inputs, not write instructions. CRM metadata can flag existing state and aid conservative account/person resolution; ambiguous mappings remain claims for review.

Illustrative provider mappings only:

| Canonical field         | HubSpot illustration                   | Attio illustration                         |
| ----------------------- | -------------------------------------- | ------------------------------------------ |
| `crm_contact_id`        | contact object record ID               | person record ID                           |
| `crm_account_id`        | company object record ID               | company record ID                          |
| `crm_owner_id`          | owner ID                               | workspace member/owner reference           |
| `crm_opportunity_stage` | deal stage label/ID                    | list/status attribute selected by operator |
| `crm_suppression_state` | operator-approved suppression property | operator-approved suppression attribute    |

Provider schemas differ by portal/workspace and customization. These rows are design examples, not verified API mappings or claims of compatibility.

## Safe fixture example

```ts
const adapter = new LocalFixtureAdapter({
  adapterId: "generic_crm_fixture",
  provider: "generic_crm",
  capability: "read_crm_metadata",
  supportedFields: ["person_name", "crm_contact_id", "crm_account_id"],
  records: syntheticRecords,
});

const preview = ingestAdapter(
  {
    workspaceId,
    contributorId,
    consentRecordId,
    purposeId,
    authorization,
    adapter,
    at: fixedClock,
    actorId,
    dryRun: true,
  },
  store,
);
```

Fixtures must be synthetic. Imported URLs remain inert. This does not authorize LinkedIn scraping, browser automation, private APIs, guessed URLs, enrichment, contact creation, outreach, CRM writes, or publication.
