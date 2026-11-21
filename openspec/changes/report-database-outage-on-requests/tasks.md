# Tasks

## 1. Error mapper coverage

- [x] 1.1 Add unit cases in `src/api/errors.test.ts` for `ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`, terminated-connection, and pool-timeout errors mapping to 503 `UNAVAILABLE`, plus an unknown error still 500 `INTERNAL`; verify they fail before the mapper change (FR-ERR-001)
- [x] 1.2 Add an inject/integration test whose store throws a Postgres connection error and expect 503 `UNAVAILABLE` on `POST /v1/evaluate` and `GET /v1/projects/current`; verify `/healthz` stays 200 and `/readyz` stays 503 without handler edits (FR-ERR-001, FR-EVAL-001, FR-PROJ-001, FR-OPS-001)

## 2. Central mapping and docs

- [x] 2.1 Detect the listed Postgres connection errors in `mapError` and return 503 `UNAVAILABLE` with a safe message; log `warn` in `errorHandler` for that mapping; verify 1.1 and 1.2 pass (FR-ERR-001, NFR-REL-001)
- [x] 2.2 Document the 503 connection mapping in `docs/architecture/error-handling.md` (catalog + translating infrastructure errors) without changing `/healthz` or `/readyz` behavior; verify the doc matches the mapper (FR-ERR-001, FR-OPS-001)

## Verification

```sh
pnpm test:unit -- src/api/errors.test.ts src/api/app.test.ts
pnpm test:integration -- test/integration/evaluate.test.ts
openspec validate report-database-outage-on-requests --strict
```
