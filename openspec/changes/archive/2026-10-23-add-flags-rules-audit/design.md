# Design

## Context

Day 2 left `flags`, `targeting-rules`, and `audit` as placeholder specs. Persistence, auth, and
`withTx` already exist. See `proposal.md` for motivation. Layering, parameterized SQL, and
`src/domain` purity stay non-negotiable. Redis invalidation is specified in architecture but is
explicitly out of this day's scope.

## Goals / Non-Goals

**Goals:**

- One forward-only migration for flag, env-config, rule, and audit tables with DB-level
  append-only enforcement on `audit_events`.
- Thin `/v1/flags*` handlers over a services-layer unit of work that locks the flag row, writes,
  and inserts audit in the same transaction.
- Pure rule/flag-key validation in `src/domain`.
- Isolated Postgres integration tests plus colocated unit tests.

**Non-Goals:**

- Evaluate algorithm, cache delete, metrics, `GET /v1/audit`, `@fastify/swagger` drift gate,
  `key.create` audit on CLI mint, changing CI job names.

## Decisions

### 1. Soft archive via `POST /v1/flags/:key/archive`

- **Choice:** Dedicated archive verb, not `DELETE /v1/flags/:key`.
- **Why:** Archive is reversible in meaning (row stays; evaluate will treat it as archived) and
  matches the SRS "soft archive" language. DELETE would imply hard delete to HTTP clients.
- **Alternative:** `DELETE` as soft archive. Rejected: easy to confuse with dropping the unique
  key; the brief allowed either as long as it is documented.

### 2. Schema in `0002_flags_rules_audit.sql`

Tables as in the brief. `timestamptz` everywhere; `updated_at` on mutable flag/config rows.
`rules.value` is `jsonb`. Unique `(project_id, key)` includes archived rows so a key cannot be
reused until a later change explicitly allows it.

### 3. Audit immutability: trigger, not a second role

- **Choice:** `BEFORE UPDATE OR DELETE` trigger that `RAISE EXCEPTION`. No repository methods
  that update or delete.
- **Why:** Compose/CI use the table owner (`semaphore`), so `REVOKE UPDATE, DELETE` from the
  owner does not stick. A trigger fires for the owner too.
- **Alternative:** dedicated app role with INSERT/SELECT only. Deferred; extra Compose/role
  wiring is out of one-day scope. The trigger is the testable invariant.

### 4. PUT env config diffs rules for audit

One `env_config.update` always (when the config or rule set actually changed). Incoming rules
MAY include `id`:

- id present and found → `rule.update` if fields changed, else leave
- id omitted → `rule.create`
- stored ids not in the request → `rule.delete`

Clients that send a full list without ids get delete-all + create-all, which is correct and
auditable. Matching is by id, not by priority, so a priority swap of an identified rule is an
update.

### 5. Pagination is `limit` + `offset`

- **Choice:** `limit` default 50 max 200, `offset` default 0; response `{ items, limit, offset }`.
- **Why:** The brief asked for simple pagination; cursor pagination is reserved for the audit
  list (Day 5). Flag cardinality is small.
- **Alternative:** key-cursor. Unnecessary for this list.

### 6. List payload vs get payload

List returns flag metadata without env configs. Get returns `envs[]` with rules sorted
ascending. Create/patch/archive return the get-shaped resource (always a body, never 204).

### 7. Lock the flag row, upsert missing env configs on PUT

Services `SELECT … FROM flags WHERE project_id AND key FOR UPDATE` before reading before-state.
PUT creates a `flag_env_configs` row if the env exists but the config does not (env added after
the flag). GET returns stored configs for known envs; missing configs are omitted until PUT
(create already inserts one per env that existed at create time).

### 8. Seed `checkout_v2` (and `kill_switch`)

`semaphore seed` after ensuring the demo project: upsert flag `checkout_v2` (description
"Checkout v2", default false, fail_closed) with `dev` enabled 50% and one rule
`user.plan eq "pro" serve true`; upsert `kill_switch` disabled 0% in all envs. Idempotent: if
the flag key exists, do not duplicate; still ensure the demo env config/rule if missing.
Audit rows for seed use `request_id` `seed` and the demo admin key as actor when a key exists;
if this is awkward, seed writes flags without audit (documented). **Choice:** seed writes
through the same service so demo data is audited with `request_id` `"seed"`.

### 9. No cache invalidation this day

Architecture requires delete-after-commit. Redis is out of scope; there is no cache client to
call. When the cache change lands it will hook the same service functions.

### 10. Contracts without swagger

Route JSON schemas on every new endpoint (success + error envelope). Fixtures in
`contracts/flags/*.json` (`name`, `request`, `response`) plus a contract runner that validates
fixture shape and example bodies against the exported JSON schemas. Live CRUD stays in
`test/integration` because the contract CI job has no Postgres.

## Risks / Trade-offs

- [Owner can still TRUNCATE] → trigger covers UPDATE/DELETE; tests assert both. TRUNCATE is
  operator-only and out of scope.
- [PUT without ids looks like churn in audit] → documented; clients that persist rule ids get
  stable update events.
- [Seed `request_id` is not an HTTP id] → acceptable for CLI; audit read API can filter later.
- [No cache hook] → evaluate (Day 4) will read Postgres until the cache change; no stale Redis.

## Migration Plan

1. Empty DBs apply `0001` then `0002`. Compose/CI always start empty.
2. Rollback = do not deploy the image; no DOWN migration.

## Open Questions

None. Archive verb, trigger-based immutability, and PUT rule-diff audit are resolved above.
