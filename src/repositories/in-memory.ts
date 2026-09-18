import {
  auditEventSchema,
  consentRecordSchema,
  coverageResultSchema,
  evaluateConsent,
  relationshipEdgeSchema,
  storableEntitySchema,
  workspaceSchema,
  type AuditEvent,
  type ConsentRecord,
  type CoverageResult,
  type RelationshipEdge,
  type StorableEntity,
  type Workspace,
} from "../domain/models.js";
import {
  entityId,
  type TransactionContext,
  type WorkspaceRepository,
} from "./contracts.js";

export class InMemoryWorkspaceStore implements WorkspaceRepository {
  readonly #workspaces = new Map<string, Workspace>();
  readonly #entities = new Map<string, Map<string, StorableEntity>>();
  readonly #events = new Map<string, AuditEvent[]>();

  createWorkspace(value: Workspace): void {
    const workspace = workspaceSchema.parse(value);
    if (this.#workspaces.has(workspace.workspaceId))
      throw new Error("Workspace already exists");
    this.#workspaces.set(workspace.workspaceId, structuredClone(workspace));
  }
  getWorkspace(workspaceId: string): Workspace | undefined {
    return clone(this.#workspaces.get(workspaceId));
  }
  put(workspaceId: string, input: StorableEntity): void {
    this.#assertWorkspace(workspaceId);
    const entity = storableEntitySchema.parse(input);
    if (entity.value.workspaceId !== workspaceId)
      throw new Error("Cross-workspace write denied");
    let bucket = this.#entities.get(workspaceId);
    if (bucket === undefined) {
      bucket = new Map();
      this.#entities.set(workspaceId, bucket);
    }
    const key = `${entity.entityType}:${entityId(entity)}`;
    const prior = bucket.get(key);
    assertSafeReplacement(prior, entity);
    bucket.set(key, structuredClone(entity));
  }
  get(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
    id: string,
  ): StorableEntity | undefined {
    this.#assertWorkspace(workspaceId);
    return clone(this.#entities.get(workspaceId)?.get(`${entityType}:${id}`));
  }
  list(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
  ): StorableEntity[] {
    this.#assertWorkspace(workspaceId);
    return [...(this.#entities.get(workspaceId)?.values() ?? [])]
      .filter((item) => item.entityType === entityType)
      .map((item) => structuredClone(item))
      .sort((a, b) => entityId(a).localeCompare(entityId(b)));
  }
  delete(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
    id: string,
  ): void {
    this.#assertWorkspace(workspaceId);
    this.#entities.get(workspaceId)?.delete(`${entityType}:${id}`);
  }
  getConsent(workspaceId: string, id: string): ConsentRecord | undefined {
    const found = this.get(workspaceId, "consent", id);
    return found?.entityType === "consent"
      ? consentRecordSchema.parse(found.value)
      : undefined;
  }
  listEligibleEdges(workspaceId: string, at: Date): RelationshipEdge[] {
    return this.list(workspaceId, "relationship_edge").flatMap((item) => {
      if (item.entityType !== "relationship_edge") return [];
      const edge = relationshipEdgeSchema.parse(item.value);
      const consent = this.getConsent(workspaceId, edge.consentRecordId);
      return edge.eligible &&
        consent !== undefined &&
        evaluateConsent(consent, at) === "active"
        ? [edge]
        : [];
    });
  }
  listCoverageResults(workspaceId: string): CoverageResult[] {
    return this.list(workspaceId, "coverage_result").map((item) =>
      coverageResultSchema.parse(item.value),
    );
  }
  transact(
    workspaceId: string,
    operation: (transaction: TransactionContext) => void,
  ): void {
    this.#assertWorkspace(workspaceId);
    const entityBackup = structuredClone([
      ...(this.#entities.get(workspaceId)?.entries() ?? []),
    ]);
    const eventBackup = structuredClone(this.#events.get(workspaceId) ?? []);
    try {
      operation({
        put: (entity) => this.put(workspaceId, entity),
        delete: (entityType, id) => this.delete(workspaceId, entityType, id),
        appendAuditEvent: (event) => this.appendAuditEvent(workspaceId, event),
      });
    } catch (error) {
      this.#entities.set(workspaceId, new Map(entityBackup));
      this.#events.set(workspaceId, eventBackup);
      throw error;
    }
  }
  appendAuditEvent(workspaceId: string, input: AuditEvent): void {
    this.#assertWorkspace(workspaceId);
    const event = auditEventSchema.parse(input);
    if (event.workspaceId !== workspaceId)
      throw new Error("Cross-workspace audit event denied");
    const events = this.#events.get(workspaceId) ?? [];
    if (
      event.sequence !== events.length + 1 ||
      event.previousHash !== (events.at(-1)?.hash ?? null)
    )
      throw new Error("Invalid audit chain append");
    events.push(structuredClone(event));
    this.#events.set(workspaceId, events);
  }
  listAuditEvents(workspaceId: string): AuditEvent[] {
    this.#assertWorkspace(workspaceId);
    return structuredClone(this.#events.get(workspaceId) ?? []);
  }
  close(): void {}
  #assertWorkspace(workspaceId: string): void {
    if (!this.#workspaces.has(workspaceId))
      throw new Error(`Unknown workspace: ${workspaceId}`);
  }
}
function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function assertSafeReplacement(
  prior: StorableEntity | undefined,
  entity: StorableEntity,
): void {
  if (prior === undefined || JSON.stringify(prior) === JSON.stringify(entity))
    return;
  if (
    entity.entityType === "evidence_ref" ||
    entity.entityType === "review_decision" ||
    entity.entityType === "source_snapshot" ||
    entity.entityType === "adapter_metadata_record"
  )
    throw new Error(`Immutable ${entity.entityType} mutation denied`);
  if (prior.entityType === "consent" && entity.entityType === "consent") {
    const from = prior.value;
    const to = entity.value;
    const widened =
      to.sourceClasses.some((x) => !from.sourceClasses.includes(x)) ||
      to.allowedCategories.some((x) => !from.allowedCategories.includes(x));
    if (
      (from.status !== "active" && to.status === "active") ||
      widened ||
      from.contributorId !== to.contributorId ||
      from.purposeId !== to.purposeId ||
      from.authorizationBasis !== to.authorizationBasis
    )
      throw new Error("Consent mutation or reactivation denied");
  }
  if (
    prior.entityType === "contributor" &&
    entity.entityType === "contributor" &&
    prior.value.status !== "active" &&
    entity.value.status === "active"
  )
    throw new Error("Contributor reactivation denied");
}
