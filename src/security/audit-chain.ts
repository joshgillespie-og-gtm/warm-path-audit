import type { AuditEvent } from "../domain/models.js";
import {
  canonicalJson,
  sha256Hex,
  workspaceScopedId,
} from "./deterministic.js";

export type AuditEventInput = Omit<
  AuditEvent,
  "auditEventId" | "hash" | "payloadSha256"
> & { payload: unknown };

export function createAuditEvent(input: AuditEventInput): AuditEvent {
  const payloadSha256 = sha256Hex(canonicalJson(input.payload));
  const body = {
    workspaceId: input.workspaceId,
    sequence: input.sequence,
    eventType: input.eventType,
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    payloadSha256,
    previousHash: input.previousHash,
  };
  const hash = sha256Hex(canonicalJson(body));
  return {
    ...body,
    auditEventId: workspaceScopedId(input.workspaceId, "audit_event", {
      sequence: input.sequence,
      hash,
    }),
    hash,
  };
}

export function verifyAuditChain(
  events: readonly AuditEvent[],
): { valid: true } | { valid: false; index: number; reason: string } {
  let previous: string | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined)
      return { valid: false, index, reason: "missing event" };
    if (event.sequence !== index + 1)
      return { valid: false, index, reason: "sequence gap" };
    if (event.previousHash !== previous)
      return { valid: false, index, reason: "previous hash mismatch" };
    const expected = sha256Hex(
      canonicalJson({
        workspaceId: event.workspaceId,
        sequence: event.sequence,
        eventType: event.eventType,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        payloadSha256: event.payloadSha256,
        previousHash: event.previousHash,
      }),
    );
    if (event.hash !== expected)
      return { valid: false, index, reason: "event hash mismatch" };
    previous = event.hash;
  }
  return { valid: true };
}
