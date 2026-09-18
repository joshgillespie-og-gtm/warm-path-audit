import { describe, expect, it } from "vitest";
import {
  InMemoryWorkspaceStore,
  LocalFixtureAdapter,
  ingestAdapter,
  withdrawContributorConsent,
  type AdapterAuthorization,
  type AdapterRecord,
  type ReadOnlyAdapter,
} from "../src/index.js";
import { consent, contributor, workspace } from "./fixtures.js";

const WS = "workspace_adapter";
const AT = "2026-09-18T00:00:00.000Z";
const fields = [
  "person_name",
  "person_email",
  "organization_name",
  "organization_domain",
  "crm_account_id",
  "crm_contact_id",
  "crm_owner_id",
  "crm_opportunity_stage",
  "crm_suppression_state",
] as const;
const authorization = (
  overrides: Partial<AdapterAuthorization> = {},
): AdapterAuthorization => ({
  workspaceId: WS,
  adapterAuthorizationId: "auth_crm_fixture",
  adapterId: "generic_crm_fixture",
  provider: "generic_crm",
  providerTenantId: "tenant_example",
  authorizationBasis: "authorized_local_fixture",
  purposeId: "purpose_audit",
  capabilities: ["read_crm_metadata"],
  fieldAllowlist: [...fields],
  timeWindow: {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-09-18T00:00:00.000Z",
  },
  retentionDays: 30,
  authorizedAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2026-10-01T00:00:00.000Z",
  status: "active",
  credentialsEmbedded: false,
  ...overrides,
});
const record = (overrides: Partial<AdapterRecord> = {}): AdapterRecord =>
  ({
    kind: "crm",
    workspaceId: WS,
    adapterAuthorizationId: "auth_crm_fixture",
    providerTenantId: "tenant_example",
    providerRecordId: "contact_001",
    observedAt: "2026-09-17T12:00:00.000Z",
    personName: "Alex Example",
    personEmail: "alex@example.com",
    organizationName: "Northstar Example",
    organizationDomain: "northstar.example.com",
    crmAccountId: "account_001",
    crmContactId: "contact_001",
    crmOwnerId: "owner_001",
    opportunityStage: "qualified",
    suppressionState: "clear",
    ...overrides,
  }) as AdapterRecord;
function setup() {
  const store = new InMemoryWorkspaceStore();
  store.createWorkspace(workspace(WS));
  store.put(WS, { entityType: "contributor", value: contributor(WS) });
  store.put(WS, {
    entityType: "consent",
    value: consent(WS, {
      sourceClasses: ["crm_metadata", "email_metadata", "calendar_metadata"],
    }),
  });
  return store;
}
const adapter = (records: unknown[] = [record()]) =>
  new LocalFixtureAdapter({
    adapterId: "generic_crm_fixture",
    provider: "generic_crm",
    capability: "read_crm_metadata",
    supportedFields: fields,
    records,
  });
const run = (
  store = setup(),
  overrides: Partial<Parameters<typeof ingestAdapter>[0]> = {},
) =>
  ingestAdapter(
    {
      workspaceId: WS,
      contributorId: "contributor_casey",
      consentRecordId: "consent_casey",
      purposeId: "purpose_audit",
      authorization: authorization(),
      adapter: adapter(),
      at: AT,
      actorId: "actor_owner",
      pageLimit: 100,
      ...overrides,
    },
    store,
  );

