import type { ConsentRecord } from "../domain/models.js";
import type {
  TransactionContext,
  WorkspaceRepository,
} from "../repositories/contracts.js";
import { normalizeDomain, normalizeEmail } from "../resolution/resolution.js";
import {
  canonicalJson,
  sha256Hex,
  workspaceScopedId,
} from "../security/deterministic.js";
import { appendOperationAudit } from "../security/operations.js";
import {
  AdapterBoundaryError,
  adapterAuthorizationSchema,
  adapterPageSchema,
  adapterRecordSchema,
  type AdapterAuthorization,
  type AdapterRecord,
  type ReadOnlyAdapter,
} from "./contracts.js";

const MAX_TOTAL_RECORDS = 10_000;
const MAX_CANONICAL_RECORD_BYTES = 64 * 1024;
const MAX_PAGES_PER_INVOCATION = 100;

export interface AdapterIngestRequest {
  workspaceId: string;
  contributorId: string;
  consentRecordId: string;
  purposeId: string;
  authorization: AdapterAuthorization;
  adapter: ReadOnlyAdapter;
  at: string;
  actorId: string;
  checkpointCursor?: string | null;
  pageLimit?: number;
  dryRun?: boolean;
}

export interface AdapterIngestResult {
  status: "completed" | "rate_limited" | "temporary_error";
  accepted: number;
  duplicates: number;
  nextCursor: string | null;
  retryAfterSeconds?: number;
  networkAccessed: false;
  dryRun: boolean;
}

const fieldForRecord = (record: AdapterRecord): string[] => {
  const fields = ["person_name"];
  if (record.personEmail) fields.push("person_email");
  if (record.personProviderId) fields.push("person_provider_id");
  if (record.organizationName) fields.push("organization_name");
  if (record.organizationDomain) fields.push("organization_domain");
  if (record.kind === "crm") {
    if (record.crmAccountId) fields.push("crm_account_id");
    if (record.crmContactId) fields.push("crm_contact_id");
    if (record.crmOwnerId) fields.push("crm_owner_id");
    if (record.opportunityStage) fields.push("crm_opportunity_stage");
    if (record.suppressionState) fields.push("crm_suppression_state");
  } else {
    fields.push("participant_addresses");
    if (record.kind === "email") {
      fields.push("event_timestamp");
      if (record.threadId) fields.push("thread_id");
      if (record.direction) fields.push("direction");
      if (record.interactionCount) fields.push("interaction_count");
    } else {
      fields.push("start_at", "end_at");
      if (record.organizerAddress) fields.push("organizer_address");
      if (record.rsvp) fields.push("rsvp");
      if (record.attendance) fields.push("attendance");
    }
  }
  return fields;
};

