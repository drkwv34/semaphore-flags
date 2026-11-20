# Proposal

## Why

`buildApp` installs `setErrorHandler` but not `setNotFoundHandler`. Unknown routes therefore
use Fastify’s default 404 (`message` / `error` / `statusCode`) instead of the project envelope
`{ error: { code, message, request_id } }` with `NOT_FOUND`. That breaks FR-ERR-001 for
legitimate misses such as `GET /`, `GET /admin`, and `GET /v1/environments`. (FR-ERR-001)

## What Changes

- Return HTTP 404 with the common error envelope and code `NOT_FOUND`, a safe message, and
  `request_id` in both the JSON body and `x-request-id` header (honouring the incoming header).
- Leave `/docs`, `/openapi.json`, and every registered route unchanged. Validation failures
  stay 400 `VALIDATION_FAILED`.
- Do not add `GET /v1/environments` or an admin SPA to hide a legitimate 404.

Out of scope: new product routes, SPA, changing evaluate missing-flag `200 not_found`.

## Capabilities

### New Capabilities

- (none — reuse `ops`)

### Modified Capabilities

- `ops`: unknown HTTP routes SHALL use the same error envelope as other mapped errors, with
  code `NOT_FOUND` and echoed `request_id`. (FR-ERR-001, FR-OPS-003)

## Impact

- **Capabilities:** `ops`.
- **Code paths:** `src/api/app.ts` (`setNotFoundHandler`); `src/api/errors.ts` if the envelope
  helper is reused; `src/api/app.test.ts`, `src/api/errors.test.ts`;
  `docs/architecture/error-handling.md`; contract coverage under `test/contract/` /
  `contracts/` as needed. OpenAPI regeneration if documented responses change.
- **Tests:** `GET /`, `/admin`, `/v1/environments`, `/v1/no-such-route` with and without
  `x-request-id`; `/docs` still 200; schema validation still 400. Do not use `GET /v1/keys` as
  an absent route.
- **APIs:** 404 body shape for unregistered routes. No new routes.
- **Dependencies:** none.
- **CI:** do not delete, skip, or loosen jobs (NFR-MAINT-001).
