import type {
  AuditEvent,
  ConsentRecord,
  CoverageResult,
  RelationshipEdge,
  StorableEntity,
  Workspace,
} from "../domain/models.js";

export interface TransactionContext {
  put(entity: StorableEntity): void;
  delete(entityType: StorableEntity["entityType"], entityId: string): void;
  appendAuditEvent(event: AuditEvent): void;
}

export interface WorkspaceRepository {
  createWorkspace(workspace: Workspace): void;
  getWorkspace(workspaceId: string): Workspace | undefined;
  put(workspaceId: string, entity: StorableEntity): void;
  get(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
    entityId: string,
  ): StorableEntity | undefined;
  list(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
  ): StorableEntity[];
  delete(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
    entityId: string,
  ): void;
  listEligibleEdges(workspaceId: string, at: Date): RelationshipEdge[];
  listCoverageResults(workspaceId: string): CoverageResult[];
  getConsent(
    workspaceId: string,
    consentRecordId: string,
  ): ConsentRecord | undefined;
  transact(
    workspaceId: string,
    operation: (transaction: TransactionContext) => void,
  ): void;
  appendAuditEvent(workspaceId: string, event: AuditEvent): void;
  listAuditEvents(workspaceId: string): AuditEvent[];
  close(): void;
}

export function entityId(entity: StorableEntity): string {
  switch (entity.entityType) {
    case "contributor":
      return entity.value.contributorId;
    case "consent":
      return entity.value.consentRecordId;
    case "retention_policy":
      return entity.value.retentionPolicyId;
    case "person":
      return entity.value.personId;
    case "identity_claim":
      return entity.value.identityClaimId;
    case "organization":
      return entity.value.organizationId;
    case "organization_claim":
      return entity.value.organizationClaimId;
    case "employment_claim":
      return entity.value.employmentClaimId;
    case "relationship_edge":
      return entity.value.relationshipEdgeId;
    case "evidence_ref":
      return entity.value.evidenceRefId;
    case "source_snapshot":
      return entity.value.sourceSnapshotId;
    case "person_resolution_candidate":
      return entity.value.resolutionCandidateId;
    case "organization_alias_candidate":
      return entity.value.organizationAliasCandidateId;
    case "review_decision":
      return entity.value.reviewDecisionId;
    case "suppression_rule":
      return entity.value.suppressionRuleId;
    case "audit_run":
      return entity.value.auditRunId;
    case "coverage_review_record":
      return entity.value.coverageReviewRecordId;
    case "import_transaction":
      return entity.value.importTransactionId;
    case "deletion_receipt":
      return entity.value.receiptId;
    case "adapter_metadata_record":
      return entity.value.adapterMetadataRecordId;
    case "coverage_result":
      return entity.value.resultId;
  }
}
