-- FR-PROJ-001/002/003, NFR-SEC-001. Forward-only. No flag/rule/audit tables.

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id),
  type text NOT NULL CHECK (type IN ('admin', 'evaluate')),
  prefix text NOT NULL UNIQUE,
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL
);

CREATE INDEX api_keys_project_id_idx ON api_keys (project_id);

CREATE TABLE environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9-]{1,31}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
