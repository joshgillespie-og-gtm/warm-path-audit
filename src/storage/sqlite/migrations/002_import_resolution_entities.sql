PRAGMA foreign_keys=OFF;
CREATE TABLE entities_v2 (
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'contributor','consent','retention_policy','person','identity_claim','organization',
    'organization_claim','employment_claim','relationship_edge','evidence_ref',
    'source_snapshot','person_resolution_candidate','organization_alias_candidate',
    'review_decision','suppression_rule','import_transaction','deletion_receipt','coverage_result'
  )),
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, entity_type, entity_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
) STRICT;
INSERT INTO entities_v2 SELECT * FROM entities;
DROP TABLE entities;
ALTER TABLE entities_v2 RENAME TO entities;
CREATE INDEX entities_type_scope ON entities(workspace_id, entity_type);
CREATE UNIQUE INDEX import_idempotency_binding ON entities(workspace_id, entity_type, json_extract(payload_json, '$.value.idempotencyKey')) WHERE entity_type = 'source_snapshot';
PRAGMA foreign_keys=ON;
