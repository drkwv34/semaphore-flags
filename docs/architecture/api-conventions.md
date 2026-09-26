# API, configuration and security conventions

## HTTP

- All product routes are under `/v1`. Ops routes (`/healthz`, `/readyz`, `/metrics`,
  `/openapi.json`, `/docs`) are unversioned.
- JSON bodies use `snake_case` field names, matching the SRS (`flag_key`, `default_value`).
  TypeScript code uses camelCase; conversion happens in route handlers.
- Timestamps are ISO-8601 UTC strings with milliseconds (`2026-09-24T22:00:00.000Z`).
- Status codes: `201` create, `200` read/update, `204` never (always return the resource),
  errors per `error-handling.md`.
- Pagination (audit list): cursor-based, `?limit=` (default 50, max 200) and `?cursor=`;
  response `{ items: [...], next_cursor: string | null }`. No offset pagination.
- Every route declares Fastify JSON schemas for `body`/`params`/`querystring` and `response`.
  Unknown body properties are rejected (`additionalProperties: false`).
- Body limit: 64 KiB. Batch evaluate: `flag_keys` max 50 (FR-EVAL-003).
- Handlers stay thin: parse → call a service → map to response. No SQL, no business rules.

## Authentication and authorization

- Header: `Authorization: Bearer <api-key>`.
- Two key types (FR-PROJ-002): `admin` (mutations + reads + audit) and `evaluate` (evaluate
  routes only). Route-level `onRequest` hook declares the required type.
- Key lookup by non-secret `prefix`, then constant-time comparison of the SHA-256 hash of the
  full key (keys are ≥ 256-bit random, so a slow KDF is unnecessary).
- 401 for missing/invalid/revoked keys, 403 for a valid key of the wrong type. The response
  never reveals which part of the key was wrong.
- The resolved `project_id` comes only from the key, never from the request body.

## Configuration

- All configuration via environment variables, parsed once at boot by Zod in `src/config.ts`.
  Invalid config → message on stderr → exit code 1 before binding a port (SRS §8.5).
- Code reads the typed `Config` object; `process.env` is accessed only in `src/config.ts`.
- Empty strings are treated as unset (so `REDIS_URL=` disables the cache).
- `.env.example` lists every variable with a safe local default. Real `.env` files are
  git-ignored. No secrets in the repo, CI logs or Compose files beyond local dev defaults.

| Variable       | Required | Default        | Notes                            |
| -------------- | -------- | -------------- | -------------------------------- |
| `DATABASE_URL` | yes      | —              | `postgres://` or `postgresql://` |
| `REDIS_URL`    | no       | unset          | unset or empty = cache disabled  |
| `HTTP_ADDR`    | no       | `0.0.0.0:8080` | `host:port`                      |
| `LOG_LEVEL`    | no       | `info`         | pino level                       |
| `NODE_ENV`     | no       | `development`  | `test` silences logs             |

Bucketing salts are per project, stored in `projects.salt` (SRS §6). A global `PROJECT_SALT`
env var (SRS §4.4) is not used; if the seed needs a deterministic salt for demos, it takes it as
a CLI argument.

## Security

- Parameterized SQL only; attribute values are data, never SQL or code.
- Raw API keys are shown once at creation and never stored or logged.
- Audit rows are immutable at the database level.
- Dependencies: lockfile committed; `pnpm install --frozen-lockfile` in CI and Docker.
- Container runs as the non-root `node` user.

## Code style

- ESM, `.js` extensions in relative imports (NodeNext resolution).
- Files `kebab-case.ts`; types `PascalCase`; functions/vars `camelCase`; constants for closed
  sets `SCREAMING_SNAKE`.
- Prefer functions and plain objects; classes only for errors and stateful infrastructure
  adapters (pool, cache client).
- `import type` for type-only imports (ESLint enforced).
- No default exports except config files that require them.

## UI

There is no UI beyond `/docs`. An optional demo admin page (SRS §2.3 Should) requires its own
OpenSpec proposal, which must define layout, tokens, accessibility and empty/error/loading
states before any code.
