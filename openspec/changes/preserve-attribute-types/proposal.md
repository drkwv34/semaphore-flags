# Proposal

## Why

`POST /v1/evaluate` and `POST /v1/evaluate-batch` declare `user.attrs` as
`anyOf` string, number, boolean, or null, and predicates compare JSON types
strictly (FR-RULE-003). Fastify's Ajv compiler uses `coerceTypes: 'array'`, so
a JSON number such as `18` is coerced to `"18"` before the predicate runs.
Numeric and boolean targeting then fails even when the client sent the correct
type. (FR-EVAL-001, FR-EVAL-002, FR-EVAL-003, FR-RULE-003)

## What Changes

- Keep JSON types of `user.attrs` values from the HTTP body through to the
  predicate on single and batch evaluate. A number stays a number; a boolean
  stays a boolean; a string stays a string; `null` stays `null`.
- Disable Ajv type coercion for JSON request bodies only. Query string and path
  params keep coercion so integer query fields such as audit `limit` still work.
- OpenAPI continues to accept `user.attrs` additional properties as
  string, number, boolean, or null. No new evaluate reasons, fields, or
  operators.

Out of scope: multivariate variants, changing predicate operators, coercing
string attributes to numbers at match time.

## Capabilities

### New Capabilities

- (none — reuse `evaluation`)

### Modified Capabilities

- `evaluation`: single and batch evaluate SHALL pass `user.attrs` JSON types
  unchanged to rule matching so numeric and boolean predicates match the
  values the client sent. (FR-EVAL-001, FR-EVAL-002, FR-EVAL-003, FR-RULE-003)

## Impact

- **Capabilities:** `evaluation`.
- **Code paths:** `src/api/app.ts` (validator compiler / Ajv options per HTTP
  part); `src/api/evaluate-schemas.ts` only if schema comments or OpenAPI
  descriptions need a type-preservation note; evaluate/batch handlers stay
  thin. Domain predicates are unchanged.
- **Tests:** HTTP evaluate and batch cases that fail before the fix: `gte 18`
  with `age: 18` → `rule_match` true; `eq 18` wins over `eq "18"`; `eq true`
  wins over `eq "true"`; `gt`/`lt` and numeric `in`; same cases on batch.
  Query `GET /v1/audit?limit=50` still 200. OpenAPI attrs `anyOf` still lists
  string/number/boolean/null. Existing string-attr fixtures stay green.
- **APIs:** request JSON meaning of attr types; response envelope unchanged.
- **Dependencies:** none (Ajv is already a Fastify/dev dependency).
- **CI:** do not delete, skip, or loosen jobs (NFR-MAINT-001).
