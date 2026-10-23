# Tasks

## 1. Persistence and domain validation

- [ ] 1.1 Add `migrations/0002_flags_rules_audit.sql` (`flags`, `flag_env_configs`, `rules`, `audit_events` plus the append-only trigger) and verify `semaphore migrate` against Postgres 16 applies `0002` after `0001` and a second run is a no-op (FR-FLAG-001, FR-AUD-004)
- [ ] 1.2 Implement `parseFlagKey` (`^[a-z][a-z0-9_]{1,63}$`) and rule validation (`attribute`, 9 ops, value shapes, unique priorities, sort ascending) in `src/domain` and verify colocated unit tests cover the validation matrix and flag-key regex (FR-RULE-001, FR-RULE-004)
- [ ] 1.3 Implement flag, env-config, rule, and audit repositories (parameterized SQL, insert-only audit, `23505` → `ConflictError`) and verify an integration helper can insert a flag with default env configs and that `UPDATE`/`DELETE` on `audit_events` is rejected (NFR-SEC-002, FR-AUD-004)

## 2. Admin use cases and HTTP surface

- [ ] 2.1 Implement flag create/list/get/patch/archive and PUT env-config use cases in `src/services` (one transaction, `SELECT … FOR UPDATE`, same-tx audit with before/after, actor, request_id; PUT diffs `rule.*` plus `env_config.update`) and verify integration tests for 201, list vs archived, GET with sorted rules, 409 duplicate, 409 archived mutations, and expected audit rows (FR-FLAG-001..004, FR-AUD-001/002)
- [ ] 2.2 Register admin-only routes `POST/GET /v1/flags`, `GET/PATCH /v1/flags/:key`, `PUT /v1/flags/:key/envs/:env`, `POST /v1/flags/:key/archive` with JSON schemas and the existing error envelope, and verify evaluate keys get 403 on every new route while invalid rules return 400 with `fields` (FR-ERR-003, NFR-SEC-001)
- [ ] 2.3 Extend `semaphore seed` to upsert demo flags `checkout_v2` (dev 50% + one rule) and `kill_switch` idempotently and verify a second seed exits 0 without duplicating flags (FR-FLAG-001)

## 3. Contracts, Compose, and docs

- [ ] 3.1 Add `contracts/flags/` fixtures and a contract runner that validates example request/response bodies against the route JSON schemas, and verify `pnpm test:contract` stays green (NFR-MAINT-001)
- [ ] 3.2 Document archive via `POST /v1/flags/:key/archive`, PUT rule-diff audit actions, and Compose curl smoke (POST flag 201, PUT env 200, GET 200, evaluate key 403) in README plus a flags/rules/audit section; record the archive-verb and trigger-immutability decisions in `docs/architecture/README.md`; verify the documented curl path matches 2.2 (NFR-MAINT-001)

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration   # requires DATABASE_URL to Postgres 16
openspec validate add-flags-rules-audit --strict
docker compose up --build --wait
# copy admin + evaluate keys from `docker compose logs api`, then:
curl -sS -D- -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"key":"smoke_flag","default_value":false}' http://localhost:8080/v1/flags
curl -sS -D- -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"enabled":true,"percentage":50,"rules":[{"priority":0,"attribute":"user.plan","op":"eq","value":"pro","serve":true}]}' \
  http://localhost:8080/v1/flags/smoke_flag/envs/dev
curl -sS -D- -H "Authorization: Bearer $ADMIN_KEY" http://localhost:8080/v1/flags/smoke_flag
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $EVALUATE_KEY" \
  http://localhost:8080/v1/flags/smoke_flag
```

## Workflow follow-up

- Open a ready PR from `feat/flags-rules-audit`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive add-flags-rules-audit --yes` as a direct commit on `main`.
- Follow-up (not this change): emit `key.create` audit rows from `projects create` / `seed`.
