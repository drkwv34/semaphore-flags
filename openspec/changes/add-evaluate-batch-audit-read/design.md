# Design

## Context

See `proposal.md` for motivation. `POST /v1/evaluate` is live and loads one compiled snapshot per
`(project_id, env)` from Postgres. `audit_events` is append-only (insert + trigger); the store
has `insertAuditEvent` and an unfiltered `listAuditEvents` used by integration tests. There is
no HTTP read. Redis, metrics, and swagger drift gates stay out of this change. `src/domain`
stays pure.

## Goals / Non-Goals

**Goals:**

- One snapshot load per batch; map results by calling the existing `evaluate` function per key.
- Thin `/v1/evaluate-batch` and `/v1/audit` handlers over services; parameterized SQL only.
- Cursor pagination that is stable across inserts (new rows appear on later first pages, never
  in the middle of a walk).
- Isolated Postgres integration tests plus colocated unit tests and contract fixtures.

**Non-Goals:**

- Redis `CachedSnapshotSource`, `/metrics`, `@fastify/swagger` drift gate, changing CI job
  names, audit retention, offset pagination.

## Decisions

### 1. Batch body is `{ env, user, flag_keys }`; response is a map

- **Choice:** Shared `env`/`user` with `flag_keys[]`. Response `{ [flag_key]: EvaluateResponse }`.
- **Why:** FR-EVAL-003 is a round-trip reduction, not a multi-user batch. A map matches the
  brief and keeps per-key `not_found` without wrapping. Each value reuses the single-evaluate
  JSON shape so clients can share a decoder.
- **Alternative:** Array of `{ flag_key, env, user }` tuples. Rejected: larger bodies, forks
  the snapshot load, and the brief specifies one env/user plus `flag_keys[]`.

Duplicate keys in `flag_keys` collapse in the map (last write equals first; same algorithm).
Array length still counts toward the 50 cap. Invalid flag-key format is 400, same as single
evaluate (`parseFlagKey`).

### 2. Reuse `evaluate` + one `SnapshotSource.get`

`evaluateBatch` parses env/user once, loads the snapshot once, then `evaluate(snapshot?.flags.get(key), user, salt)` per key. No second algorithm, no per-key SQL. Missing env → every key `not_found`, matching single evaluate.

### 3. Cursor pagination, not offset

- **Choice:** Opaque `cursor` (base64url of `created_at` ISO + `|` + `id`) plus `limit`
  default 50 max 200. Response `{ items, next_cursor }`. Order `created_at DESC, id DESC`.
- **Why:** `docs/architecture/api-conventions.md` already reserved cursor pagination for the
  audit list. Offset would skip/duplicate when new rows land. The brief allows either; cursor
  is the documented one.
- **Alternative:** `limit`/`offset` like `GET /v1/flags`. Rejected for a growing append-only
  log.

Fetch `limit+1` rows; if extra, encode `next_cursor` from the last _returned_ item (not the
extra). Seek:

```
(created_at, id) < (cursor.created_at, cursor.id)  -- DESC
```

`since` is inclusive `created_at >=`; `until` is inclusive `created_at <=`. Invalid cursor or
timestamp → 400 `VALIDATION_FAILED`.

### 4. List item includes `id` plus FR-AUD-001 fields

FR-AUD-001 fields are required. `id` is also returned so clients can correlate pages; it is
not a secret. `project_id` is omitted (always the caller's project).

### 5. Index migration `0003_audit_list_index.sql`

Existing index is `audit_events_project_id_idx (project_id)` only. Add
`(project_id, created_at DESC, id DESC)` and drop the redundant single-column index so the
list query matches the architecture note. No table-shape change.

### 6. Closed-set query params

`entity_type` ∈ `AUDIT_ENTITY_TYPES`, `action` ∈ `AUDIT_ACTIONS`. Unknown values 400, not
empty lists. Parsers live in `src/domain/audit.ts` (pure).

### 7. Store keeps unfiltered `listAuditEvents`; add `listAuditPage`

Integration tests already call `listAuditEvents(pool, projectId)` with ascending order. Leave
that helper. New `listAuditPage` applies filters, DESC order, limit+1, and cursor. No
UPDATE/DELETE functions.

### 8. Contracts without swagger

Route JSON schemas on both new endpoints (success + error envelope). Fixtures under
`contracts/evaluate/` (batch partial not_found, empty, 51 keys, 403) and `contracts/audit/`
(admin 200 shape, evaluate-key 403). Live filters/pagination stay in `test/integration`
because the contract job has no Postgres. Same pattern as Days 3–4.

### 9. Auth wiring

Batch uses `requireKey(..., "evaluate")` like single evaluate. Audit uses `requireKey(..., "admin")`. Audit registration lives next to flags (needs the pool). Batch registration lives next to evaluate (needs `SnapshotSource`).

## Risks / Trade-offs

- [Duplicate keys in `flag_keys`] → map collapses; documented; length still capped at 50.
- [Inclusive `until`] → a row timestamped exactly at `until` is returned; tests use distinct
  timestamps.
- [Cursor is opaque] → clients must not parse it; rotating encoding later is non-breaking if
  we keep accepting the current form.
- [Dropping `audit_events_project_id_idx`] → the new composite still leads with `project_id`.

## Migration Plan

1. Deploy image + apply `0003` (index only). Empty and existing DBs are compatible.
2. Rollback = previous image; the extra index is harmless if the new routes are gone. No DOWN
   migration.

## Open Questions

None. Cursor vs offset, map vs array, and the index migration are resolved above.
