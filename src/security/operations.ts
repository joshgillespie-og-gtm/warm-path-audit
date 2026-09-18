import type { WorkspaceRepository } from "../repositories/contracts.js";
import { createAuditEvent } from "./audit-chain.js";

export function appendOperationAudit(
  store: WorkspaceRepository,
  workspaceId: string,
  input: {
    eventType: string;
    actorId: string;
    occurredAt: string;
    subjectType: string;
    subjectId: string;
    payload: unknown;
  },
): void {
  const events = store.listAuditEvents(workspaceId);
  store.appendAuditEvent(
    workspaceId,
    createAuditEvent({
      workspaceId,
      sequence: events.length + 1,
      previousHash: events.at(-1)?.hash ?? null,
      ...input,
    }),
  );
}
