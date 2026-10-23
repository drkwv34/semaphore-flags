# Proposal

## Why

Day 2 landed projects, hashed keys, and environments, but operators still cannot create flags,
target users, or leave an immutable trail of who changed what. Day 3 must add flag/rule admin
mutations with an append-only audit write so evaluation (Day 4) and the audit read API (Day 5)
have data to work with (FR-FLAG-001..004, FR-RULE-001/002/004, FR-AUD-001/002/004, FR-ERR-001/003,
NFR-SEC-002, NFR-MAINT-001).

## What Changes

- Forward-only SQL migration for `flags`, `flag_env_configs`, `rules`, and `audit_events`. Audit
  is append-only at the database level (trigger rejects UPDATE/DELETE). Applied by
  `semaphore migrate`.
- Admin HTTP surface (admin key only; evaluate key → 403): `POST /v1/flags` (201; 409 duplicate
  key; disabled 0% config for every existing env), `GET /v1/flags` (excludes archived unless
  `?include_archived=true`; simple pagination), `GET /v1/flags/:key` (flag + per-env configs with
  ordered rules), `PATCH /v1/flags/:key`, `PUT /v1/flags/:key/envs/:env` (replace enabled,
  percentage, and `rules[]` atomically), `POST /v1/flags/:key/archive` (soft archive). 404 for
  unknown flag/env; mutations on an archived flag return 409 except reads.
- Rule validation in `src/domain/rules` (FR-RULE-001/004): attribute, op, value shape, unique
  priorities; stored and returned sorted ascending. 400 with field-level errors (FR-ERR-003).
- Audit write path: every mutation inserts its audit row in the **same transaction**, with
  before/after JSON, `actor_key_id`, and `request_id`. Actions: `flag.create`, `flag.update`,
  `flag.archive`, `env_config.update`, plus per-rule `rule.create` / `rule.update` / `rule.delete`
  when the PUT rules set diffs. No UPDATE/DELETE on audit in app code. No `GET /v1/audit`.
- Idempotent seed: demo flags (at least `checkout_v2` with a rule and 50% in `dev`).
- Tests: unit (rule validation matrix, flag-key regex); integration against Postgres covering
  CRUD, 409/400/403, audit rows, DB-level audit immutability, archived-flag reads.
- Contracts: JSON schemas on the new routes; fixtures under `contracts/` so the contract job
  stays green. README Compose smoke for POST/PUT/GET plus evaluate-key 403.

Out of scope: `POST /v1/evaluate` algorithm (501 stays), percentage hashing, evaluate-batch,
`GET /v1/audit`, Redis cache/invalidation, metrics, admin SPA, demo-client evaluate loop.
`key.create` audit events for CLI `projects create` / `seed` are a follow-up (would rework Day 2
CLI paths that have no `request_id`).

## Capabilities

### New Capabilities

- (none — reuse existing `flags`, `targeting-rules`, and `audit`)

### Modified Capabilities

- `flags`: replace the placeholder with flag records, per-env config, list/get/patch/archive,
  and create-with-default-configs (FR-FLAG-001..004).
- `targeting-rules`: replace the placeholder with rule storage, validation, unique priorities,
  and atomic replace on PUT env config (FR-RULE-001, FR-RULE-002, FR-RULE-004). Predicate
  evaluation (FR-RULE-003) stays for the evaluate change.
- `audit`: replace the placeholder with the append-only write path, same-transaction insert, and
  DB-level immutability (FR-AUD-001, FR-AUD-002, FR-AUD-004). The admin read API (FR-AUD-003) is
  out of scope.

## Impact

- **Capabilities:** `flags`, `targeting-rules`, `audit`.
- **Code paths:** `migrations/0002_flags_rules_audit.sql`; `src/domain/flag.ts` (key parse);
  `src/domain/rules/` (validation); `src/store/` (flag, env-config, rule, audit repos);
  `src/services/flags.ts` (tx + audit); `src/api/` (admin routes + schemas); `src/cli.ts` /
  `src/services/projects.ts` (seed flags).
- **APIs:** `POST/GET /v1/flags`, `GET/PATCH /v1/flags/:key`, `PUT /v1/flags/:key/envs/:env`,
  `POST /v1/flags/:key/archive`.
- **Dependencies:** none new.
- **Compose / Docker:** seed prints the same keys plus demo flags; curl smoke documented in
  README.
- **CI:** no job deleted, skipped, or loosened. Contract fixtures added under existing
  `pnpm test:contract`.
- **Docs:** README run-locally + flags/rules/audit section; architecture decision log (archive
  verb; PUT rule-diff audit actions).
