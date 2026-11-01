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
  `PostgresSnapshotSource`), both implementing `SnapshotSource`. In-memory contract tests fake
  that interface; live contract tests use the real Postgres source (and Redis when `REDIS_URL`
  is set).

## OpenAPI

- Route schemas (JSON Schema via Fastify) are the single source of truth for request validation,
  response serialization and documentation.
- `@fastify/swagger` exposes `GET /openapi.json`; `@fastify/swagger-ui` serves `/docs`
  (the only UI required by SRS §4.1).
- The generated document is committed at `contracts/openapi/openapi.json`; CI fails if it drifts.
- Every route declares `response` schemas for success and the error envelope; undeclared fields
  are stripped by the serializer, which prevents accidental data leaks.

## demo-client (Compose only)

- `scripts/demo-client.ts`, run by the `demo-client` Compose service. It is a reference client,
  not a shipped SDK (Appendix F). Node 22 type-stripping runs the TypeScript source in Compose.
- It demonstrates the client contract we ask integrators to follow:
  - 150ms timeout per evaluate call (`AbortSignal.timeout`).
  - On timeout / network error / 5xx, apply the flag's `client_fallback`
    (`fail_closed` → `false`, `fail_open` → `true`) and print `reason` `client_fallback`.
  - Never block startup indefinitely on the flag service.
- After seed it evaluates `kill_payments` (prod) and `beta_ui` (staging) for `demo_in`,
  `demo_out`, and random ids, printing `flag subject value reason` per line.
- Keys: `SEMAPHORE_EVALUATE_KEY` / `SEMAPHORE_URL`, or `SEED_KEYS_PATH` written on first seed
  (`.demo-keys/demo-keys.json`, gitignored).

## Client fallback guidance (FR-DOC-001)

The README "Client integration" section states: short timeouts (100–200ms), per-flag
`client_fallback` (`fail_closed` → false, `fail_open` → true, rare, non-destructive UX), kill
switches use `fail_closed`, optional in-process caching of results for ≤10s, never block app
boot on the flag service. `client_fallback` lives on admin flag JSON, not evaluate JSON.
`.github/pull_request_template.md` includes a checklist item for those docs.
