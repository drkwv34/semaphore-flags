# Design

## Context

See `proposal.md` for motivation. Evaluate already loads a compiled `(project_id, env)` snapshot
from Postgres via `SnapshotSource`. `src/cache` and `src/metrics` are scaffolds. `/healthz/deps`
returns `redis: "not_implemented"` when `REDIS_URL` is set. Admin mutations commit audit in the
same transaction but do not delete cache keys. Architecture already names the decorator
(`CachedSnapshotSource` over `postgresSnapshotSource`), key shape, TTL, fail-fast Redis, circuit,
and Prometheus names. `src/domain` stays pure.

## Goals / Non-Goals

**Goals:**

- One cache interface for Redis-on, Redis-off, and Redis-down so evaluate and mutations never
  branch on configuration.
- Invalidate after commit, before 2xx, covering every existing flag/rule/env-config mutation.
- Scrapeable metrics and JSON logs with `request_id` without labeling unbounded ids.

**Non-Goals:**

- Pub/sub or cross-instance invalidation beyond `DEL`.
- `@fastify/swagger` drift gate / contract-fixture overhaul (Day 7).
- Changing evaluate JSON or the FR-EVAL-002 algorithm.

## Decisions

### 1. Decorator over `SnapshotSource`, not a service-layer Redis branch

- **Choice:** `CachedSnapshotSource` implements `SnapshotSource`. Evaluate keeps calling
  `source.get(projectId, env)`. A no-op cache is used when `REDIS_URL` is unset.
- **Why:** Architecture layers and FR-CACHE-001 already specify this. Call sites stay identical
  for single and batch evaluate.
- **Alternative:** Check `REDIS_URL` in `evaluateFlag`. Rejected: every caller would fork.

### 2. ioredis, fail-fast, in-process circuit

- **Choice:** `ioredis` with `enableOfflineQueue: false`, `maxRetriesPerRequest: 0`,
  `connectTimeout` 500ms, `commandTimeout` 50ms. After 3 consecutive failures, skip Redis for 5s
  then probe once. Circuit-open reads count as `result="error"` and go to Postgres.
- **Why:** Matches `docs/architecture/integrations.md`. A queued Redis client would stall
  evaluate past the HTTP budget.
- **Alternative:** `node-redis`. Rejected: architecture already decided ioredis.

### 3. JSON snapshot with `schema_version`; Map rebuilt on read

`CompiledEnvSnapshot.flags` is a `Map`. Cache payload:

```
{ schema_version: 1, project_id, env, salt, flags: CompiledFlag[] }
```

Version mismatch is a miss. Only the read path writes. Mutations only `DEL`.

### 4. In-process singleflight keyed by cache key

- **Choice:** A per-process `Map<key, Promise<snapshot>>`. Concurrent misses share one Postgres
  load. No Redis lock.
- **Why:** FR-CACHE-003 is process-local. A Redis lock would fail the degrade path.
- **Alternative:** Short Redis `SET NX` lock. Rejected: extra dependency on Redis for a
  correctness path that must work when Redis is down.

### 5. Invalidation lives in flag services after `withTx`

- **Choice:** After commit, `createFlag` / `patchFlag` / `archiveFlag` delete keys for every env
  on the returned detail; `putEnvConfig` deletes `flags:{project_id}:{env}`. Errors are swallowed
  after `warn` + `semaphore_cache_invalidation_failures_total`. No-op mutations skip delete.
- **Why:** Architecture: no Redis inside the transaction; delete after commit, before 2xx.
- **Not invalidated:** `POST /v1/environments` (new env has no cached snapshot; existing env
  snapshots are unchanged). Reads (`GET` flags, audit, current project) are not mutations.

### 6. `/healthz/deps` statuses `ok|degraded|disabled`

- **Choice:** Always `{ postgres, redis }`. Postgres: `ok` | `degraded`. Redis: `ok` |
  `degraded` | `disabled` (unset `REDIS_URL`). Never `error` / `not_implemented`.
- **Why:** Day 6 brief binds the enum. `/readyz` still Postgres-only.
- **BREAKING** vs the stub (`postgres: "error"`, `redis: "not_implemented"`). Tests update.

### 7. `prom-client` per-app registry

- **Choice:** Construct a `Registry` in `createMetrics()` and pass it through `buildApp`.
  Histogram buckets `0.0005 … 0.1`s. Default Node process metrics enabled on that registry.
- **Why:** Tests must not share a process-global register. Closed-enum labels only:
  `reason`, `endpoint` (`single`/`batch`), `action`, `result` (`hit`/`miss`/`error`).
- Metrics: `semaphore_evaluate_total{reason}`, `semaphore_evaluate_duration_seconds{endpoint}`,
  `semaphore_admin_mutations_total{action}`, `semaphore_cache_requests_total{result}`,
  `semaphore_cache_invalidation_failures_total`.

Batch evaluate increments `semaphore_evaluate_total` once per key and observes duration once
with `endpoint="batch"`.

### 8. Structured logs via Fastify/pino; disable default request logging

- **Choice:** Keep `requestIdHeader: "x-request-id"` and `request_id` log label. Echo the id on
  every response (already). Custom `onResponse` at `info` with `project_id`, `duration_ms`, and
  optional `flag_key`/`reason`. Skip `/healthz`, `/readyz`, `/healthz/deps`, `/metrics`. Redis
  degrade warnings rate-limited to 1/10s.
- **Why:** FR-OPS-003 field names; probes would drown info logs.

### 9. CI Redis service; tests isolate by project id

CI `verify` job gains a Redis 7 service and `REDIS_URL`. Cache keys include `project_id`, and
each integration file already uses a unique schema plus unique project ids, so keys do not
collide. Redis-down cases use a bad URL (closed port) rather than stopping the CI service.
Compose redis service also accepts profile `redis` (alias of `cache`) with optional
`depends_on` so `--profile redis` matches the brief.

### 10. Contracts without swagger drift gate

Route JSON schemas on `/healthz/deps` and `/metrics`. A small ops contract fixture covers the
deps body. No committed `contracts/openapi/openapi.json` in this change (deferred with Day 7).

## Risks / Trade-offs

- [Read-fill vs invalidate race] → a snapshot loaded before commit can be written after `DEL`.
  Staleness is bounded by TTL 60s; documented as the accepted trade-off.
- [Singleflight is per process] → N API replicas can each hit Postgres once. Acceptable; no
  cross-instance lock.
- [Circuit skips Redis for 5s] → extra Postgres load during an outage. Prefer availability.
- [Deps status enum change] → stub clients expecting `error`/`not_implemented` must update.
  Only in-repo tests used the stub.

## Migration Plan

1. Deploy image with ioredis + prom-client. Redis remains optional; existing Compose without
   the cache profile is unchanged.
2. Rollback = previous image. Cached keys expire in 60s; no migration.
3. No SQL changes.

## Open Questions

None. Client library, key shape, TTL, deps enum, and metric names are bound by architecture
and the Day 6 brief.