describe("read-only adapter boundary", () => {
  it("normalizes synthetic CRM metadata through snapshot, evidence, claim, consent, and audit boundaries", () => {
    const store = setup();
    expect(run(store)).toMatchObject({
      status: "completed",
      accepted: 1,
      duplicates: 0,
      networkAccessed: false,
    });
    expect(store.list(WS, "adapter_metadata_record")).toHaveLength(1);
    expect(store.list(WS, "source_snapshot")).toHaveLength(1);
    expect(store.list(WS, "evidence_ref")).toHaveLength(1);
    expect(store.list(WS, "identity_claim").length).toBeGreaterThanOrEqual(2);
    expect(store.list(WS, "organization_claim").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(store.list(WS, "employment_claim")).toHaveLength(1);
    expect(store.list(WS, "relationship_edge")).toHaveLength(0);
    expect(store.listAuditEvents(WS)).toHaveLength(1);
  });
  it("withdrawal deletes consent-bound adapter metadata, snapshots, evidence, and claims", () => {
    const store = setup();
    run(store);
    const receipt = withdrawContributorConsent(
      store,
      WS,
      "consent_casey",
      "actor_owner",
      "Contributor withdrew",
      "2026-09-19T00:00:00.000Z",
    );
    expect(receipt.counts["adapter_records"]).toBe(1);
    expect(store.list(WS, "adapter_metadata_record")).toHaveLength(0);
    expect(store.list(WS, "source_snapshot")).toHaveLength(0);
    expect(store.list(WS, "evidence_ref")).toHaveLength(0);
    expect(store.list(WS, "identity_claim")).toHaveLength(0);
    expect(store.list(WS, "organization_claim")).toHaveLength(0);
    expect(store.list(WS, "employment_claim")).toHaveLength(0);
  });
  it("dry-run validates without persistence or audit", () => {
    const store = setup();
    expect(run(store, { dryRun: true })).toMatchObject({
      accepted: 1,
      dryRun: true,
    });
    expect(store.list(WS, "adapter_metadata_record")).toHaveLength(0);
    expect(store.listAuditEvents(WS)).toHaveLength(0);
  });
  it.each([
    [
      "cross-workspace authorization",
      { authorization: authorization({ workspaceId: "workspace_other" }) },
      "CROSS_WORKSPACE_AUTHORIZATION",
    ],
    [
      "unauthorized scope",
      {
        authorization: authorization({ capabilities: ["read_email_metadata"] }),
      },
      "UNAUTHORIZED_CAPABILITY",
    ],
    [
      "revoked authorization",
      {
        authorization: authorization({
          status: "revoked",
          revokedAt: "2026-09-17T00:00:00.000Z",
        }),
      },
      "AUTHORIZATION_REVOKED",
    ],
    [
      "stale metadata",
      {
        adapter: adapter([record({ observedAt: "2025-01-01T00:00:00.000Z" })]),
      },
      "STALE_OR_OUT_OF_WINDOW_METADATA",
    ],
    [
      "cross-workspace record",
      { adapter: adapter([record({ workspaceId: "workspace_other" })]) },
      "CROSS_WORKSPACE_RECORD",
    ],
  ])("rejects %s", (_name, overrides, code) => {
    expect(() => run(setup(), overrides as never)).toThrow(code);
  });
  it("rejects malformed and oversized records before persistence", () => {
    expect(() =>
      adapter([{ ...record(), subject: "forbidden message content" }]),
    ).toThrow();
    expect(() => adapter([record({ personName: "x".repeat(201) })])).toThrow();
  });
  it("deduplicates exact provider records and rejects rebinding", () => {
    const store = setup();
    run(store);
    expect(run(store)).toMatchObject({ accepted: 0, duplicates: 1 });
    expect(() =>
      run(store, {
        adapter: adapter([record({ opportunityStage: "closed" })]),
      }),
    ).toThrow("PROVIDER_RECORD_REBINDING_REJECTED");
  });
  it("rejects cursor replay rather than looping", () => {
    const looping: ReadOnlyAdapter = {
      declaration: adapter().declaration,
      readPage: () => ({
        records: [],
        nextCursor: "same",
        networkAccessed: false,
      }),
    };
    expect(() => run(setup(), { adapter: looping })).toThrow(
      "CURSOR_REPLAY_LOOP",
    );
  });
  it("returns normalized rate-limit state without retries", () => {
    const limited = new LocalFixtureAdapter({
      adapterId: "generic_crm_fixture",
      provider: "generic_crm",
      capability: "read_crm_metadata",
      supportedFields: fields,
      records: [],
      scriptedError: {
        code: "RATE_LIMITED",
        retryable: true,
        retryAfterSeconds: 60,
        providerStatus: 429,
      },
    });
    expect(run(setup(), { adapter: limited })).toMatchObject({
      status: "rate_limited",
      accepted: 0,
      retryAfterSeconds: 60,
    });
  });
  it("rejects an attempted write-capable or networked implementation", () => {
    const base = adapter();
    const bad: ReadOnlyAdapter = {
      declaration: { ...base.declaration, readOnly: false },
      readPage: (input) => base.readPage(input),
    };
    expect(() => run(setup(), { adapter: bad })).toThrow(
      "WRITE_CAPABILITY_REJECTED",
    );
    const networked: ReadOnlyAdapter = {
      declaration: { ...base.declaration, networkAccessed: true },
      readPage: (input) => base.readPage(input),
    };
    expect(() => run(setup(), { adapter: networked })).toThrow(
      "REFERENCE_ADAPTER_NETWORK_ACCESS_REJECTED",
    );
  });
});
