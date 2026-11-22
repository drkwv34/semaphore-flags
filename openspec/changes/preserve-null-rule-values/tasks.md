# Tasks

## 1. Store mapping

- [x] 1.1 Export a pure joined-row → `CompiledRule` mapper from `src/store/snapshots.ts` that treats a rule as present when `attribute`, `op`, and `serve` are non-null and passes JSON `null` `value` through; use it in `loadEnvSnapshot`; verify a unit test in `src/store/snapshots.test.ts` keeps `eq null` / `neq null` and skips an empty LEFT JOIN row (FR-RULE-001, FR-RULE-004)
- [x] 1.2 Confirm `insertRule` still writes JSON `null` via `JSON.stringify` (not SQL NULL) and `listRules` returns `value: null`; verify GET in the integration cases in 2.1 still shows the rule (FR-RULE-001)

## 2. Evaluate, cache, and operators

- [x] 2.1 Add HTTP integration coverage against Postgres with Redis unset and with Redis set: `eq null` + present null attribute → `rule_match`; `neq null` + present non-null attribute → `rule_match`; GET keeps `value: null`; the cached snapshot (when Redis is set) still contains the rule; percentage 0 so a dropped rule would be `percentage_out`; verify `pnpm test:integration` with `DATABASE_URL` and `REDIS_URL` (FR-EVAL-002, FR-CACHE-001)
- [x] 2.2 Add a cache serialize/deserialize round-trip for a compiled rule with `value: null` if deserialize does not already keep it; verify `pnpm test:unit` covers that case (FR-CACHE-001)
- [x] 2.3 Re-run existing operator unit tests (`src/domain/rules/predicates.test.ts`, `src/domain/rules/rules.test.ts`) without changing `in` / `not_in` or the operator matrix; verify they still pass under `pnpm test:unit` (FR-RULE-003, FR-RULE-004)

## 3. Integration verification

- [x] 3.1 Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` plus `pnpm test:integration` and `pnpm test:contract` with `DATABASE_URL`; verify the new mapping and HTTP cases are green and `openspec validate preserve-null-rule-values --strict` passes

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
DATABASE_URL=postgres://semaphore:semaphore@127.0.0.1:5432/semaphore \
  REDIS_URL=redis://127.0.0.1:6379 \
  pnpm test:integration
DATABASE_URL=postgres://semaphore:semaphore@127.0.0.1:5432/semaphore \
  REDIS_URL=redis://127.0.0.1:6379 \
  pnpm test:contract
openspec validate preserve-null-rule-values --strict
```

## Workflow follow-up

- Open a ready PR from `fix/null-rule-values`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive preserve-null-rule-values --yes` as a direct commit on `main`.
