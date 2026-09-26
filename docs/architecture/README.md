# Architecture

Normative engineering conventions for semaphore-flags. These documents are written for both
humans and coding agents; `.cursor/rules/` holds the condensed, enforceable version of the same
rules. When the two disagree, fix the disagreement in the same PR.

| Document                                                           | Covers                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| [domain-model.md](domain-model.md)                                 | Aggregates, invariants, compiled snapshots, value types |
| [error-handling.md](error-handling.md)                             | Error types, codes, HTTP mapping, evaluate never-throw  |
| [transactions-and-consistency.md](transactions-and-consistency.md) | Tx boundaries, audit, cache invalidation, migrations    |
| [observability.md](observability.md)                               | Structured logs, redaction, metrics, health             |
| [testing-strategy.md](testing-strategy.md)                         | Unit goldens, contract tests, integration, CI gates     |
| [integrations.md](integrations.md)                                 | Postgres, Redis (optional), OpenAPI, demo-client        |
| [api-conventions.md](api-conventions.md)                           | HTTP shape, auth, config, security                      |

## Layers

```
            ┌──────────────────────────────────────────────┐
 HTTP ───▶  │ src/api        routes, auth hooks, schemas,  │  Fastify lives here only
            │                error mapper, composition root│
            └───────────────┬──────────────────────────────┘
                            ▼
            ┌──────────────────────────────────────────────┐
            │ src/services   use cases: tx + audit +       │  orchestration, no HTTP types
            │                cache invalidation            │
            └──────┬─────────────────────┬─────────────────┘
                   ▼                     ▼
 ┌──────────────────────────┐   ┌───────────────────────────────────────┐
 │ src/domain  (pure)       │   │ src/store   Postgres repositories     │
 │  evaluate/  algorithm,   │◀──│ src/cache   Redis snapshot cache      │
 │             hash bucket  │   │ src/metrics Prometheus registry       │
 │  rules/     predicates   │   └───────────────────────────────────────┘
 │  errors.ts  typed errors │        infrastructure depends on domain
 └──────────────────────────┘        types, never the reverse
```

Dependency rule: arrows point inward. `src/domain` imports nothing from `api`, `services`,
`store`, `cache` or `metrics`, and nothing that performs I/O. ESLint enforces this
(`no-restricted-imports` on `src/domain/**`).

`src/services/` is not in SRS §8.1's folder list. It exists because admin mutations must
coordinate a Postgres transaction, an audit insert and a cache delete; putting that in route
handlers would couple HTTP to persistence, and putting it in `store` would hide business rules
in repositories.

## Request flows

**Evaluate (hot path)** — `POST /v1/evaluate`

1. `api`: auth hook resolves the API key → `project_id`. Whether admin keys may also call
   evaluate is decided in the projects-keys proposal.
2. `api`: Fastify JSON schema validates the body shape (400 on failure).
3. `services`: `getSnapshot(project_id, env)` → Redis hit, or singleflight load from Postgres
   and compile, then best-effort write to Redis.
4. `domain/evaluate`: `evaluate(snapshot.flags.get(flagKey), user)` — pure, synchronous,
   allocation-light, never throws. Returns `{ value, reason }`.
5. `metrics`: increment `semaphore_evaluate_total{reason}`; observe duration.
6. `api`: serialize response via a response schema (fast-json-stringify).

**Admin mutation** — e.g. `PUT /v1/flags/:key/envs/:env`

1. `api`: auth hook requires an admin key (401/403), schema validation (400).
2. `services`: open transaction → lock the flag row → load `before` → apply domain validation →
   write → insert `audit_events` row with `before_json`/`after_json`/`request_id` → commit.
3. `services`: delete cache key `flags:{project_id}:{env}` (after commit, before responding).
4. `api`: respond 2xx with the new state.

## Decision log

| #   | Decision                                                             | Why                                                                            |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | TypeScript + Fastify, not Go or Hono                                 | Portfolio keeps Go to one pin; Fastify's schema-driven serialization + OpenAPI |
| 2   | `pg` with hand-written parameterized SQL, no ORM                     | SRS §8.2 allocation-light hot path; explicit transactions                      |
| 3   | Compiled snapshot per `(project, env)` as the unit of cache and eval | One Redis GET per evaluate; predictable invalidation                           |
| 4   | Redis optional; failures degrade to Postgres                         | FR-CACHE-004 availability over cache                                           |
| 5   | Evaluate returns 200 + `not_found` for missing flags                 | FR-EVAL-001; clients must not break on a missing flag                          |
| 6   | `readyz` depends on Postgres only; `healthz/deps` reports Redis      | FR-OPS-001                                                                     |
| 7   | Contract fixtures are JSON data in `contracts/`, run via `inject`    | Fast CI gate; fixtures double as documentation                                 |
| 8   | No DI container; constructor injection wired in the composition root | Small codebase; explicit dependencies are easier for agents to follow          |

New decisions are recorded here (one row) and justified in the OpenSpec proposal that introduced
them.

## What is deliberately not here

Admin SPA, multivariate variants, streaming SDK, multi-region, a DI framework, an ORM,
event sourcing. Adding any of these needs an OpenSpec proposal that argues against this list.
