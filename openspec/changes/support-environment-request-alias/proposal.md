# Proposal

## Why

SRS §1.2 and Appendix D publish evaluate bodies with `environment`, but
`src/api/evaluate-schemas.ts` requires `env` on single and batch evaluate and does not declare
`environment`. Existing clients and golden fixtures use `env`. The mismatch is contractual: a
normative sample gets 400 `env` required, while the algorithm is fine. (FR-EVAL-001, FR-EVAL-003)

## What Changes

- Accept `environment` as an alias of `env` on `POST /v1/evaluate` and `POST /v1/evaluate-batch`.
- Normalize to the same internal env key before evaluation. Existing `env` clients keep working.
- If both fields are present and equal, accept. If both are present and differ, 400
  `VALIDATION_FAILED` with `fields`. If neither is present, 400. Invalid types stay 400.
- Do not change response fields, golden bucket vectors, hash/algorithm, or existing `env`
  fixtures. Do not rewrite the SRS.

Out of scope: renaming `env` away, admin SPA, new evaluate reasons.

## Capabilities

### New Capabilities

- (none — reuse `evaluation`)

### Modified Capabilities

- `evaluation`: single and batch evaluate accept `env` and/or `environment` with the alias
  rules above; responses and goldens stay as they are. (FR-EVAL-001, FR-EVAL-003)

## Impact

- **Capabilities:** `evaluation`.
- **Code paths:** `src/api/evaluate-schemas.ts`; `src/services/evaluate.ts` (normalize at the
  use-case boundary); `src/api/evaluate.ts` only if handler typing needs it;
  `test/contract/evaluate.test.ts`, `test/contract/evaluate-http.test.ts`;
  `test/integration/evaluate.test.ts`, `test/integration/evaluate-batch.test.ts`;
  new fixtures under `contracts/evaluate/`; OpenAPI generate; README and `docs/contracts.md`.
- **Tests:** Appendix D-style single/batch with `environment` returns 200 equal to `env`; only
  `env` still 200; both equal 200; both different 400 with fields; neither 400; invalid types
  400; batch limits and 401/403 unchanged. Existing golden vectors unmodified.
- **APIs:** request body may include `environment`. Response JSON unchanged.
- **Dependencies:** none.
- **CI:** do not delete, skip, or loosen jobs (NFR-MAINT-001).
