# semaphore-flags

[![CI](https://github.com/drkwv34/semaphore-flags/actions/workflows/ci.yml/badge.svg)](https://github.com/drkwv34/semaphore-flags/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Feature flags and kill switches with targeting rules, percentage rollouts, audit logs, and a fast
HTTP evaluate API.

> **Status: architecture first.** This repository currently holds conventions, layout, OpenSpec
> and CI only. There is no flag CRUD or evaluate endpoint yet; those land as approved OpenSpec
> changes.

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

## Run locally

```sh
cp .env.example .env
docker compose up --build                 # api, postgres, demo-client stub
docker compose --profile cache up --build # + redis (set API_REDIS_URL=redis://redis:6379)
curl localhost:8080/healthz
```

Without Docker:

```sh
pnpm install
pnpm dev        # needs DATABASE_URL (see .env.example)
```

## Tests and CI

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

CI runs lint → format → typecheck → unit → contract → (integration) → build, plus Compose
validation and an image build. Contract fixtures in `contracts/` become a required merge gate
once the evaluate API exists.

## Planned sections

Demo walkthrough, evaluation algorithm, client integration and fallback guidance
(fail-open vs fail-closed), and trade-offs (cache TTL, not_found semantics) are written as the
corresponding features land.

## License

[MIT](LICENSE)
