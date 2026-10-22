# Proposal

## Why

The scaffold has HTTP liveness and layout, but no persistence, identity, or authorization. Day 2
must land projects, hashed API keys, environment seed, and Postgres-backed readiness so later
flag/evaluate work has a tenant and a security boundary (FR-PROJ-001..003, FR-OPS-001,
NFR-SEC-001, NFR-SEC-002, NFR-MAINT-001).

## What Changes

- Forward-only SQL migrations for `projects`, `api_keys`, and `environments` (no flag/rule/audit
  tables). Applied by an in-repo `semaphore migrate` runner with a Postgres advisory lock.
- CLI `semaphore`: `migrate`, `seed`, `projects create --name --slug`, `serve`. `projects create`
  creates the project, seeds `dev`/`staging`/`prod`, and mints one admin and one evaluate key,
  printing each raw key exactly once. `seed` is idempotent for a demo project (keys printed only
  when newly created).
- API-key model: readable type prefix (`sf_admin_` / `sf_eval_`) plus a short stored `prefix`;
  only a SHA-256 hash of the full secret is stored; lookup by prefix; constant-time compare;
  revoked keys rejected (NFR-SEC-001).
- Auth middleware: `Authorization: Bearer <key>`; missing/malformed/unknown/revoked → 401;
  valid key of the wrong type → 403. Evaluate routes accept evaluate keys only; admin keys on
  evaluate routes are 403 (documented). `project_id` comes only from the key.
- Minimal authenticated surface: `GET /v1/projects/current` (admin), `POST /v1/environments`
  (admin; env-key regex; 409 on duplicate), `POST /v1/evaluate` placeholder that returns 501
  after auth. Parameterized SQL only (NFR-SEC-002).
- Ops: `GET /healthz` always 200; `GET /readyz` 200 when Postgres answers, 503 otherwise;
  optional `GET /healthz/deps` (Postgres, Redis if configured). Redis never affects readiness
  (FR-OPS-001).
- Tests: unit (key gen/hash/parse, env-key regex); integration against real Postgres (401 vs 403
  matrix, revoked 401, readyz 503 when DB unreachable, `projects create` + `seed` idempotency).
- CI: real lint, typecheck, test (Postgres service), build, and image build. Compose: `api` +
  `db` start with `--wait`; migrate + seed run; curl with the seeded admin key returns 200.
- README: run-locally commands and the key model (types, prefix + hash, shown once).

Out of scope: flags, rules, evaluate algorithm, percentage hashing, audit tables, Redis cache,
metrics, admin SPA, demo-client evaluate loop.

## Capabilities

### New Capabilities

- (none — reuse existing `projects-keys` and `ops`)

### Modified Capabilities

- `projects-keys`: replace the placeholder with normative project, API-key, environment, CLI
  seed, and auth-separation requirements (FR-PROJ-001, FR-PROJ-002, FR-PROJ-003, NFR-SEC-001,
  NFR-SEC-002).
- `ops`: replace the placeholder with liveness, Postgres-only readiness, optional dependency
  detail, and 501 mapping for the evaluate placeholder (FR-OPS-001, NFR-MAINT-001).

## Impact

- **Capabilities:** `projects-keys`, `ops`.
- **Code paths:** `migrations/`, `src/cli.ts` (new), `src/main.ts`, `src/api/app.ts` (auth hook,
  health, project/env/evaluate-placeholder routes), `src/api/errors.ts` (501, 503),
  `src/domain/` (env-key parse, key parse/hash — pure), `src/store/` (pool, migrate, repos),
  `src/services/` (create project, seed, create environment).
- **APIs:** `GET /healthz`, `GET /readyz`, `GET /healthz/deps`, `GET /v1/projects/current`,
  `POST /v1/environments`, `POST /v1/evaluate` (501 after auth).
- **Dependencies:** `pg` (+ `@types/pg`).
- **Compose / Docker:** copy `migrations/` into the image; api entrypoint migrate + seed +
  serve; `docker compose up --wait`.
- **CI:** replace the integration placeholder with a Postgres service job; keep lint, format,
  typecheck, unit, contract, build, compose-config, and image-build checks (do not delete or
  skip any existing check).
- **Docs:** README run-locally + key model; architecture decision log (in-repo migrator; admin
  keys may not evaluate).
