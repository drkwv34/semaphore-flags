# Proposal

## Why

Single evaluate and append-only audit writes are live, but clients still cannot resolve many
flags in one round trip and operators still cannot list the audit trail over HTTP. Day 5 ships
`POST /v1/evaluate-batch` and `GET /v1/audit` so the evaluate SDK path and the admin audit
surface match the SRS (FR-EVAL-003, FR-AUD-003, FR-AUD-001/002/004, NFR-SEC-001).

## What Changes

- `POST /v1/evaluate-batch` (evaluate key only; admin key → 403; missing/invalid → 401): JSON
  `{ env, user, flag_keys }` with `flag_keys` length 1..50 (empty or >50 → 400
  `VALIDATION_FAILED`). Response is HTTP 200, a map keyed by flag key, each value the same
  `{ flag_key, value, reason, variant }` shape and reason enum as `POST /v1/evaluate`. Unknown
  keys are `reason: "not_found"`; a partial miss is still 200 (FR-EVAL-003, FR-ERR-001).
- Batch reuses the single-evaluate algorithm and one environment snapshot load (no per-key
  N+1). Results MUST agree with single evaluate for the same key, user, and env.
- `GET /v1/audit` (admin key only; evaluate key → 403): scoped to the caller's `project_id`.
  Filters: `entity_type`, `entity_id`, `action`, `since`/`until` (`created_at` range). Cursor
  pagination with stable order `created_at DESC, id DESC`; `limit` default 50, max 200.
  Response items include FR-AUD-001 fields: `actor_key_id`, `action`, `entity_type`,
  `entity_id`, `before_json`, `after_json`, `request_id`, `created_at` (FR-AUD-003).
- No UPDATE/DELETE path for audit rows in application code (FR-AUD-004). Read API is read-only.
- Composite index `(project_id, created_at DESC, id DESC)` via a forward-only migration so the
  list query uses the index architecture describes (existing index is `project_id` only).
- Unit, contract, and Postgres integration tests; Compose smoke curls for both routes; README.

Out of scope: multivariate experiments, Redis cache or invalidation, `/metrics`, audit
retention purge, admin SPA.

## Capabilities

### New Capabilities

- (none — reuse `evaluation` and `audit`)

### Modified Capabilities

- `evaluation`: add batch evaluate (`POST /v1/evaluate-batch`) with the 1..50 key cap, partial
  `not_found` as 200, and agreement with single evaluate (FR-EVAL-003, FR-ERR-001, NFR-SEC-001).
- `audit`: add the admin-only, project-scoped, filterable, paginated read API (FR-AUD-003)
  while keeping append-only writes and no UPDATE/DELETE (FR-AUD-001, FR-AUD-002, FR-AUD-004).

## Impact

- **Capabilities:** `evaluation`, `audit`.
- **Code paths:** `src/services/evaluate.ts` (batch over one snapshot); `src/api/evaluate.ts` +
  schemas; `src/store/audit.ts` (filtered page, INSERT/SELECT only); `src/services/audit.ts`;
  `src/api/` audit route + schemas; `src/domain/audit.ts` (cursor encode/decode, closed-set
  parsers); `migrations/0003_*.sql`; `test/contract/`, `test/integration/`; `contracts/`;
  README Compose smoke.
- **APIs:** `POST /v1/evaluate-batch` (new); `GET /v1/audit` (new). Existing `POST /v1/evaluate`
  unchanged.
- **Dependencies:** none new.
- **CI:** no job deleted, skipped, or loosened. Contract fixtures added under existing
  `pnpm test:contract`.
- **Docs:** README batch + audit curl smoke; architecture decision log for cursor pagination
  and the audit list index.
