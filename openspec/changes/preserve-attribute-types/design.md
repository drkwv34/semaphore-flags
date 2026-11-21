# Design

## Context

See `proposal.md` for motivation. Fastify 5 compiles request schemas with Ajv
`coerceTypes: 'array'`. `user.attrs` additional properties are
`anyOf: [string, number, boolean, null]`. Ajv tries branches in order, so a
JSON number (and boolean) is coerced to string to satisfy the first branch.
Domain `matchRule` uses `Object.is` / `typeof` and does not coerce. Rule
`value` on PUT uses an untyped schema `{}`, so stored numeric rule values stay
numbers. Query schemas such as audit `limit: integer` rely on coercion of
`?limit=50`. Domain `parseAuditLimit` also accepts string or number.

## Goals / Non-Goals

**Goals:**

- JSON body primitives keep their types after validation.
- Query/params (audit `limit`, flags `limit`/`offset`/`include_archived`) still
  coerce.
- OpenAPI `anyOf` for attrs is unchanged in meaning.

**Non-Goals:**

- Coercing string attrs to numbers at predicate time.
- Changing rule write validation or operators.
- Global `coerceTypes: false` (would 400 integer query params).

## Decisions

### 1. Per-HTTP-part validator compiler

- **Choice:** `setValidatorCompiler` with two Ajv instances: body uses
  `coerceTypes: false` (plus Fastify-like `useDefaults: true`,
  `removeAdditional: true`, `allErrors: false`); querystring, params, and
  headers keep `coerceTypes: 'array'` (Fastify default). Follow Fastify's
  documented per-part compiler pattern.
- **Why:** Fixes attrs without breaking `?limit=50`. One place in `buildApp`
  (or a small `src/api` helper) covers evaluate, batch, and every other JSON
  body.
- **Alternative:** Reorder `anyOf` to put number before string. Rejected:
  booleans and strings would still coerce into earlier branches.
- **Alternative:** Drop typed `additionalProperties` and validate only in
  `parseEvalUser`. Rejected: OpenAPI would no longer list the four types.
- **Alternative:** Disable coercion globally and type query `limit` as
  `["integer","string"]`. Rejected: more schema drift and weaker integer
  bounds at the schema layer.

### 2. Tests that fail before the compiler change

- **Choice:** HTTP inject tests (unit/contract against `buildApp`, plus
  integration against Postgres) that create typed rules and post JSON number /
  boolean attrs. They MUST fail on the current compiler (string coercion → no
  `rule_match`) and pass after. Cover batch with the same payloads. Keep a
  query `limit=50` assertion so body-only disable does not regress audit.
- **Why:** The brief requires a failing-then-passing regression; string-only
  existing fixtures would stay green without this.

## Risks / Trade-offs

- [Bodies that previously relied on coercion, e.g. `"percentage": "10"`] →
  Admin JSON already sends numbers/booleans in tests and clients; extra
  coercion was a footgun, not a contract.
- [Ajv unknown OpenAPI keywords on body schemas] → Body schemas use standard
  JSON Schema keywords (`description` is valid). If compile fails, add
  `strict: false` on both Ajv instances.

## Migration Plan

Additive correctness fix. Clients already sending JSON numbers/booleans start
matching; clients that sent strings still match string rules. Rollback removes
the custom validator compiler.

## Open Questions

None.
