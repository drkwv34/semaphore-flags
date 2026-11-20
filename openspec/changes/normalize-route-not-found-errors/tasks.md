# Tasks

## 1. Not-found handler

- [x] 1.1 Add inject tests for `GET /`, `/admin`, `/v1/environments`, and `/v1/no-such-route` with and without `x-request-id` expecting 404 `{ error: { code: "NOT_FOUND", message, request_id } }` and matching header; assert `/docs` 200 and a validation 400 still works; verify they fail on Fastify’s default `{ message, error, statusCode }` body (FR-ERR-001)
- [x] 1.2 Register `setNotFoundHandler` that sends the shared envelope with `NOT_FOUND` and a safe message; reuse `errors.ts` if needed; do not add `GET /v1/environments` or an SPA; verify the tests in 1.1 pass (FR-ERR-001, FR-OPS-003)

## 2. Docs and contracts

- [x] 2.1 Document unknown-route 404 in `docs/architecture/error-handling.md` (and OpenAPI only if response docs change); regenerate `contracts/openapi/openapi.json` if needed; verify `pnpm openapi:generate` is clean and `/docs` still serves (FR-ERR-001, NFR-MAINT-002)

## Verification

```sh
pnpm test:unit -- src/api/app.test.ts src/api/errors.test.ts
pnpm test:contract -- test/contract/openapi.test.ts
openspec validate normalize-route-not-found-errors --strict
```
