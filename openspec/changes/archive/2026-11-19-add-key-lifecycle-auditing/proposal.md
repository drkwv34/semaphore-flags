# Proposal

## Why

API keys are minted on `projects create` and `seed` and can be revoked in the store, but mint
never writes `key.create`, revoke is not reachable over HTTP or the operator CLI, and
`GET /v1/audit` rejects `key.create` / `key.revoke`. That breaks FR-PROJ-002 and FR-AUD-001..004:
operators cannot list or revoke keys per project, bootstrap events are invisible, and a rolled-back
mint or revoke can leave keys without an audit row. SRS §6 already allows a null `actor_key_id`
for unauthenticated operator actions; the table currently forbids it.

## What Changes

- Emit exactly one `key.create` audit event per minted key, in the same transaction as the insert,
  for every mint path: `semaphore projects create`, first `semaphore seed`, and seed replenishment
  of a missing admin or evaluate key. A second seed that mints nothing writes no extra keys or
  events. (FR-PROJ-002, FR-AUD-001, FR-AUD-002)
- Add admin-only `GET /v1/keys` (metadata for the authenticated project) and
  `POST /v1/keys/:id/revoke` (200 with metadata including `revoked_at`; idempotent; 404 for
  unknown or foreign ids without leaking existence; 403 for an evaluate key; 401 without a key).
  Self-revoke of the calling admin key is allowed; the next request with that key is 401.
  (FR-PROJ-002, NFR-SEC-001)
- Add operator CLI `semaphore keys list --project <slug>` and
  `semaphore keys revoke --project <slug> --key-id <uuid>` using `DATABASE_URL` like other admin
  commands. CLI never accepts raw secrets as arguments. (FR-PROJ-002)
- HTTP and CLI revoke share one transactional use case that locks the target row in the caller's
  project, writes at most one `key.revoke` event, and leaves `revoked_at` unchanged on repeats
  and concurrent losers. (FR-AUD-002)
- Forward-only migration that makes `audit_events.actor_key_id` nullable for bootstrap and CLI
  events, keeping existing rows and the FK for non-null actors. (FR-AUD-001, SRS §6)
- Audit filters accept `key.create` / `key.revoke` and entity type `key`. HTTP list items may
  have `actor_key_id` null. `before_json` / `after_json`, logs, and HTTP bodies never contain
  raw keys or `key_hash`. (FR-AUD-003, NFR-SEC-001, NFR-SEC-002)
- OpenAPI, contract fixtures, README, and architecture notes for the new routes and CLI.
  Existing audit-count tests distinguish bootstrap events instead of dropping assertions.

Out of scope: arbitrary HTTP key mint, key rotation as a new product feature, admin SPA,
multivariate keys, other findings.

## Capabilities

### New Capabilities

- (none — reuse `projects-keys` and `audit`)

### Modified Capabilities

- `projects-keys`: mint remains display-once and hash-only, but each mint is audited; operators
  can list metadata and revoke by id for the current project over HTTP and CLI; revoke is
  project-isolated and idempotent. (FR-PROJ-002, NFR-SEC-001, NFR-SEC-002)
- `audit`: closed-set actions include `key.create` and `key.revoke`; entity type includes `key`;
  `actor_key_id` may be null for bootstrap/CLI; same-transaction and append-only rules apply to
  key mint and revoke; list filters accept the new values; payloads never include secrets or
  hashes. (FR-AUD-001..004, NFR-SEC-001)

## Impact

- **Capabilities:** `projects-keys`, `audit`.
- **Code paths:** `src/domain/audit.ts` (actions, entity types, parsers);
  `src/store/api-keys.ts` (project-scoped lock/list/revoke returning metadata-safe rows);
  `src/store/audit.ts` (nullable `actor_key_id`); `src/services/projects.ts` (mint + `key.create`
  in one tx, including seed replenishment); `src/services/api-keys.ts` (shared list/revoke use
  case); `src/services/audit.ts` (nullable actor in list JSON); `src/api/app.ts` plus new
  `src/api/keys.ts` / `src/api/key-schemas.ts`; `src/cli.ts` (`keys list|revoke`);
  `migrations/0004_key_audit_actor.sql` (next ordinal after `0003`); OpenAPI generate;
  README and `docs/architecture/`.
- **Tests:** domain parsers; integration for mint audit, HTTP list/revoke, CLI, isolation,
  idempotency/concurrency, audit-insert rollback, secret leakage, self-revoke, nullable actor
  migration; contract fixtures under `contracts/keys/` and audit filter coverage. Existing
  flag/audit count tests keep checking admin-keyed rows separately from bootstrap `key.*`.
- **APIs:** new `GET /v1/keys` and `POST /v1/keys/:id/revoke`. `GET /v1/audit` query enums grow
  (`key`, `key.create`, `key.revoke`) and `actor_key_id` may be JSON null. Evaluate, flag, and
  error envelopes are unchanged.
- **Dependencies:** none.
- **CI:** do not delete, skip, or loosen jobs (NFR-MAINT-001).