export function ingestAdapter(
  request: AdapterIngestRequest,
  store: WorkspaceRepository,
): AdapterIngestResult {
  const workspace = store.getWorkspace(request.workspaceId);
  if (!workspace) throw new AdapterBoundaryError("WORKSPACE_NOT_FOUND");
  if (workspace.purposeId !== request.purposeId)
    throw new AdapterBoundaryError("PURPOSE_MISMATCH");
  const authorization = adapterAuthorizationSchema.parse(request.authorization);
  assertAuthorization(request, authorization);
  const consent = store.getConsent(
    request.workspaceId,
    request.consentRecordId,
  );
  assertConsent(consent, request, request.adapter.declaration.capability);
  if (!request.adapter.declaration.readOnly)
    throw new AdapterBoundaryError("WRITE_CAPABILITY_REJECTED");
  if (request.adapter.declaration.networkAccessed)
    throw new AdapterBoundaryError("REFERENCE_ADAPTER_NETWORK_ACCESS_REJECTED");

  let cursor = request.checkpointCursor ?? null;
  let accepted = 0,
    duplicates = 0,
    pages = 0;
  const seenCursors = new Set<string | null>();
  while (
    pages < MAX_PAGES_PER_INVOCATION &&
    accepted + duplicates < MAX_TOTAL_RECORDS
  ) {
    if (seenCursors.has(cursor))
      throw new AdapterBoundaryError("CURSOR_REPLAY_LOOP");
    seenCursors.add(cursor);
    const page = adapterPageSchema.parse(
      request.adapter.readPage({
        cursor,
        limit: Math.min(request.pageLimit ?? 100, 1000),
      }),
    );
    if (page.records.length > Math.min(request.pageLimit ?? 100, 1000))
      throw new AdapterBoundaryError("ADAPTER_PAGE_LIMIT_EXCEEDED");
    if (page.error) {
      if (
        page.error.code === "RATE_LIMITED" ||
        page.error.code === "TEMPORARY"
      ) {
        audit(request, store, "adapter_checkpointed_error", {
          code: page.error.code,
          cursor,
          retryAfterSeconds: page.error.retryAfterSeconds,
        });
        return {
          status:
            page.error.code === "RATE_LIMITED"
              ? "rate_limited"
              : "temporary_error",
          accepted,
          duplicates,
          nextCursor: cursor,
          ...(page.error.retryAfterSeconds === undefined
            ? {}
            : { retryAfterSeconds: page.error.retryAfterSeconds }),
          networkAccessed: false,
          dryRun: Boolean(request.dryRun),
        };
      }
      throw new AdapterBoundaryError(`PROVIDER_${page.error.code}`);
    }
    for (const input of page.records) {
      const record = adapterRecordSchema.parse(input);
      assertRecord(request, authorization, record);
      const canonical = canonicalJson(record);
      if (Buffer.byteLength(canonical, "utf8") > MAX_CANONICAL_RECORD_BYTES)
        throw new AdapterBoundaryError("RECORD_TOO_LARGE");
      const recordDigest = sha256Hex(canonical);
      const recordId = workspaceScopedId(
        request.workspaceId,
        "adapter_record",
        {
          adapterAuthorizationId: authorization.adapterAuthorizationId,
          providerTenantId: authorization.providerTenantId,
          providerRecordId: record.providerRecordId,
          recordDigest,
        },
      );
      const existingByProviderId = store
        .list(request.workspaceId, "adapter_metadata_record")
        .find(
          (entity) =>
            entity.entityType === "adapter_metadata_record" &&
            entity.value.adapterAuthorizationId ===
              authorization.adapterAuthorizationId &&
            entity.value.providerRecordId === record.providerRecordId,
        );
      if (existingByProviderId) {
        if (existingByProviderId.entityType !== "adapter_metadata_record")
          throw new Error();
        if (existingByProviderId.value.recordDigestSha256 !== recordDigest)
          throw new AdapterBoundaryError("PROVIDER_RECORD_REBINDING_REJECTED");
        duplicates++;
        continue;
      }
      if (!request.dryRun) {
        materializeNormalizedAdapterRecord(
          store,
          request,
          authorization,
          record,
          recordId,
          recordDigest,
          {
            entityType: "adapter_metadata_record",
            value: {
              workspaceId: request.workspaceId,
              adapterMetadataRecordId: recordId,
              adapterAuthorizationId: authorization.adapterAuthorizationId,
              contributorId: request.contributorId,
              consentRecordId: request.consentRecordId,
              provider: authorization.provider,
              providerTenantId: authorization.providerTenantId,
              providerRecordId: record.providerRecordId,
              sourceKind: `${record.kind}_metadata`,
              observedAt: record.observedAt,
              importedAt: request.at,
              recordDigestSha256: recordDigest,
              fields: Object.fromEntries(
                Object.entries(record).filter(
                  ([key]) =>
                    ![
                      "workspaceId",
                      "adapterAuthorizationId",
                      "providerTenantId",
                    ].includes(key),
                ),
              ),
              networkAccessed: false,
              createsRelationshipEdge: false,
            },
          },
        );
      }
      accepted++;
    }
    pages++;
    if (page.nextCursor === null) {
      cursor = null;
      break;
    }
    cursor = page.nextCursor;
  }
  if (
    accepted + duplicates >= MAX_TOTAL_RECORDS ||
    pages >= MAX_PAGES_PER_INVOCATION
  )
    throw new AdapterBoundaryError("INVOCATION_BOUND_EXCEEDED");
  audit(request, store, request.dryRun ? "adapter_dry_run" : "adapter_ingest", {
    accepted,
    duplicates,
    cursor,
  });
  return {
    status: "completed",
    accepted,
    duplicates,
    nextCursor: cursor,
    networkAccessed: false,
    dryRun: Boolean(request.dryRun),
  };
}

