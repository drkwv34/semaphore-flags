-- FR-AUD-001, SRS §6. Bootstrap and operator CLI events have no authenticated API key.
-- Existing rows stay unchanged; the FK still applies to non-null actors. Forward-only.

ALTER TABLE audit_events
  ALTER COLUMN actor_key_id DROP NOT NULL;
