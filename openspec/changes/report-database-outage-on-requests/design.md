# Design

## Context

See `proposal.md` for motivation. `mapError` maps typed domain errors and
Fastify 4xx; everything else is 500 `INTERNAL`. Evaluate handlers catch
snapshot errors and throw `UnavailableError`, but `requireKey` runs in
`preValidation`/`preHandler` and rethrows driver errors. Admin routes such as
`GET /v1/projects/current` call `getCurrentProject` with no connection mapping.
`/readyz` already throws `UnavailableError` when `pingPostgres` is false.
`/healthz` does not touch Postgres.

## Goals / Non-Goals

**Goals:**

- Connection-class Postgres errors on product routes → 503 `UNAVAILABLE`.
- Log those mappings at `warn`.
- Cover auth, evaluate, and admin via the central handler.

**Non-Goals:**

- Changing probe HTTP contracts.
- Mapping constraint SQLSTATE (`23505`, …) or treating Redis errors as 503.
- Retry inside the handler.

## Decisions

### 1. Detect connection errors in `mapError`

- **Choice:** Add `isPostgresConnectionError` in `src/api/errors.ts` that
  matches Node errno `ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`, messages
  containing terminated connection (pg: "Connection terminated"), and pool
  timeout ("timeout exceeded when trying to connect", `ETIMEDOUT`). Map those
  to 503 `UNAVAILABLE` with a generic message. `errorHandler` logs `warn` for
  this mapping (and for `UnavailableError`) instead of `error`. Unknown errors
  stay 500 + `error` log.
- **Why:** Auth and admin never wrap driver errors today; one mapper covers
  every route without duplicating catch blocks. Evaluate's existing catch-all
  still yields `UnavailableError` and stays 503.
- **Alternative:** Wrap every `pool.query` in `src/store`. Rejected: easy to
  miss a call site; store already translates only SQLSTATE uniqueness/checks.
- **Alternative:** Map all pg errors to 503. Rejected: bugs and constraint
  failures would hide as outages.

### 2. Do not special-case probes in the mapper

- **Choice:** `/healthz` never queries Postgres. `/readyz` throws
  `UnavailableError` after a failed ping, not a raw connection error. Leave
  those handlers as they are.
- **Why:** Brief: do not change `/healthz` and `/readyz`. Logging `warn` for
  503 `UNAVAILABLE` matches "warn degraded deps" and does not change status
  codes or bodies.

### 3. Tests: unit table plus inject with a throwing store

- **Choice:** Unit `mapError` cases for each connection signal and a handler
  test that a thrown `ECONNREFUSED` logs `warn` and returns the envelope.
  Integration (or `buildApp` inject with a stub `pool`/`findApiKey`) throws a
  connection error from the store so `POST /v1/evaluate` and
  `GET /v1/projects/current` both 503. Use a well-formed API key so lookup
  reaches the store.
- **Why:** Snapshot-only evaluate 503 already exists; the gap is auth/admin.

## Risks / Trade-offs

- [Over-matching messages] → Stick to listed errno plus pg/pool timeout
  phrases; do not treat every Error with "timeout" as UNAVAILABLE.
- [Evaluate catch-all still 503s non-connection bugs] → Pre-existing; this
  change does not widen that catch.

## Migration Plan

Clients that treated evaluate/admin 500 as a bug can now apply
`client_fallback` on 503. Rollback removes the mapper branch.

## Open Questions

None.
