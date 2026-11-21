# Proposal

## Why

Postgres connection failures on authenticated product routes currently fall
through `mapError` as unknown errors and return HTTP 500 `INTERNAL`. Evaluate
already maps snapshot-load failure to 503 `UNAVAILABLE`, but auth lookup and
admin reads (for example `GET /v1/projects/current`) do not, so clients cannot
apply `client_fallback` when the database is unreachable. (FR-ERR-001,
NFR-REL-001)

## What Changes

- Map Postgres connection errors (`ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`,
  terminated connection, pool timeout) in the central error handler to HTTP
  503 `{ error: { code: "UNAVAILABLE" } }` for auth, evaluate, and admin
  routes. Log `warn`, not `error`.
- Leave `GET /healthz` and `GET /readyz` HTTP behavior unchanged: liveness
  stays 200 without calling Postgres; readiness stays 503 when Postgres does
  not answer.
- Do not change Redis-down evaluate behavior (still not 5xx). Do not invent a
  new error code.

Out of scope: retry/backoff, circuit breakers, changing probe routes, mapping
SQLSTATE constraint errors.

## Capabilities

### New Capabilities

- (none — reuse `ops`, `evaluation`, `projects-keys`)

### Modified Capabilities

- `ops`: the HTTP error mapper SHALL treat Postgres connection failures on
  product routes as 503 `UNAVAILABLE` and log `warn`; `/healthz` and `/readyz`
  SHALL keep their existing contracts. (FR-ERR-001, FR-OPS-001, NFR-REL-001)
- `evaluation`: Postgres connection failure during API-key lookup or snapshot
  load on evaluate and evaluate-batch SHALL be 503 `UNAVAILABLE`. (FR-ERR-001,
  FR-EVAL-001, FR-EVAL-003, NFR-REL-001)
- `projects-keys`: `GET /v1/projects/current` SHALL return 503 `UNAVAILABLE`
  when Postgres is unreachable with a connection error. (FR-ERR-001,
  FR-PROJ-001, NFR-REL-001)

## Impact

- **Capabilities:** `ops`, `evaluation`, `projects-keys`.
- **Code paths:** `src/api/errors.ts` (`mapError` / `errorHandler`); unit tests
  in `src/api/errors.test.ts`; integration coverage that injects a store
  throwing a connection error on evaluate and `GET /v1/projects/current`.
  `docs/architecture/error-handling.md`. Evaluate handler catch-all may stay
  as a second line of defense; mapping must also cover auth `preHandler` and
  admin routes that rethrow driver errors.
- **Tests:** unit cases for each listed connection signal → 503 `UNAVAILABLE`
  and `warn` log; unknown errors still 500 `INTERNAL`; `/healthz` 200 and
  `/readyz` 503 unchanged. Integration: connection-error store → 503 on
  `POST /v1/evaluate` and `GET /v1/projects/current`.
- **APIs:** 503 envelope on product routes when Postgres cannot be reached.
  No new codes.
- **Dependencies:** none.
- **CI:** do not delete, skip, or loosen jobs (NFR-MAINT-001).
