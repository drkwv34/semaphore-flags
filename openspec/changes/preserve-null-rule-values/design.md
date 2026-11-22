# Design

## Context

See `proposal.md` for motivation. `rules.value` is `jsonb NOT NULL`. JSON `null` is a valid
scalar for `eq` / `neq` (FR-RULE-004) and `matchRule` already treats it as a primitive. The
environment snapshot is built from a LEFT JOIN of flags, env configs, and rules. node-pg
decodes both SQL NULL and jsonb `null` as JavaScript `null`, so a presence check on
`row.value !== null` drops a real `eq null` / `neq null` rule. GET uses `listRules` (INNER
row, no value-null filter) and already returns the rule. Domain predicates and `in` /
`not_in` stay as they are.

## Goals / Non-Goals

**Goals:**

- Treat a joined rule row as present when the rule identity columns are present, even if
  `value` is JavaScript `null`.
- Keep JSON `null` through snapshot compile, Redis serialize/deserialize, and evaluate.
- Export a pure store→domain mapper that unit tests can exercise without Postgres.

**Non-Goals:**

- Changing `in [null]` / `not_in [null]`, numeric ops, `contains`, or missing-attribute
  semantics.
- New endpoints, migrations, cache keys, metrics, or OpenAPI shape changes.
- Custom pg type parsers or wrapping jsonb in a sentinel object.

## Decisions

### 1. Presence is attribute/op/serve, not value

- **Choice:** A LEFT JOIN row is a rule when `attribute`, `op`, and `serve` are non-null.
  Pass `value` through even when it is JavaScript `null` (JSON `null`). A flag with no
  rules still has all three null and is skipped.
- **Why:** `value` is `jsonb NOT NULL`, so SQL NULL on that column only occurs on the empty
  join. JSON `null` is the only `null` that appears on a real rule row.
- **Alternative:** `jsonb_typeof(r.value)` or `r.id IS NOT NULL` in SQL. Rejected as extra
  query surface when the other NOT NULL columns already distinguish the empty join.

### 2. Extract a pure mapper; leave insert and GET as-is

- **Choice:** Export `compiledRuleFromJoinedRow` (name may vary) from `src/store/snapshots.ts`
  and use it inside `loadEnvSnapshot`. Keep `JSON.stringify(input.value)` on insert (so JS
  `null` becomes jsonb `null`, not SQL NULL). Do not change `listRules` unless it is shown
  to drop `null`.
- **Why:** The unit test required by this change needs a store→domain function with no I/O.
  Insert already round-trips JSON `null` for GET.
- **Alternative:** Custom pg parsers that yield a sentinel for jsonb `null`. Rejected: the
  rest of the stack already uses JS `null` for JSON `null` (`isJsonPrimitive`, Fastify
  bodies, Redis JSON).

### 3. Redis path is verify-then-touch

- **Choice:** `isJsonPrimitive` already accepts `null`; `JSON.stringify` preserves `"value":
  null`. Add a serialize round-trip assertion and an integration assertion that the Redis
  payload still contains the rule. Change deserialize only if a test proves it drops `null`.
- **Why:** The observed drop is on snapshot compile, before cache fill. Cache should keep
  whatever the snapshot holds.
- **Alternative:** Bump `schema_version`. Rejected: payload shape is unchanged.

### 4. Tests fail on the unfixed mapper, then pass

- **Choice:** Unit test the mapper with a joined row whose `value` is `null` and whose
  identity columns are set; HTTP integration against Postgres with Redis unset and Redis
  set; re-run existing operator tests. Percentage 0 so a dropped rule is `percentage_out`.
- **Why:** Makes the drop observable without depending on bucket luck. Matches FR-EVAL-002
  fall-through.

## Risks / Trade-offs

- **[Risk] SQL NULL on `value` for a real rule row would be compiled as JSON `null`.** →
  Mitigated by `jsonb NOT NULL`; empty joins are still filtered by attribute/op/serve.
- **[Risk] Changing only the mapper leaves GET or cache broken if they also filter `null`.** →
  Integration asserts GET and the Redis payload; fix those paths only if they fail.
- **[Trade-off] No SQL-level `jsonb_typeof`.** Slightly less explicit, fewer moving parts.

## Migration Plan

No schema change. Deploy is a backward-compatible mapper fix; existing jsonb `null` rows
start matching on the next snapshot load / cache miss. Rollback is a revert of the mapper.

## Open Questions

None.
