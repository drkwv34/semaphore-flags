# Design

## Context

Scaffold today: Fastify `GET /healthz`, Zod config, empty `src/store` / `src/services`, empty
`migrations/`, CI stub with an echo for integration, Compose `api` + `db` without migrate/seed.
See `proposal.md` for motivation. Layering, parameterized SQL, and `src/domain` purity are
non-negotiable (`docs/architecture/`, `.cursor/rules/`).

## Goals / Non-Goals

**Goals:**

- In-repo forward-only migrator invoked as `semaphore migrate`.
- Identity tables + CLI create/seed + Bearer auth on a minimal `/v1` surface.
- Health/ready wired to a real `pg` pool; Compose `--wait` + seeded-admin curl.
- Integration tests against Postgres that isolate schema per file and do not depend on order.

**Non-Goals:**

- node-pg-migrate / Flyway / ORM; audit tables; flag/evaluate algorithm; Redis cache; metrics;
  OpenAPI drift gate; changing existing CI job _names_ by deleting them.

## Decisions

### 1. In-repo migrator (`src/store/migrate.ts`) over `node-pg-migrate`

- **Choice:** Read `migrations/*.sql` (skip `README.md`), apply in filename order inside a
  transaction each, record versions in `schema_migrations`, take `pg_advisory_lock` so concurrent
  `semaphore migrate` runs serialize.
- **Why:** Architecture already requires advisory lock + forward-only SQL; a 50-line runner
  avoids a new toolchain. Alternatives (`node-pg-migrate`) add a dependency without extra
  invariants.

### 2. Schema (single migration `0001_projects_keys_envs.sql`)

```
projects     (id uuid pk, name text, slug text unique, salt text, created_at timestamptz)
api_keys     (id uuid pk, project_id fk, type text check ('admin','evaluate'),
              prefix text unique, key_hash text, created_at timestamptz, revoked_at timestamptz null)
environments (id uuid pk, project_id fk, key text check regex, created_at timestamptz,
              unique (project_id, key))
```

No `updated_at` on these rows for Day 2 (keys are revoked via `revoked_at`; projects are not
edited). `gen_random_uuid()` is built-in on Postgres 16.

### 3. Key format

`sf_admin_<8 hex>_<64 hex>` / `sf_eval_<8 hex>_<64 hex>`.

- Stored `prefix` = `sf_admin_<8 hex>` (unique, non-secret, used for index lookup).
- Secret material = 32 random bytes hex-encoded.
- `key_hash` = SHA-256 hex of the **full** raw string.
- Parse is a regex in `src/domain`; generation (CSPRNG) lives in `src/services` so domain stays
  free of policy around "when to mint".
- Constant-time compare via `crypto.timingSafeEqual` on the hash bytes. Unknown prefix still
  hashes and compares against a dummy digest so the 401 path is not a cheap reject.

Alternative considered: bcrypt/argon2. Rejected: keys are 256-bit random (architecture
api-conventions); a slow KDF is unnecessary and hurts the evaluate path later.

### 4. Admin keys may not evaluate

Evaluate routes accept **evaluate keys only**. A valid admin key on `POST /v1/evaluate` is 403.
This matches NFR-SEC-001 key separation and gives a complete 401/403 matrix. Operators who need
to debug evaluation mint an evaluate key (already printed at create/seed).

### 5. Auth is per-route, not global

`onRequest` hooks are attached only to registered `/v1` routes that need them. Unknown paths
such as `GET /v1/__probe` remain Fastify 404 even without a key. This preserves 404-vs-401
clarity (lesson from Day 1). Product routes require `Authorization: Bearer <key>`.

### 6. CLI surface

`src/cli.ts` is the binary (`package.json` `"bin": { "semaphore": "./dist/cli.js" }`). Commands:

| argv                            | behavior                                               |
| ------------------------------- | ------------------------------------------------------ |
| `migrate`                       | apply SQL                                              |
| `seed`                          | idempotent demo project `slug=demo`                    |
| `projects create --name --slug` | create + default envs + two keys, print raw once       |
| `serve`                         | load config, pool, migrate is **not** implicit; listen |

