# Tasks

## 1. Domain parsers, migration, and store

- [ ] 1.1 Add `key.create` / `key.revoke` to `AUDIT_ACTIONS` and `key` to `AUDIT_ENTITY_TYPES` in `src/domain/audit.ts`; extend `src/domain/audit.test.ts` so unknown values still 400 and the new values parse; verify `pnpm test:unit` covers those cases (FR-AUD-003)
- [ ] 1.2 Add forward-only `migrations/0004_key_audit_actor.sql` (confirm next ordinal) that drops `NOT NULL` on `audit_events.actor_key_id` and keeps the FK; allow `insertAuditEvent` / `AuditEvent` / list JSON to store null actors; verify migrate applies `0004` and existing non-null rows plus the FK still work (FR-AUD-001)
- [ ] 1.3 Add project-scoped `SELECT … FOR UPDATE` lookup and a revoke update that returns the row; keep list-by-project parameterized; verify store tests lock by `(id, project_id)` and never interpolate SQL (NFR-SEC-002)

## 2. Mint audit and revoke use case

- [ ] 2.1 Insert one `key.create` in the same `withTx` as each `insertApiKey` in `createProjectWithKeys` and seed replenishment, with null actor and command `request_id`; skip audit when seed mints nothing; verify a red-then-green integration test that first create/seed writes exactly one event per key, second seed duplicates neither keys nor events, and audit filters accept `key.create` / `key.revoke` (FR-PROJ-002, FR-AUD-002)
- [ ] 2.2 Add `listProjectApiKeys` / `revokeProjectApiKey` in `src/services/api-keys.ts` returning `{ id, type, prefix, created_at, revoked_at }` only; idempotent revoke; same-tx `key.revoke`; verify injecting a failing audit insert rolls back mint and revoke with no leftover row change, and payloads/logs omit raw keys and `key_hash` (FR-AUD-002, NFR-SEC-001)
- [ ] 2.3 Update existing flag/audit tests that count all events or require every `actor_key_id` to distinguish bootstrap `key.*` rows from admin-keyed flag events; verify those suites still assert actor, request_id, and secret absence (FR-AUD-001)

## 3. HTTP, CLI, contracts, docs

- [ ] 3.1 Register admin `GET /v1/keys` and `POST /v1/keys/:id/revoke` with JSON schemas, OpenAPI, and contract fixtures; verify `pnpm test:contract` plus an integration test for list metadata, evaluate-key 403, missing-key 401, foreign/unknown 404, idempotent and concurrent revoke, self-revoke then 401, and a single `key.revoke` with the HTTP actor and `request_id` (FR-PROJ-002, NFR-SEC-001)
- [ ] 3.2 Add `semaphore keys list --project <slug>` and `semaphore keys revoke --project <slug> --key-id <uuid>` using `DATABASE_URL` and the shared use case; verify CLI unit parse tests and an integration test from a clean database that list/revoke succeed, the revoked key is 401, and the audit row is visible (FR-PROJ-002)
- [ ] 3.3 Update README, `docs/architecture/` (decision log + API conventions), and regenerate `contracts/openapi/openapi.json`; verify `pnpm exec tsx scripts/check-readme-docs.ts` and `pnpm openapi:generate` drift check (NFR-DOC-001, NFR-MAINT-002)

## 4. Integration verification

- [ ] 4.1 Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and `pnpm test:integration` with `DATABASE_URL`; verify all six regression cases in this change are green and `openspec validate add-key-lifecycle-auditing --strict` passes

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
DATABASE_URL=postgres://semaphore:semaphore@127.0.0.1:5432/semaphore pnpm test:integration
openspec validate add-key-lifecycle-auditing --strict
pnpm openapi:generate && git diff --exit-code contracts/openapi/openapi.json
```

## Workflow follow-up

- Open a ready PR from `fix/key-lifecycle-auditing`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive add-key-lifecycle-auditing --yes` as a direct commit on `main`.
