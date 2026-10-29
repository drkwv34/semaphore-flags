# Proposal

## Why

Single and batch evaluate still load compiled snapshots from Postgres on every request, and
operators have no scrapeable metrics or Redis-aware dependency detail. Day 6 ships the optional
Redis compiled-config cache (invalidation, singleflight, degrade) plus ops surfaces so evaluate
stays correct and available when Redis is down (FR-CACHE-001..004, FR-OPS-001..003, NFR-REL-001,
NFR-OBS-001).

## What Changes

- Optional Redis cache of the compiled per-`(project_id, env)` flag set at key
  `flags:{project_id}:{env}`, TTL 60s (FR-CACHE-001). Used by both `POST /v1/evaluate` and
  `POST /v1/evaluate-batch`. When `REDIS_URL` is unset, the same cache interface is a no-op and
  evaluate reads Postgres directly.
- Invalidation (FR-CACHE-002): every admin mutation that affects flags, rules, or per-env config
  deletes the affected cache key(s) after commit and before returning 2xx. Flag-level changes
  (create, patch, archive) delete keys for all environments of that project; env-config PUT
  deletes that env's key.
- Stampede protection (FR-CACHE-003): in-process singleflight so concurrent misses for the same
  key load from Postgres once.
- Degrade (FR-CACHE-004, NFR-REL-001): Redis unavailable or erroring means evaluate still answers
  from Postgres with a rate-limited warning log, never a 5xx. Admin mutations still succeed.
  Short Redis timeouts so a dead Redis does not stall requests.
- Ops (FR-OPS-001/002/003, NFR-OBS-001): keep `/healthz` and `/readyz` (readyz requires Postgres
  only). `GET /healthz/deps` reports postgres and redis as `ok|degraded|disabled`. `GET /metrics`
  Prometheus text with `semaphore_evaluate_total{reason}`, `semaphore_evaluate_duration_seconds`,
  `semaphore_admin_mutations_total`, and cache hit/miss counters. Structured JSON logs with
  `request_id`, `project_id`, optional `flag_key`/`reason`, and `duration_ms` (honour incoming
  `x-request-id`, else generate, echo on the response).
- Integration tests against real Postgres and Redis in CI (isolated per test). Compose smoke with
  the redis profile. Route JSON schemas for the new/changed ops endpoints.

Out of scope: multi-region active-active, pub/sub cross-instance invalidation beyond key
deletion, contract-fixture overhaul, bench gating, README rewrite, admin SPA.

## Capabilities

### New Capabilities

- (none — reuse `caching`, `ops`, and `evaluation`)

### Modified Capabilities

- `caching`: replace the placeholder with compiled-snapshot cache keys, TTL 60s, singleflight,
  mutation invalidation before 2xx, and Redis-down degrade (FR-CACHE-001..004, NFR-REL-001).
- `ops`: specify `/healthz/deps` statuses `ok|degraded|disabled`, Prometheus `/metrics`, and
  structured JSON request logs with `request_id` (FR-OPS-001..003, NFR-OBS-001).
- `evaluation`: Redis MUST NOT cause evaluate 5xx; only Postgres unreachable remains 503
  `UNAVAILABLE` (FR-ERR-001, FR-CACHE-004, NFR-REL-001). Single and batch share the cached
  snapshot source.

## Impact

- **Capabilities:** `caching`, `ops`, `evaluation`.
- **Code paths:** `src/cache/` (ioredis adapter, no-op, singleflight, circuit, serialize);
  `src/metrics/` (prom-client registry); `src/api/app.ts` (deps health, `/metrics`, request logs);
  `src/api/evaluate.ts` (duration + reason counters); `src/services/flags.ts` (invalidate after
  commit); `src/server.ts` (wire Redis); `test/integration/` cache + metrics; `test/contract/`
  ops fixtures; CI Redis service; Compose redis profile alias; README smoke.
- **APIs:** `GET /healthz/deps` statuses change from `error`/`not_implemented` to
  `ok|degraded|disabled` (**BREAKING** vs the current stub body). `GET /metrics` is new
  (Prometheus text). Evaluate JSON is unchanged.
- **Dependencies:** `ioredis`, `prom-client`.
- **CI:** add a Redis 7 service to the existing integration job. No job deleted, skipped, or
  loosened.
- **Docs:** README cache + metrics Compose smoke (brief; not a rewrite); architecture decision
  log if a new decision is recorded.
