# Design

## Context

See `proposal.md` for motivation. `src/api/errors.ts` maps domain errors and Fastify validation
to `{ error: { code, message, request_id, fields? } }`. `app.setErrorHandler(errorHandler)` does
not run for unmatched routes; Fastify’s default not-found serializer emits
`{ message, error, statusCode }`. `onSend` already echoes `x-request-id`. `GET /v1/keys` exists;
`GET /v1/environments` does not (only `POST`). Evaluate missing flags are 200 `not_found`.

## Goals / Non-Goals

**Goals:**

- Unmatched routes: 404 + envelope + `NOT_FOUND` + matching `request_id` header/body.
- Keep `/docs`, OpenAPI, registered routes, and 400 validation.

**Non-Goals:**

- Adding `GET /v1/environments` or an admin SPA.
- Changing evaluate `not_found` to HTTP 404.
- New error codes.

## Decisions

### 1. `setNotFoundHandler` using the same envelope helper

- **Choice:** Register `app.setNotFoundHandler` in `buildApp` that sends status 404 and the
  shared `ErrorBody` with `code: "NOT_FOUND"` and a constant safe message (`"Route not found"`).
  Reuse or extract a small sender from `errorHandler` so header `x-request-id` stays the
  existing `onSend` hook. Do not put path, stack, or Fastify `statusCode` in the body.
- **Why:** One catalog (`NotFoundError` already maps to 404 `NOT_FOUND` for missing entities).
  Routing misses are not entities; a dedicated handler avoids inventing a fake flag/key id.
- **Alternative:** Throw `NotFoundError("route", url)`. Rejected: message becomes
  `"route not found"` with an entity/key the client did not ask for; still needs a not-found
  handler to throw it.
- **Alternative:** Map Fastify `FST_ERR_NOT_FOUND` in `mapError`. Fastify does not pass 404
  through `setErrorHandler` by default without `setNotFoundHandler`.

### 2. Contract tests on concrete unregistered paths

- **Choice:** Unit inject for `GET /`, `/admin`, `/v1/environments`, `/v1/no-such-route` with
  and without `x-request-id`. Assert `/docs` 200 and a known 400 validation case. Optional
  `contracts/ops/` fixture if the runner already replays ops JSON; otherwise colocated
  `app.test.ts` / `errors.test.ts` is enough. Do not use `GET /v1/keys` as a miss.
- **Why:** Those four paths are the ones clients actually hit looking for a UI or env list.

## Risks / Trade-offs

- [Swagger UI extra assets] → `/docs` and `/docs/*` stay registered; probes already exclude them
  from request logs.
- [HEAD/OPTIONS] → Same 404 envelope if unmatched; acceptable.

## Migration Plan

Clients that parsed Fastify’s `{ message, error, statusCode }` on unknown routes must switch to
the envelope (same as every other error). Rollback removes `setNotFoundHandler`.

## Open Questions

None.
