import { chmodSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
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
} from "../../domain/models.js";
import {
  entityId,
  type TransactionContext,
  type WorkspaceRepository,
} from "../../repositories/contracts.js";
import { migrations } from "./migrations.js";

export class SqliteWorkspaceStore implements WorkspaceRepository {
  readonly #database: Database.Database;
  readonly #path: string;
  constructor(path: string) {
    this.#path = path;
    this.#database = new Database(path);
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("secure_delete = ON");
    this.#migrate();
    if (path !== ":memory:" && existsSync(path)) chmodSync(path, 0o600);
    for (const suffix of ["-wal", "-shm"])
      if (path !== ":memory:" && existsSync(`${path}${suffix}`))
        chmodSync(`${path}${suffix}`, 0o600);
  }
  createWorkspace(input: Workspace): void {
    const workspace = workspaceSchema.parse(input);
    this.#database
      .prepare(
        "INSERT INTO workspaces (workspace_id, payload_json) VALUES (?, ?)",
      )
      .run(workspace.workspaceId, JSON.stringify(workspace));
  }
  getWorkspace(workspaceId: string): Workspace | undefined {
    const row = this.#database
      .prepare("SELECT payload_json FROM workspaces WHERE workspace_id = ?")
      .get(workspaceId) as { payload_json: string } | undefined;
    return row === undefined
      ? undefined
      : workspaceSchema.parse(JSON.parse(row.payload_json));
  }
  put(workspaceId: string, input: StorableEntity): void {
    this.#assertWorkspace(workspaceId);
    const entity = storableEntitySchema.parse(input);
    if (entity.value.workspaceId !== workspaceId)
      throw new Error("Cross-workspace write denied");
    this.#validateReferences(workspaceId, entity);
    const prior = this.#database
      .prepare(
        "SELECT payload_json FROM entities WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?",
      )
      .get(workspaceId, entity.entityType, entityId(entity)) as
      { payload_json: string } | undefined;
    if (prior !== undefined && prior.payload_json !== JSON.stringify(entity))
      this.#assertSafeReplacement(
        storableEntitySchema.parse(JSON.parse(prior.payload_json)),
        entity,
      );
    this.#database
      .prepare(
        `INSERT INTO entities (workspace_id, entity_type, entity_id, payload_json) VALUES (?, ?, ?, ?)
      ON CONFLICT(workspace_id, entity_type, entity_id) DO UPDATE SET payload_json = excluded.payload_json`,
      )
      .run(
        workspaceId,
        entity.entityType,
        entityId(entity),
        JSON.stringify(entity),
      );
  }
  get(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
    id: string,
  ): StorableEntity | undefined {
    this.#assertWorkspace(workspaceId);
    const row = this.#database
      .prepare(
        "SELECT payload_json FROM entities WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?",
      )
      .get(workspaceId, entityType, id) as { payload_json: string } | undefined;
    return row === undefined
      ? undefined
      : storableEntitySchema.parse(JSON.parse(row.payload_json));
  }
  list(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
  ): StorableEntity[] {
    this.#assertWorkspace(workspaceId);
    const rows = this.#database
      .prepare(
        "SELECT payload_json FROM entities WHERE workspace_id = ? AND entity_type = ? ORDER BY entity_id",
      )
      .all(workspaceId, entityType) as { payload_json: string }[];
    return rows.map((row) =>
      storableEntitySchema.parse(JSON.parse(row.payload_json)),
    );
  }
  delete(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
    id: string,
  ): void {
    this.#assertWorkspace(workspaceId);
    this.#database
      .prepare(
        "DELETE FROM entities WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?",
      )
      .run(workspaceId, entityType, id);
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
    this.#database.transaction(() =>
      operation({
        put: (entity) => this.put(workspaceId, entity),
        delete: (entityType, id) => this.delete(workspaceId, entityType, id),
        appendAuditEvent: (event) => this.appendAuditEvent(workspaceId, event),
      }),
    )();
  }
  appendAuditEvent(workspaceId: string, input: AuditEvent): void {
    this.#assertWorkspace(workspaceId);
    const event = auditEventSchema.parse(input);
    if (event.workspaceId !== workspaceId)
      throw new Error("Cross-workspace audit event denied");
    const latest = this.#database
      .prepare(
        "SELECT sequence, hash FROM audit_events WHERE workspace_id = ? ORDER BY sequence DESC LIMIT 1",
      )
      .get(workspaceId) as { sequence: number; hash: string } | undefined;
    if (
      event.sequence !== (latest?.sequence ?? 0) + 1 ||
      event.previousHash !== (latest?.hash ?? null)
    )
      throw new Error("Invalid audit chain append");
    this.#database
      .prepare(
        "INSERT INTO audit_events (workspace_id, sequence, audit_event_id, previous_hash, hash, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        workspaceId,
        event.sequence,
        event.auditEventId,
        event.previousHash,
        event.hash,
        JSON.stringify(event),
      );
  }
  listAuditEvents(workspaceId: string): AuditEvent[] {
    this.#assertWorkspace(workspaceId);
    const rows = this.#database
      .prepare(
        "SELECT payload_json FROM audit_events WHERE workspace_id = ? ORDER BY sequence",
      )
      .all(workspaceId) as { payload_json: string }[];
    return rows.map((row) =>
      auditEventSchema.parse(JSON.parse(row.payload_json)),
    );
  }
  close(): void {
    this.#database.close();
  }
  #assertWorkspace(workspaceId: string): void {
    if (this.getWorkspace(workspaceId) === undefined)
      throw new Error(`Unknown workspace: ${workspaceId}`);
  }
  #exists(
    workspaceId: string,
    entityType: StorableEntity["entityType"],
    id: string,
  ): boolean {
    return (
      this.#database
        .prepare(
          "SELECT 1 FROM entities WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?",
        )
        .get(workspaceId, entityType, id) !== undefined
    );
  }
  #assertSafeReplacement(prior: StorableEntity, entity: StorableEntity): void {
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
  #validateReferences(workspaceId: string, entity: StorableEntity): void {
    const requireEntity = (
      type: StorableEntity["entityType"],
      id: string,
    ): void => {
      if (!this.#exists(workspaceId, type, id))
        throw new Error(`Missing workspace-scoped ${type}: ${id}`);
    };
    if (entity.entityType === "consent")
      requireEntity("contributor", entity.value.contributorId);
    if (
      entity.entityType === "source_snapshot" ||
      entity.entityType === "import_transaction" ||
      entity.entityType === "adapter_metadata_record"
    ) {
      requireEntity("contributor", entity.value.contributorId);
      requireEntity("consent", entity.value.consentRecordId);
    }
    if (entity.entityType === "identity_claim")
      requireEntity("person", entity.value.personId);
    if (entity.entityType === "organization_claim")
      requireEntity("organization", entity.value.organizationId);
    if (entity.entityType === "employment_claim") {
      requireEntity("person", entity.value.personId);
      requireEntity("organization", entity.value.organizationId);
    }
    if (entity.entityType === "evidence_ref")
      requireEntity("source_snapshot", entity.value.sourceSnapshotId);
    if (entity.entityType === "relationship_edge") {
      requireEntity("contributor", entity.value.contributorId);
      requireEntity("person", entity.value.destinationPersonId);
      requireEntity("consent", entity.value.consentRecordId);
      requireEntity("source_snapshot", entity.value.sourceSnapshotId);
    }
    if (entity.entityType === "coverage_result")
      requireEntity("person", entity.value.destinationPersonId);
    if (entity.entityType === "coverage_review_record") {
      requireEntity("audit_run", entity.value.auditRunId);
      requireEntity("coverage_result", entity.value.resultId);
    }
  }
  #migrate(): void {
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL) STRICT;",
    );
    const current = this.#database
      .prepare(
        "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
      )
      .get() as { version: number };
    for (const migration of migrations)
      if (migration.version > current.version)
        this.#database.transaction(() => {
          this.#database.exec(migration.sql);
          this.#database
            .prepare(
              "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
            )
            .run(migration.version, new Date(0).toISOString());
        })();
  }
  get databasePath(): string {
    return this.#path;
  }
}
