-- FR-FLAG-001..004, FR-RULE-001/002/004, FR-AUD-001/002/004. Forward-only.

CREATE TABLE flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  description text NOT NULL DEFAULT '',
  flag_type text NOT NULL CHECK (flag_type IN ('boolean')),
  default_value boolean NOT NULL,
  client_fallback text NOT NULL DEFAULT 'fail_closed'
    CHECK (client_fallback IN ('fail_closed', 'fail_open')),
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

CREATE INDEX flags_project_id_idx ON flags (project_id);

CREATE TABLE flag_env_configs (
  flag_id uuid NOT NULL REFERENCES flags (id),
  environment_id uuid NOT NULL REFERENCES environments (id),
  enabled boolean NOT NULL DEFAULT false,
  percentage integer NOT NULL DEFAULT 0 CHECK (percentage BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flag_id, environment_id)
);

CREATE TABLE rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id uuid NOT NULL REFERENCES flags (id),
  environment_id uuid NOT NULL REFERENCES environments (id),
  priority integer NOT NULL,
  attribute text NOT NULL,
  op text NOT NULL CHECK (op IN ('eq', 'neq', 'in', 'not_in', 'contains', 'gt', 'gte', 'lt', 'lte')),
  value jsonb NOT NULL,
  serve boolean NOT NULL,
  UNIQUE (flag_id, environment_id, priority)
);

CREATE INDEX rules_flag_env_idx ON rules (flag_id, environment_id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id),
  actor_key_id uuid NOT NULL REFERENCES api_keys (id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_json jsonb NULL,
  after_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text NOT NULL
);

CREATE INDEX audit_events_project_id_idx ON audit_events (project_id);

CREATE FUNCTION reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_mutation();
