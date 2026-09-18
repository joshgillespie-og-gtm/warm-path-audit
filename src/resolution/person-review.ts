import type { ResolutionCandidate, ReviewDecision } from "../domain/models.js";
import type { WorkspaceRepository } from "../repositories/contracts.js";
import { workspaceScopedId } from "../security/deterministic.js";

export function decidePersonResolution(
  store: WorkspaceRepository,
  workspaceId: string,
  candidateId: string,
  decision: "approve" | "reject",
  actorId: string,
  reason: string,
  decidedAt: string,
): { candidate: ResolutionCandidate; decision: ReviewDecision } {
  const found = store.get(
    workspaceId,
    "person_resolution_candidate",
    candidateId,
  );
  if (found?.entityType !== "person_resolution_candidate")
    throw new Error("PERSON_RESOLUTION_CANDIDATE_NOT_FOUND");
  if (found.value.status !== "pending")
    throw new Error("PERSON_RESOLUTION_DECISION_ALREADY_RECORDED");
  const updated: ResolutionCandidate = {
    ...found.value,
    status: decision === "approve" ? "approved" : "rejected",
  };
  const review: ReviewDecision = {
    workspaceId,
    reviewDecisionId: workspaceScopedId(workspaceId, "review", {
      candidateId,
      decision,
      actorId,
      decidedAt,
    }),
    subjectType: "person_resolution",
    subjectId: candidateId,
    actorId,
    decision,
    reason,
    decidedAt,
    priorState: "pending",
  };
  store.transact(workspaceId, (tx) => {
    tx.put({ entityType: "person_resolution_candidate", value: updated });
    tx.put({ entityType: "review_decision", value: review });
  });
  return { candidate: updated, decision: review };
}
