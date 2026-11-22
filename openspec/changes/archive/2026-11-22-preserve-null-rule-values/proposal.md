# Proposal

## Why

A targeting rule whose `value` is the JSON scalar `null` (for example `user.x eq null` or
`user.x neq null`) is accepted on write and returned by `GET /v1/flags/:key`, but it is dropped
when compiling the environment snapshot. Evaluate then never sees the rule and falls through to
percentage rollout (`percentage_out` when percentage is 0). `eq` / `neq` already allow a JSON
primitive including `null` (FR-RULE-004); the compiled read model must keep that value so
evaluation can match it (FR-EVAL-002, FR-RULE-003).

## What Changes

- Distinguish JSON `null` from SQL NULL / “no joined rule row” when mapping Postgres snapshot
  rows into domain `CompiledRule`s. A rule with jsonb `null` SHALL appear in the compiled
  snapshot with `value: null`.
- Evaluate `eq null` against a present null attribute as `rule_match` / the rule’s `serve`, and
  `neq null` against a present non-null attribute the same way. Missing attributes remain a
  non-match. Do not change `in [null]` / `not_in [null]` or the operator matrix.
- Preserve JSON `null` rule values through Redis snapshot serialize/deserialize so a cache hit
  matches a Postgres load.
- Keep GET of the flag returning the stored `value: null` unchanged.
- Add a unit test for the store→domain mapping, HTTP integration coverage with Postgres with and
  without Redis, and re-run existing operator tests. No new endpoints, migrations, error codes,
  cache keys, or metrics.

## Capabilities

### New Capabilities

- (none — reuse `targeting-rules`, `evaluation`, and `caching`)

### Modified Capabilities

- `targeting-rules`: a written `eq` / `neq` rule whose `value` is JSON `null` SHALL be stored,
  returned on GET, and present in the compiled environment snapshot with that same `null` value.
  JSON `null` SHALL NOT be treated as an absent rule. `in` / `not_in` and the rest of the
  operator matrix are unchanged. (FR-RULE-001, FR-RULE-004)
- `evaluation`: when an enabled flag has such a rule, `eq null` with a present null attribute and
  `neq null` with a present non-null attribute SHALL evaluate as `rule_match` / `rule.serve`
  instead of falling through to percentage. (FR-EVAL-002, FR-RULE-003)
- `caching`: a compiled snapshot cached at `flags:{project_id}:{env}` SHALL round-trip JSON
  `null` rule values; a cache hit SHALL produce the same `rule_match` as a Postgres load.
  (FR-CACHE-001)

## Impact

- **Capabilities:** `targeting-rules`, `evaluation`, `caching`.
- **Code paths:** `src/store/snapshots.ts` (joined-row → `CompiledRule` mapping; do not drop
  jsonb JSON `null`); `src/store/rules.ts` only if RETURNING mapping also collapses `null`
  (verify, keep GET intact); `src/cache/index.ts` only if deserialize rejects `value: null`
  (verify `isJsonPrimitive` already allows `null`); domain `matchRule` / operator matrix
  unchanged.
- **Tests:** unit mapping of snapshot rows; HTTP integration against Postgres with Redis unset
  and with Redis set (`eq null` → `rule_match`, `neq null` → `rule_match`, GET keeps the rule,
  cached snapshot keeps the rule); existing operator unit tests re-run.
- **APIs:** no new routes. Evaluate and GET bodies already allow JSON `null` primitives.
- **Dependencies:** none.
- **CI:** do not delete, skip, or loosen jobs (NFR-MAINT-001).
