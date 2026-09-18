import type { DeletionReceipt } from "../domain/models.js";
import type { WorkspaceRepository } from "../repositories/contracts.js";
import {
  canonicalJson,
  sha256Hex,
  workspaceScopedId,
} from "../security/deterministic.js";

export function withdrawContributorConsent(
  store: WorkspaceRepository,
  workspaceId: string,
  consentRecordId: string,
  actorId: string,
  reason: string,
  at: string,
): DeletionReceipt {
  const consent = store.getConsent(workspaceId, consentRecordId);
  if (!consent) throw new Error("CONSENT_NOT_FOUND");
  const contributor = store.get(
    workspaceId,
    "contributor",
    consent.contributorId,
  );
  if (contributor?.entityType !== "contributor")
    throw new Error("CONTRIBUTOR_NOT_FOUND");
  const snapshots = store
    .list(workspaceId, "source_snapshot")
    .filter(
      (x) =>
        x.entityType === "source_snapshot" &&
        x.value.consentRecordId === consentRecordId,
    );
  const snapshotIds = new Set(
    snapshots.flatMap((x) =>
      x.entityType === "source_snapshot" ? [x.value.sourceSnapshotId] : [],
    ),
  );
  const edges = store
    .list(workspaceId, "relationship_edge")
    .filter(
      (x) =>
        x.entityType === "relationship_edge" &&
        x.value.consentRecordId === consentRecordId,
    );
  const evidence = store
    .list(workspaceId, "evidence_ref")
    .filter(
      (x) =>
        x.entityType === "evidence_ref" &&
        snapshotIds.has(x.value.sourceSnapshotId),
    );
  const claims = [
    "identity_claim",
    "organization_claim",
    "employment_claim",
  ] as const;
  const dependentClaims = claims.flatMap((type) =>
    store
      .list(workspaceId, type)
      .filter(
        (x) =>
          x.entityType === type &&
          x.value.evidenceRefs.some((id) =>
            evidence.some(
              (e) =>
                e.entityType === "evidence_ref" && e.value.evidenceRefId === id,
            ),
          ),
      ),
  );
  const adapterRecords = store
    .list(workspaceId, "adapter_metadata_record")
    .filter(
      (x) =>
        x.entityType === "adapter_metadata_record" &&
        x.value.consentRecordId === consentRecordId,
    );
  // A mixed-source result is invalidated in full when any declared dependency is
  // withdrawn. Partial evidence subtraction could change ranking/category and is
  // deferred to a fresh deterministic matching run.
  const results = store
    .list(workspaceId, "coverage_result")
    .filter(
      (x) =>
        x.entityType === "coverage_result" &&
        x.value.dependencies.consentRecordIds.includes(consentRecordId),
    );
  const counts = {
    snapshots: snapshots.length,
    evidence: evidence.length,
    claims: dependentClaims.length,
    edges: edges.length,
    results: results.length,
    adapter_records: adapterRecords.length,
  };
  const scopeDigest = sha256Hex(
    canonicalJson({
      workspaceId,
      contributorId: consent.contributorId,
      consentRecordId,
      counts,
    }),
  );
  const receipt: DeletionReceipt = {
    workspaceId,
    receiptId: workspaceScopedId(workspaceId, "receipt", {
      consentRecordId,
      at,
    }),
    operation: "contributor_withdrawal",
    subjectScopeDigest: scopeDigest,
    requestedAt: at,
    completedAt: at,
    status: "completed_with_external_actions_required",
    policyId: consent.retentionPolicyId,
    policyVersion: "1",
    counts,
    externalActionsRequired: ["operator_backups_and_copied_exports"],
    personalValuesIncluded: false,
    otherContributorIdsIncluded: false,
    auditChainHash: sha256Hex(
      canonicalJson({
        actorId,
        reasonCode: sha256Hex(reason),
        scopeDigest,
        at,
      }),
    ),
  };
  store.transact(workspaceId, (tx) => {
    tx.put({
      entityType: "consent",
      value: {
        ...consent,
        status: "withdrawn",
        withdrawnAt: at,
        withdrawalReason: reason,
      },
    });
    tx.put({
      entityType: "contributor",
      value: { ...contributor.value, status: "withdrawn" },
    });
    for (const entity of [
      ...results,
      ...adapterRecords,
      ...edges,
      ...dependentClaims,
      ...evidence,
      ...snapshots,
    ])
      tx.delete(
        entity.entityType,
        (() => {
          switch (entity.entityType) {
            case "coverage_result":
              return entity.value.resultId;
            case "relationship_edge":
              return entity.value.relationshipEdgeId;
            case "adapter_metadata_record":
              return entity.value.adapterMetadataRecordId;
            case "identity_claim":
              return entity.value.identityClaimId;
            case "organization_claim":
              return entity.value.organizationClaimId;
            case "employment_claim":
              return entity.value.employmentClaimId;
            case "evidence_ref":
              return entity.value.evidenceRefId;
            case "source_snapshot":
              return entity.value.sourceSnapshotId;
            default:
              throw new Error("UNREACHABLE");
          }
        })(),
      );
    tx.put({ entityType: "deletion_receipt", value: receipt });
  });
  return receipt;
}
