# Transactions and consistency

Postgres is the source of truth. Redis holds disposable copies. Every rule below follows from
that.

## Transaction boundaries

- **One admin request = one transaction**, opened and committed in `src/services`, never in
  route handlers or repositories.
- Repositories accept a `Tx` (query executor) argument; they never begin or commit.
- A unit-of-work helper wraps the pattern:

  ```ts
  await uow.run(async (tx) => {
    const before = await flags.lockByKey(tx, projectId, key); // SELECT … FOR UPDATE
    const after = applyEnvConfigUpdate(before, input); // pure domain
    await flags.saveEnvConfig(tx, after);
    await audit.insert(tx, { action: "env_config.update", before, after, requestId });
  });
  await cache.invalidate(projectId, env); // after commit, before the 2xx
  ```

- Isolation: `READ COMMITTED` plus explicit row locks. Lock the aggregate root (`flags` row) so
  concurrent mutations of one flag serialize and audit `before` snapshots are accurate.
- Unique constraints are the final arbiter for races on create (e.g. two `POST /v1/flags` with
  the same key); the loser gets `409 CONFLICT`.
- No network calls (Redis, HTTP) inside a transaction.
- Evaluate reads are not transactional; they read a compiled snapshot.

## Audit log

- The audit insert is in the **same transaction** as the change it describes. No audit row, no
  change; no change, no audit row.
- `before_json` / `after_json` store the domain representation, not raw rows. Secrets (key
  hashes) never appear in audit JSON.
- No-op mutations (after equals before) return 200 and write no audit row. The services layer
  compares domain objects, not JSON strings.
- Immutability is enforced in the database, not just by convention: the application role has
  `INSERT, SELECT` only on `audit_events`, and a trigger rejects `UPDATE`/`DELETE`. There is no
  repository method that updates or deletes audit rows.

## Idempotency

- `PUT` endpoints are idempotent by construction (full replacement of the env config).
- `PATCH` applies a partial update; retries converge to the same state.
- `POST /v1/flags` is not idempotent; a retry after a lost response gets `409` and the client
  reads the flag with `GET`.
- Batch evaluate is read-only and trivially idempotent.

## Cache invalidation

- Cache key: `flags:{project_id}:{env}` holding a serialized `CompiledEnvSnapshot`, TTL 60s
  (FR-CACHE-001).
- On any mutation affecting a flag, its env config or rules, delete the affected key(s)
  **after commit and before responding 2xx** (FR-CACHE-002). A flag-level change (archive,
  default value) deletes the keys for all environments of that project.
- If the delete fails (Redis down), log `warn`, increment
  `semaphore_cache_invalidation_failures_total`, and still return 2xx (FR-CACHE-004). Staleness
  is bounded by the 60s TTL; this trade-off is documented in the README.
- Stampede control (FR-CACHE-003): an in-process singleflight map keyed by cache key ensures one
  Postgres load per key per process at a time.
- Never write to the cache inside the admin transaction; only the read path populates it.

## Migrations

- Forward-only SQL in `migrations/NNNN_description.sql`. No down migrations; fix forward.
- A migration never edits a previous one once it is on `main`.
- Migrations run in a transaction each and take a Postgres advisory lock so concurrent
  `semaphore migrate` runs are safe.
- Expand/contract for changes that touch live columns: add new → backfill → switch reads →
  drop old in a later migration.
- Every table has `created_at timestamptz not null default now()`; mutable tables have
  `updated_at`. All timestamps are UTC `timestamptz`.
- Constraints mirror domain invariants (`CHECK (percentage BETWEEN 0 AND 100)`, unique keys)
  as defense in depth.
- The migration tool is chosen in the projects-keys-envs proposal (small in-repo runner vs
  `node-pg-migrate`); either way it must satisfy the rules above.