function materializeNormalizedAdapterRecord(
  store: WorkspaceRepository,
  request: AdapterIngestRequest,
  authorization: AdapterAuthorization,
  record: AdapterRecord,
  recordId: string,
  recordDigest: string,
  metadataRecord: Parameters<TransactionContext["put"]>[0],
): void {
  const sourceKind = `${record.kind}_metadata`;
  const snapshotId = workspaceScopedId(
    request.workspaceId,
    "adapter_snapshot",
    {
      adapterAuthorizationId: authorization.adapterAuthorizationId,
      providerTenantId: authorization.providerTenantId,
      providerRecordId: record.providerRecordId,
      recordDigest,
    },
  );
  const evidenceId = workspaceScopedId(
    request.workspaceId,
    "adapter_evidence",
    {
      snapshotId,
      recordId,
    },
  );
  const personAnchor =
    record.personProviderId ??
    (record.kind === "crm" ? record.crmContactId : undefined) ??
    record.providerRecordId;
  const personId = workspaceScopedId(request.workspaceId, "person", {
    namespace: `${authorization.provider}:${authorization.providerTenantId}`,
    personAnchor,
  });
  store.transact(request.workspaceId, (tx) => {
    tx.put({
      entityType: "source_snapshot",
      value: {
        workspaceId: request.workspaceId,
        sourceSnapshotId: snapshotId,
        contributorId: request.contributorId,
        consentRecordId: request.consentRecordId,
        sourceKind,
        rawSha256: recordDigest,
        idempotencyKey: sha256Hex(
          canonicalJson({
            workspaceId: request.workspaceId,
            adapterAuthorizationId: authorization.adapterAuthorizationId,
            providerTenantId: authorization.providerTenantId,
            providerRecordId: record.providerRecordId,
            recordDigest,
          }),
        ),
        mappingId: `mapping_${record.kind}_adapter_v1`,
        mappingVersion: "1",
        importedAt: request.at,
        sourceObservedAt: record.observedAt,
        byteCount: Buffer.byteLength(canonicalJson(record), "utf8"),
        recordCount: 1,
        rawRetained: false,
        networkAccessed: false,
        transformVersion: "adapter-normalize-v1",
      },
    });
    tx.put(metadataRecord);
    tx.put({
      entityType: "evidence_ref",
      value: {
        workspaceId: request.workspaceId,
        evidenceRefId: evidenceId,
        sourceSnapshotId: snapshotId,
        sourceRecordId: recordId,
        claimType: "identity",
        rowDigestSha256: recordDigest,
        transformVersion: "adapter-normalize-v1",
      },
    });
    tx.put({
      entityType: "person",
      value: {
        workspaceId: request.workspaceId,
        personId,
        displayName: record.personName.normalize("NFKC").trim(),
        createdAt: request.at,
      },
    });
    const identities: ["name" | "email" | "provider_id", string][] = [
      ["name", record.personName.normalize("NFKC").trim()],
      ["provider_id", personAnchor],
    ];
    if (record.personEmail)
      identities.push(["email", normalizeEmail(record.personEmail)]);
    for (const [kind, value] of identities)
      tx.put({
        entityType: "identity_claim",
        value: {
          workspaceId: request.workspaceId,
          identityClaimId: workspaceScopedId(
            request.workspaceId,
            "adapter_identity",
            {
              snapshotId,
              personId,
              kind,
              value,
            },
          ),
          personId,
          kind,
          namespace: `${authorization.provider}:${authorization.providerTenantId}:${kind}`,
          value,
          evidenceRefs: [evidenceId],
          confidence: kind === "name" ? 0.6 : 1,
          observedAt: record.observedAt,
          reviewStatus: "unreviewed",
        },
      });
    if (record.organizationName) {
      const organizationAnchor =
        (record.kind === "crm" ? record.crmAccountId : undefined) ??
        record.organizationDomain ??
        record.organizationName;
      const organizationId = workspaceScopedId(
        request.workspaceId,
        "organization",
        {
          namespace: `${authorization.provider}:${authorization.providerTenantId}`,
          organizationAnchor,
        },
      );
      tx.put({
        entityType: "organization",
        value: {
          workspaceId: request.workspaceId,
          organizationId,
          canonicalName: record.organizationName.normalize("NFKC").trim(),
          createdAt: request.at,
        },
      });
      const orgClaims: ["name" | "domain" | "crm_id", string][] = [
        ["name", record.organizationName.normalize("NFKC").trim()],
      ];
      if (record.organizationDomain)
        orgClaims.push(["domain", normalizeDomain(record.organizationDomain)]);
      if (record.kind === "crm" && record.crmAccountId)
        orgClaims.push(["crm_id", record.crmAccountId]);
      for (const [kind, value] of orgClaims)
        tx.put({
          entityType: "organization_claim",
          value: {
            workspaceId: request.workspaceId,
            organizationClaimId: workspaceScopedId(
              request.workspaceId,
              "adapter_org_claim",
              {
                snapshotId,
                organizationId,
                kind,
                value,
              },
            ),
            organizationId,
            kind,
            namespace: `${authorization.provider}:${authorization.providerTenantId}:${kind}`,
            value,
            evidenceRefs: [evidenceId],
            confidence: kind === "name" ? 0.6 : 1,
            observedAt: record.observedAt,
            reviewStatus: "unreviewed",
          },
        });
      tx.put({
        entityType: "employment_claim",
        value: {
          workspaceId: request.workspaceId,
          employmentClaimId: workspaceScopedId(
            request.workspaceId,
            "adapter_employment",
            {
              snapshotId,
              personId,
              organizationId,
            },
          ),
          personId,
          organizationId,
          state: "unknown",
          evidenceRefs: [evidenceId],
          confidence: 0.6,
          observedAt: record.observedAt,
          reviewStatus: "unreviewed",
        },
      });
    }
  });
}

