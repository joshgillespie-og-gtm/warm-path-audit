CREATE TABLE workspaces (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE TABLE entities (
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contributor','consent','person','organization','relationship_edge','coverage_result')),
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, entity_type, entity_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE audit_events (
  workspace_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  audit_event_id TEXT NOT NULL,
  previous_hash TEXT,
  hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, sequence),
  UNIQUE (workspace_id, audit_event_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
) STRICT;

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
