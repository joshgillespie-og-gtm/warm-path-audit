import type {
  OrganizationAliasCandidate,
  ReviewDecision,
} from "../domain/models.js";
import type { WorkspaceRepository } from "../repositories/contracts.js";
import { workspaceScopedId } from "../security/deterministic.js";

export function decideOrganizationAlias(
  store: WorkspaceRepository,
  workspaceId: string,
  candidateId: string,
  decision: "approve" | "reject",
  actorId: string,
  reason: string,
  decidedAt: string,
): { candidate: OrganizationAliasCandidate; decision: ReviewDecision } {
  const found = store.get(
    workspaceId,
    "organization_alias_candidate",
    candidateId,
  );
  if (found?.entityType !== "organization_alias_candidate")
    throw new Error("ALIAS_CANDIDATE_NOT_FOUND");
  if (found.value.status !== "pending")
    throw new Error("ALIAS_DECISION_ALREADY_RECORDED");
  const [singleConflict] = found.value.conflictOrganizationIds;
  const canonicalOrganizationId =
    found.value.conflictOrganizationIds.length === 1 && singleConflict
      ? singleConflict
      : found.value.proposedOrganizationId;
  const updated: OrganizationAliasCandidate = {
    ...found.value,
    status: decision === "approve" ? "approved" : "rejected",
    ...(decision === "approve"
      ? { approvedCanonicalOrganizationId: canonicalOrganizationId }
      : {}),
  };
  const review: ReviewDecision = {
    workspaceId,
    reviewDecisionId: workspaceScopedId(workspaceId, "review", {
      candidateId,
      decision,
      actorId,
      decidedAt,
    }),
    subjectType: "organization_alias",
    subjectId: candidateId,
    actorId,
    decision,
    reason,
    decidedAt,
    priorState: found.value.status,
    ...(decision === "approve"
      ? {
          organizationAliasAuthorization: {
            sourceOrganizationId: found.value.proposedOrganizationId,
            canonicalOrganizationId,
            aliasKind: found.value.aliasKind,
            aliasValue: found.value.aliasValue,
          },
        }
      : {}),
  };
  store.transact(workspaceId, (tx) => {
    tx.put({ entityType: "organization_alias_candidate", value: updated });
    tx.put({ entityType: "review_decision", value: review });
    if (decision === "approve")
      tx.put({
        entityType: "organization_claim",
        value: {
          workspaceId,
          organizationClaimId: workspaceScopedId(
            workspaceId,
            "organization_claim",
            { candidateId, decisionId: review.reviewDecisionId },
          ),
          organizationId: canonicalOrganizationId,
          kind: "alias",
          namespace: "approved_alias",
          value: found.value.aliasValue,
          evidenceRefs: found.value.evidenceRefs,
          confidence: 1,
          observedAt: decidedAt,
          reviewStatus: "approved",
        },
      });
  });
  return { candidate: updated, decision: review };
}
