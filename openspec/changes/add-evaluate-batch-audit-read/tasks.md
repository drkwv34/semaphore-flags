# Tasks

## 1. Batch evaluate

- [x] 1.1 Add `evaluateBatch` that parses env/user/`flag_keys` (1..50), loads one snapshot, and maps each key through existing `evaluate`; verify colocated unit tests for empty, 51 keys, 50 keys, duplicate keys, and invalid flag-key format (FR-EVAL-003)
- [x] 1.2 Register `POST /v1/evaluate-batch` with evaluate-key auth and JSON schemas (map response, error envelope) and verify contract fixtures: partial `not_found`, empty 400, 51 keys 400, admin 403, missing key 401 (FR-EVAL-003, NFR-SEC-001, FR-ERR-001)
- [x] 1.3 Add Postgres integration covering max 50 accepted, 51 rejected, partial `not_found`, agreement with single evaluate (kill switch, rule match, percentage 0/1/100 and bucket 0/99, archived), and authz 401/403; isolate schema per test (FR-EVAL-002, FR-EVAL-003)

## 2. Admin audit read

- [x] 2.1 Add domain parsers for audit filters and opaque cursor encode/decode plus `listAuditPage` (filters, `created_at DESC, id DESC`, limit+1) with INSERT/SELECT only; add `0003_audit_list_index.sql` `(project_id, created_at DESC, id DESC)`; verify unit tests for cursor round-trip, invalid cursor, closed-set filters, and grep that app SQL has no UPDATE/DELETE on `audit_events` (FR-AUD-003, FR-AUD-004)
- [x] 2.2 Register `GET /v1/audit` (admin-only) with query schemas (`entity_type`, `entity_id`, `action`, `since`, `until`, `limit` default 50 max 200, `cursor`) and item fields from FR-AUD-001 plus `id`/`next_cursor`; verify contract fixtures for admin 200 shape and evaluate-key 403 (FR-AUD-001, FR-AUD-003, NFR-SEC-001)
- [x] 2.3 Add Postgres integration: admin 200, evaluate key 403, other project's rows never visible, each filter (`entity_type`, `entity_id`, `action`, `since`/`until`), pagination across pages with no duplicates or gaps; isolate schema per test (FR-AUD-003)

## 3. Docs

- [x] 3.1 Document batch evaluate and audit list (request/response, 50-key cap, cursor pagination defaults) plus Compose curl smoke (batch with one unknown key; GET `/v1/audit` after a mutation) in README and record the audit-index + cursor decisions in `docs/architecture/README.md`; verify the documented curl paths match 1.2 and 2.2 (NFR-MAINT-001)

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration   # requires DATABASE_URL to Postgres 16
openspec validate add-evaluate-batch-audit-read --strict
docker compose up --build --wait
# copy admin + evaluate keys from `docker compose logs api`, then:
curl -sS -H "Authorization: Bearer $EVALUATE_KEY" -H "Content-Type: application/json" \
  -d '{"env":"prod","user":{"id":"u1"},"flag_keys":["kill_switch","missing_flag"]}' \
  http://localhost:8080/v1/evaluate-batch
curl -sS -H "Authorization: Bearer $ADMIN_KEY" \
  http://localhost:8080/v1/audit?limit=10
```

## Workflow follow-up

- Open a ready PR from `feat/evaluate-batch-audit-read`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive add-evaluate-batch-audit-read --yes` as a direct commit on `main`.
