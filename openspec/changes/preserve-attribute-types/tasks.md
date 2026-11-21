# Tasks

## 1. Failing HTTP coverage

- [ ] 1.1 Add evaluate HTTP tests for `gte 18` with JSON number `age: 18` → `rule_match` true; `eq 18` beating `eq "18"`; `eq true` beating `eq "true"`; numeric `gt`/`lt`/`in`; the same payloads on evaluate-batch; and OpenAPI attrs still listing string/number/boolean/null — verify they fail on the current Ajv body coercion (FR-EVAL-001, FR-EVAL-002, FR-EVAL-003, FR-RULE-003)
- [ ] 1.2 Assert `GET /v1/audit?limit=50` (string query) still 200 after the later compiler change; keep the assertion in the same suite so query coercion cannot silently break (FR-AUD-003)

## 2. Body-only validator compiler

- [ ] 2.1 Install a Fastify `setValidatorCompiler` that uses Ajv `coerceTypes: false` for JSON bodies and `coerceTypes: 'array'` for querystring/params/headers; verify the tests in 1.1 pass and 1.2 still passes (FR-EVAL-001, FR-RULE-003)
- [ ] 2.2 Confirm OpenAPI generate has no drift (or regenerate only if descriptions change) and existing string-attr evaluate fixtures still pass; verify `pnpm test:contract -- test/contract/evaluate.test.ts test/contract/openapi.test.ts` (FR-EVAL-004, FR-EVAL-005, NFR-MAINT-002)

## Verification

```sh
pnpm test:unit -- src/api/app.test.ts src/api/evaluate.ts
pnpm test:contract -- test/contract/evaluate.test.ts test/contract/audit.test.ts test/contract/openapi.test.ts
pnpm test:integration -- test/integration/evaluate.test.ts test/integration/evaluate-batch.test.ts test/integration/audit.test.ts
openspec validate preserve-attribute-types --strict
```
