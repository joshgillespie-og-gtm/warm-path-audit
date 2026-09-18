export const migrations = [
  {
    version: 1,
    sql: `CREATE TABLE workspaces (workspace_id TEXT PRIMARY KEY NOT NULL, payload_json TEXT NOT NULL) STRICT;
CREATE TABLE entities (workspace_id TEXT NOT NULL, entity_type TEXT NOT NULL CHECK (entity_type IN ('contributor','consent','person','organization','relationship_edge','coverage_result')), entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (workspace_id, entity_type, entity_id), FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE) STRICT;
CREATE TABLE audit_events (workspace_id TEXT NOT NULL, sequence INTEGER NOT NULL CHECK (sequence > 0), audit_event_id TEXT NOT NULL, previous_hash TEXT, hash TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (workspace_id, sequence), UNIQUE (workspace_id, audit_event_id), FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE) STRICT;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;`,
  },
  {
    version: 2,
    sql: `PRAGMA foreign_keys=OFF;
CREATE TABLE entities_v2 (workspace_id TEXT NOT NULL, entity_type TEXT NOT NULL CHECK (entity_type IN ('contributor','consent','retention_policy','person','identity_claim','organization','organization_claim','employment_claim','relationship_edge','evidence_ref','source_snapshot','person_resolution_candidate','organization_alias_candidate','review_decision','suppression_rule','import_transaction','deletion_receipt','coverage_result')), entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (workspace_id, entity_type, entity_id), FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE) STRICT;
INSERT INTO entities_v2 SELECT * FROM entities;
DROP TABLE entities;
ALTER TABLE entities_v2 RENAME TO entities;
CREATE INDEX entities_type_scope ON entities(workspace_id, entity_type);
CREATE UNIQUE INDEX import_idempotency_binding ON entities(workspace_id, entity_type, json_extract(payload_json, '$.value.idempotencyKey')) WHERE entity_type = 'source_snapshot';
PRAGMA foreign_keys=ON;`,
  },
  {
    version: 3,
    sql: `PRAGMA foreign_keys=OFF;
CREATE TABLE entities_v3 (workspace_id TEXT NOT NULL, entity_type TEXT NOT NULL CHECK (entity_type IN ('contributor','consent','retention_policy','person','identity_claim','organization','organization_claim','employment_claim','relationship_edge','evidence_ref','source_snapshot','person_resolution_candidate','organization_alias_candidate','review_decision','suppression_rule','audit_run','coverage_review_record','import_transaction','deletion_receipt','coverage_result')), entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (workspace_id, entity_type, entity_id), FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE) STRICT;
INSERT INTO entities_v3 SELECT * FROM entities;
DROP TABLE entities;
ALTER TABLE entities_v3 RENAME TO entities;
CREATE INDEX entities_type_scope ON entities(workspace_id, entity_type);
CREATE UNIQUE INDEX import_idempotency_binding ON entities(workspace_id, entity_type, json_extract(payload_json, '$.value.idempotencyKey')) WHERE entity_type = 'source_snapshot';
PRAGMA foreign_keys=ON;`,
  },
] as const;
