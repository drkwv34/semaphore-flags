# Tasks

## 1. Alias at the evaluate boundary

- [ ] 1.1 Add `resolveEvaluateEnv` (or equivalent) in `src/services/evaluate.ts` with unit coverage: only `env`, only `environment`, both equal, both different, neither, invalid types; verify different → `VALIDATION_FAILED` with `fields`, neither → 400, equal → same parsed env (FR-EVAL-001, FR-EVAL-003)
- [ ] 1.2 Allow optional `environment` on single and batch JSON schemas (keep `additionalProperties: false`); normalize before `parseEnvKey`; do not change response fields or `bucket-vectors.json`; verify existing `env` fixtures still pass (FR-EVAL-001, FR-EVAL-003)

## 2. Contracts, integration, docs

- [ ] 2.1 Add contract fixtures for Appendix D-style `environment` 200 (single and batch equal to `env`), both equal 200, both different 400, neither 400; keep all existing golden names/bodies; verify `pnpm test:contract` (FR-EVAL-004, FR-EVAL-005)
- [ ] 2.2 Cover the alias in integration evaluate/batch tests (401/403 and batch size limits unchanged); regenerate OpenAPI; document both fields in README and `docs/contracts.md`; verify `pnpm openapi:generate` has no drift (FR-EVAL-001, FR-EVAL-003, NFR-MAINT-002)

## Verification

```sh
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm openapi:generate && git diff --exit-code contracts/openapi/openapi.json
openspec validate support-environment-request-alias --strict
```