function assertAuthorization(
  request: AdapterIngestRequest,
  auth: AdapterAuthorization,
): void {
  if (auth.workspaceId !== request.workspaceId)
    throw new AdapterBoundaryError("CROSS_WORKSPACE_AUTHORIZATION");
  if (
    auth.adapterId !== request.adapter.declaration.adapterId ||
    auth.provider !== request.adapter.declaration.provider
  )
    throw new AdapterBoundaryError("ADAPTER_BINDING_MISMATCH");
  if (auth.purposeId !== request.purposeId)
    throw new AdapterBoundaryError("PURPOSE_MISMATCH");
  if (auth.status === "revoked" || auth.revokedAt)
    throw new AdapterBoundaryError("AUTHORIZATION_REVOKED");
  if (auth.status !== "active")
    throw new AdapterBoundaryError("AUTHORIZATION_INACTIVE");
  const at = Date.parse(request.at);
  if (at < Date.parse(auth.authorizedAt) || at >= Date.parse(auth.expiresAt))
    throw new AdapterBoundaryError("AUTHORIZATION_NOT_ACTIVE_AT_USE");
  if (!auth.capabilities.includes(request.adapter.declaration.capability))
    throw new AdapterBoundaryError("UNAUTHORIZED_CAPABILITY");
  if (auth.authorizationBasis !== "authorized_local_fixture")
    throw new AdapterBoundaryError("REFERENCE_IMPLEMENTATION_FIXTURE_ONLY");
}
function assertConsent(
  consent: ConsentRecord | undefined,
  request: AdapterIngestRequest,
  capability: string,
): void {
  if (
    !consent?.contributorId ||
    consent.contributorId !== request.contributorId ||
    consent.purposeId !== request.purposeId
  )
    throw new AdapterBoundaryError("CONSENT_BINDING_INVALID");
  const source = capability.replace("read_", "");
  if (!consent.sourceClasses.includes(source))
    throw new AdapterBoundaryError("CONSENT_SOURCE_SCOPE_DENIED");
  const at = Date.parse(request.at);
  if (
    consent.status !== "active" ||
    consent.withdrawnAt ||
    at < Date.parse(consent.grantedAt) ||
    at >= Date.parse(consent.expiresAt)
  )
    throw new AdapterBoundaryError("CONSENT_INACTIVE");
}
function assertRecord(
  request: AdapterIngestRequest,
  auth: AdapterAuthorization,
  record: AdapterRecord,
): void {
  if (record.workspaceId !== request.workspaceId)
    throw new AdapterBoundaryError("CROSS_WORKSPACE_RECORD");
  if (
    record.adapterAuthorizationId !== auth.adapterAuthorizationId ||
    record.providerTenantId !== auth.providerTenantId
  )
    throw new AdapterBoundaryError("RECORD_AUTHORIZATION_BINDING_INVALID");
  const capability = `read_${record.kind}_metadata`;
  if (capability !== request.adapter.declaration.capability)
    throw new AdapterBoundaryError("RECORD_CAPABILITY_MISMATCH");
  if (
    Date.parse(record.observedAt) < Date.parse(auth.timeWindow.from) ||
    Date.parse(record.observedAt) > Date.parse(auth.timeWindow.to)
  )
    throw new AdapterBoundaryError("STALE_OR_OUT_OF_WINDOW_METADATA");
  const allowed = new Set(auth.fieldAllowlist);
  for (const field of fieldForRecord(record))
    if (!allowed.has(field as never))
      throw new AdapterBoundaryError(`FIELD_NOT_AUTHORIZED:${field}`);
}
function audit(
  request: AdapterIngestRequest,
  store: WorkspaceRepository,
  eventType: string,
  payload: unknown,
): void {
  if (request.dryRun) return;
  appendOperationAudit(store, request.workspaceId, {
    eventType,
    actorId: request.actorId,
    occurredAt: request.at,
    subjectType: "adapter_authorization",
    subjectId: request.authorization.adapterAuthorizationId,
    payload,
  });
}
