# External integrations

semaphore-flags has two infrastructure dependencies (Postgres required, Redis optional) and one
published interface (the HTTP API described by OpenAPI). It makes no outbound HTTP calls, sends
no email and emits no webhooks.

## Postgres (required)

- Driver: `pg` (node-postgres) with a single shared `Pool` created in the composition root.
- Parameterized queries only (`$1, $2`); string-built SQL is forbidden (NFR-SEC-002). Dynamic
  identifiers (rare) come from closed allow-lists.
- Pool: `max` 10, `connectionTimeoutMillis` 2000, `idleTimeoutMillis` 30000. Session
  `statement_timeout` 2s for API traffic; migrations run without it.
- Row → domain mapping is explicit in `src/store` (snake_case columns → camelCase domain).
- Shutdown: `pool.end()` after Fastify stops accepting requests.

## Redis (optional cache)

- Enabled only when `REDIS_URL` is set. With it unset, the cache module is a no-op
  implementation of the same interface, so no call site branches on "is Redis configured".
- Client: `ioredis` (decided with the cache proposal) configured to fail fast rather than queue:
  `enableOfflineQueue: false`, `maxRetriesPerRequest: 0`, `connectTimeout` 500ms, per-command
  timeout 50ms.
- Circuit breaker: after 3 consecutive failures, skip Redis for 5s, then probe once. While open,
  reads go straight to Postgres and `semaphore_cache_requests_total{result="error"}` counts
  skips.
- Values are JSON-serialized `CompiledEnvSnapshot` with a `schema_version` field; a mismatched
  version is treated as a miss, so deploys never read incompatible cache entries.
- The cache is a decorator over the Postgres snapshot source (`CachedSnapshotSource` wraps
  `PostgresSnapshotSource`), both implementing `SnapshotSource`. Contract tests use an in-memory
  implementation of the same interface.

## OpenAPI

- Route schemas (JSON Schema via Fastify) are the single source of truth for request validation,
  response serialization and documentation.
- `@fastify/swagger` exposes `GET /openapi.json`; `@fastify/swagger-ui` serves `/docs`
  (the only UI required by SRS §4.1).
- The generated document is committed at `contracts/openapi/openapi.json`; CI fails if it drifts.
- Every route declares `response` schemas for success and the error envelope; undeclared fields
  are stripped by the serializer, which prevents accidental data leaks.

## demo-client (Compose only)

- `scripts/demo-client.mjs`, run by the `demo-client` Compose service. It is a reference client,
  not a shipped SDK (Appendix F).
- It demonstrates the client contract we ask integrators to follow:
  - 150ms timeout per evaluate call (`AbortSignal.timeout`).
  - On timeout / network error / 5xx, apply the flag's `client_fallback`
    (`fail_closed` → `false`, `fail_open` → `true`) and log that it did so.
  - Never block startup indefinitely on the flag service.
- Until the evaluate endpoint exists it only waits for `/healthz` and exits.

## Client fallback guidance (FR-DOC-001)

The README "Client integration" section is a Must deliverable and states: short timeouts
(100–200ms), per-flag `client_fallback`, kill switches use `fail_closed`, optional in-process
caching of results for ≤10s, never block app boot on the flag service. The PR template gains a
checklist item for it in the README/docs PR.
