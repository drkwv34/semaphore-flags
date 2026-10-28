-- FR-AUD-003. Composite index for GET /v1/audit (created_at DESC, id DESC).
-- Replaces the single-column project_id index from 0002.

DROP INDEX IF EXISTS audit_events_project_id_idx;

CREATE INDEX audit_events_project_created_at_id_idx
  ON audit_events (project_id, created_at DESC, id DESC);
