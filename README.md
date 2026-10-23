# semaphore-flags

[![CI](https://github.com/drkwv34/semaphore-flags/actions/workflows/ci.yml/badge.svg)](https://github.com/drkwv34/semaphore-flags/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Feature flags and kill switches with targeting rules, percentage rollouts, audit logs, and a fast
HTTP evaluate API.

> **Status: architecture first.** Projects, API keys, environments, flag/rule admin, and
> append-only audit writes are live. The evaluate algorithm lands as a later OpenSpec change.
> `POST /v1/evaluate` authenticates, then returns `501 NOT_IMPLEMENTED`.

## Problem

Shipping behind flags is easy until a kill switch silently fails open, a rollout reshuffles users
on restart, or nobody can say who flipped a flag in prod. semaphore-flags is a deliberately
narrow flag service that focuses on the parts that matter: evaluation correctness, an immutable
audit trail, cache invalidation you can trust, and documented client behavior when the service is
down.

## Stack

TypeScript (strict) · Fastify · Zod · Postgres 16 · Redis 7 (optional cache) · Vitest · OpenAPI ·
Docker Compose · GitHub Actions.

TypeScript rather than Go keeps the evaluate path simple and fast enough for the budgets
(in-process p99 < 10ms, HTTP p99 < 50ms) while Fastify's schema-driven serialization gives
OpenAPI and response contracts for free.

## Architecture

```
src/api        HTTP edge: routes, auth, JSON schemas, error mapper
src/services   use cases: transaction + audit insert + cache invalidation
src/domain     pure code: evaluate/ (algorithm, hash bucket), rules/ (predicates), errors
src/store      Postgres repositories (parameterized SQL, no ORM)
src/cache      optional Redis cache of compiled per-environment snapshots
src/metrics    Prometheus exposition
migrations/    forward-only SQL
contracts/     golden evaluate fixtures + committed OpenAPI
openspec/      specs and change proposals
```

- The domain is pure and cannot import outer layers (enforced by ESLint).
- Evaluate runs against a compiled snapshot per `(project, environment)`, never ORM entities.
- Every admin mutation writes its audit row in the same transaction and invalidates the cache
  before responding.
- Redis is optional: if it is down, evaluate reads Postgres and keeps answering.

Details: [`docs/architecture/`](docs/architecture/README.md). Conventions for coding agents:
[`AGENTS.md`](AGENTS.md) and [`.cursor/rules/`](.cursor/rules).

## Key model

Two key types (NFR-SEC-001): **admin** (mutations and admin reads) and **evaluate** (evaluate
routes only). Admin keys on evaluate routes are `403 FORBIDDEN`.

Format: `sf_admin_<8 hex>_<64 hex>` or `sf_eval_<8 hex>_<64 hex>`. The stored `prefix`
(`sf_admin_<8 hex>`) is used for lookup; only a SHA-256 hash of the full secret is persisted.
Comparison is constant-time. Revoked keys (`revoked_at` set) are `401`. Raw keys are printed
**once** at `semaphore projects create` / `semaphore seed` and never stored or logged.

Send `Authorization: Bearer <raw-key>`. Missing, malformed, unknown, or revoked → `401`. Valid
key of the wrong type → `403`. `project_id` comes only from the key.

## Run locally

```sh
cp .env.example .env
docker compose up --build --wait
```

The api container runs `migrate`, then `seed`, then `serve`. Seed prints keys **once** on the
api logs (redact these if you share logs):

```sh
docker compose logs api
# seed: project demo (…)
# admin key (shown once): sf_admin_…
# evaluate key (shown once): sf_eval_…
```

Copy the admin and evaluate keys and call the admin route:

```sh
ADMIN_KEY='sf_admin_…'       # paste from the seed log, first boot only
EVALUATE_KEY='sf_eval_…'
curl -sS -H "Authorization: Bearer $ADMIN_KEY" http://localhost:8080/v1/projects/current
# 200 {"id":"…","name":"Demo","slug":"demo","created_at":"…"}
```

Flags, rules, and audit (admin key only). Seed already created `checkout_v2` (50% + a rule in
`dev`) and `kill_switch`. Archive is `POST /v1/flags/:key/archive`, not DELETE. Every mutation
writes an append-only `audit_events` row in the same transaction (`flag.create` /
`flag.update` / `flag.archive` / `env_config.update` plus `rule.create`/`update`/`delete` when
the PUT rule set diffs). There is no `GET /v1/audit` yet.

```sh
curl -sS -o /tmp/flag.json -w '%{http_code}\n' -X POST \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"key":"smoke_flag","default_value":false}' http://localhost:8080/v1/flags
# 201

curl -sS -o /tmp/env.json -w '%{http_code}\n' -X PUT \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"enabled":true,"percentage":50,"rules":[{"priority":0,"attribute":"user.plan","op":"eq","value":"pro","serve":true}]}' \
  http://localhost:8080/v1/flags/smoke_flag/envs/dev
# 200

curl -sS -o /tmp/get.json -w '%{http_code}\n' \
  -H "Authorization: Bearer $ADMIN_KEY" http://localhost:8080/v1/flags/smoke_flag
# 200

curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $EVALUATE_KEY" http://localhost:8080/v1/flags/smoke_flag
# 403
```

Auth checks on that same route:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8080/v1/projects/current
# 401
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $EVALUATE_KEY" http://localhost:8080/v1/projects/current
# 403
```

Liveness always 200; readiness is Postgres only:

```sh
curl -sS http://localhost:8080/healthz
curl -sS http://localhost:8080/readyz
```

Optional Redis:

```sh
docker compose --profile cache up --build --wait   # set API_REDIS_URL=redis://redis:6379
```

Without Docker (Postgres must already be up):

```sh
pnpm install
pnpm migrate
pnpm seed
pnpm dev
```

CLI: `semaphore migrate` · `semaphore seed` · `semaphore projects create --name --slug` ·
`semaphore serve`.

## Tests and CI

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
DATABASE_URL=postgres://semaphore:semaphore@localhost:5432/semaphore pnpm test:integration
```

CI runs lint → format → typecheck → unit → contract → integration (Postgres 16 service) →
build, plus Compose validation and an image build.

## Planned sections

Demo walkthrough, evaluation algorithm, client integration and fallback guidance
(fail-open vs fail-closed), and trade-offs (cache TTL, not_found semantics) are written as the
corresponding features land.

## License

[MIT](LICENSE)