`serve` does not auto-migrate: operators/Compose run `migrate` then `seed` then `serve` so a
failed migration never binds the port. Compose `api` command: `node dist/cli.js migrate && node dist/cli.js seed && node dist/cli.js serve`.

Stdout for keys uses `process.stdout.write` (not `console.log`; ESLint `no-console` stays on).

Seed idempotency: if `projects.slug = 'demo'` exists, ensure default envs (`INSERT … ON CONFLICT
DO NOTHING`); if both key types already exist, print that the project is already seeded and
exit 0 without raw keys.

### 7. Composition and pool

`buildApp(config, { pool })`. Pool settings from `docs/architecture/integrations.md` (`max` 10,
connect 2s, idle 30s, `statement_timeout` 2s on API sessions). Migrations use a client **without**
`statement_timeout`. Repositories take a `Tx` (`Pool | PoolClient`). Driver `23505` →
`ConflictError`, `23514` → `ValidationError`.

`GET /readyz` runs `SELECT 1` with a 500ms statement timeout on that query. Failure or timeout
→ 503 via `UnavailableError` mapped in `src/api/errors.ts`. `/healthz` stays dependency-free.
`/healthz/deps` always 200 with `{ postgres: "ok"|"error", redis?: "ok"|"error"|"disabled" }`.

### 8. Minimal HTTP surface

- `GET /v1/projects/current` — admin — `{ id, name, slug, created_at }` (no salt, no key hashes).
- `POST /v1/environments` — admin — body `{ key }`, `additionalProperties: false`, 201 resource.
- `POST /v1/evaluate` — evaluate — after auth throws `NotImplementedError` → 501 `NOT_IMPLEMENTED`.
- JSON schemas on every route including the error envelope. No `@fastify/swagger` this day
  (OpenAPI drift gate stays future work; schemas still declared).

Handlers throw typed errors; they never `reply.status`.

### 9. Tests and CI

- Unit (colocated): key parse/hash/format, env-key regex, error mapping for 501/503, `/healthz`.
- Integration (`test/integration/`, Vitest project `integration`): real Postgres. Each file
  `CREATE SCHEMA test_<random>` + `search_path` + migrate so files can run in parallel. Cover
  401/403 matrix on **existing** routes, revoked 401, readyz 503 (pool pointed at a closed
  port), `projects create` + `seed` idempotency. No test-order dependence.
- `pnpm test` remains unit + contract (no Postgres). CI `Integration tests` step runs
  `pnpm test:integration` against a `postgres:16` service container. On failure, dump Compose
  logs if a compose smoke step exists; do not skip the step.
- Image job keeps compose-config + image build. Dockerfile copies `migrations/` and uses
  `node dist/cli.js` as the entry for migrate/seed/serve. Healthcheck uses Node `fetch` (alpine
  has no `wget` by default).

### 10. Compose local flow

Documented in README:

```
docker compose up --build --wait
docker compose logs api | …  # copy admin key printed once by seed
curl -H "Authorization: Bearer $ADMIN_KEY" http://localhost:8080/v1/projects/current
```

Seed writes keys only to stdout of the api container. Demo-client remains the healthz stub.

## Risks / Trade-offs

- [Unknown-prefix 401 timing] → still hash and dummy-compare so prefix misses match the
  known-prefix path length.
- [Compose seed keys in logs] → acceptable for local throwaway secrets; README warns they are
  shown once. Production would inject keys out of band (out of scope).
- [Per-route auth vs global hook] → unknown URLs 404 instead of 401; documented and tested via
  `/v1/__probe`.
- [No auto-migrate on `serve`] → Compose must sequence migrate/seed/serve; a missed step fails
  health rather than serving an empty schema silently.
- [501 on evaluate] → clients must not treat 501 as a flag value; the real evaluate change will
  replace this.

## Migration Plan

1. Land SQL + migrator; empty DBs apply `0001`.
2. Compose/CI always start from empty volumes/service containers (no prod data yet).
3. Rollback = do not deploy the image; no DOWN migration.

## Open Questions

None. Admin-on-evaluate (403) and in-repo migrator are resolved above.
