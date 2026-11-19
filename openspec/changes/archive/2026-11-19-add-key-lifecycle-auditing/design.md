# Design

## Context

See `proposal.md` for motivation. Keys are minted inside `createProjectWithKeys` / `seedDemoProject`
transactions but those paths never call `insertAuditEvent`. `AUDIT_ACTIONS` / `AUDIT_ENTITY_TYPES`
omit `key.*`. `revokeApiKey` updates by global id, returns void, and is unused by HTTP/CLI.
`audit_events.actor_key_id` is `NOT NULL` despite SRS §6. Layering, parameterized SQL, domain
purity, and append-only audit stay non-negotiable. No HTTP mint or rotation product is added.

## Goals / Non-Goals

**Goals:**

- Same-transaction `key.create` on every mint path, including seed replenishment, with no
  duplicates on a no-op second seed.
- One project-scoped revoke use case shared by HTTP and CLI; list metadata only.
- Nullable `actor_key_id` via forward-only `0004` (verify next ordinal at apply time).
- Secret-free audit/list/log/response surfaces; existing audit-count tests keep distinguishing
  bootstrap events.

**Non-Goals:**

- HTTP key mint, rotation, last-admin protection, Redis involvement, changing flag seed
  `request_id` `"seed"`, or other findings.

## Decisions

### 1. Null actor for unauthenticated operator actions

- **Choice:** `actor_key_id` NULL for `projects create`, `seed` mint, and CLI list/revoke. HTTP
  uses the authenticated admin key. `request_id` is `cli:<command>:<uuid>` (or the HTTP id).
- **Why:** SRS §6 allows null; attributing mint to the newly created key would invent an actor
  that did not perform the action. No system key is minted.
- **Alternative:** Reuse the new admin key as actor. Rejected: the operator minted it.

### 2. Shared revoke use case, project lock first

- **Choice:** `revokeProjectApiKey(pool, { projectId, keyId, actorKeyId, requestId })` does
  `SELECT … FOR UPDATE` where `id` and `project_id` match. Missing/foreign → `NotFoundError`.
  Already revoked → return metadata, no audit. Else set `revoked_at = now()`, insert `key.revoke`,
  commit. HTTP and CLI both call it. Evaluate callers are rejected in `requireKey`, not here.
- **Why:** One transaction owns isolation, idempotency, and audit. Global-id revoke would leak
  cross-project existence if we 404 only after a type check.
- **Alternative:** Store-level `revokeApiKey(id)` plus a later audit insert. Rejected: not
  same-tx and not project-scoped.

### 3. List is metadata-only; store may still hold hashes

- **Choice:** Store records keep `keyHash` for auth. List/revoke JSON and audit `before_json` /
  `after_json` are `{ id, type, prefix, created_at, revoked_at }` only. List includes revoked
  keys so operators can see `revoked_at`.
- **Why:** NFR-SEC-001. Hash in the list would be a new secret surface even if not the raw key.
- **Alternative:** Omit revoked keys from list. Rejected: operators cannot confirm a revoke.

### 4. Migration `0004_key_audit_actor.sql`

- **Choice:** `ALTER TABLE audit_events ALTER COLUMN actor_key_id DROP NOT NULL`. Keep the
  existing FK. No CHECK rewrite (actions are closed in domain parsers, not SQL).
- **Why:** Additive, forward-only, preserves live rows. Next ordinal after `0003` is `0004`
  (confirm at apply).
- **Alternative:** Recreate the table. Rejected: unnecessary rewrite of an append-only log.

### 5. Self-revoke and last-admin revoke are allowed

- **Choice:** No special case. CLI with `DATABASE_URL` remains the recovery path after the last
  HTTP admin key is gone. Document that self-revoke ends that key's access immediately after 200.
- **Why:** Blocking last-admin revoke traps operators who need to retire a leaked key.
- **Alternative:** Refuse last remaining live admin. Rejected by the decided scope.

### 6. Closed-set parsers grow; HTTP schema allows null actor

- **Choice:** Add `key.create` / `key.revoke` to `AUDIT_ACTIONS` and `key` to
  `AUDIT_ENTITY_TYPES`. Audit item schema `actor_key_id` is `string | null`. Existing flag
  fixtures keep a string actor.
- **Why:** Unknown filter values stay 400; bootstrap rows must serialize.
- **Alternative:** Keep actor required in JSON and omit bootstrap events from HTTP. Rejected:
  FR-AUD-003 lists the project's rows.

### 7. No HTTP mint in this change

Mint stays CLI (`projects create` / `seed`). List and revoke are the missing operator surface.
Arbitrary mint would be a new product path (rotation, rate limits) outside this change.

## Risks / Trade-offs

- [List/audit accidentally include `key_hash`] → map through a metadata type; tests search HTTP
  bodies, logs, and `before_json`/`after_json` for raw keys and the substring `key_hash`.
- [Existing audit-count tests fail on extra `key.create` rows or null actors] → filter bootstrap
  `key.*` separately; do not drop actor assertions for flag events.
- [Seed replenishment double-counts] → insert `key.create` only inside the branch that actually
  calls `insertApiKey`.
- [Concurrent revoke duplicates events] → `FOR UPDATE` on the key row; only the transition from
  live to revoked writes audit.
- [Injected audit failure leaves a key] → mint and revoke insert audit in the same `withTx`;
  tests install a failing `BEFORE INSERT` trigger on `key.*` and assert rollback.

## Migration Plan

1. Empty databases apply `0001`–`0004`. Existing databases apply `0004` only.
2. Rollback = do not deploy the image; no DOWN migration. The NULL change is compatible with
   existing non-null rows.

## Open Questions

None. Null actor, shared revoke, metadata-only list, and self-revoke are resolved above.
