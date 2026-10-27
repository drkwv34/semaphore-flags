# Design

## Context

See `proposal.md` for motivation. `POST /v1/evaluate` authenticates then throws `NotImplementedError`.
`src/domain/evaluate` exports only `EVALUATION_REASONS`. Rule **validation** exists; predicates do
not. Flag rows, env configs, and rules are in Postgres. Redis, metrics, and batch evaluate are
out of this change. `src/domain` stays pure (ESLint `no-restricted-imports`).

## Goals / Non-Goals

**Goals:**

- Pure, exception-free `evaluate` + `hashBucket` + `compileSnapshot` in `src/domain`.
- One parameterized snapshot load per evaluate from Postgres.
- Thin `/v1/evaluate` handler over a service that maps snapshot miss / Postgres failure.
- Golden vectors generated independently of the production hash helper, then committed.

**Non-Goals:**

- Redis `CachedSnapshotSource`, `/metrics`, `@fastify/swagger` drift gate, batch evaluate,
  changing CI job names.

## Decisions

### 1. Archived serves false, not default_value

- **Choice:** Archived flags return `{ value: false, reason: "archived" }` before the kill-switch
  check. FR-EVAL-002 wins over FR-FLAG-004's "default / false" wording.
- **Why:** Clients branch on `reason`; a kill-switched archived flag must not look like `disabled`
  with a possibly-true default. `variant` is always `"off"`.
- **Alternative:** Serve `default_value` with reason `archived`. Rejected: mixes two meanings.

### 2. `default` stays in the enum and is unused

The closed set is API surface. This algorithm never returns `default`. Adding a new reason later
is breaking; keeping an unused member is not.

### 3. SnapshotSource now, Postgres only

```
interface SnapshotSource {
  get(projectId: string, env: string): Promise<CompiledEnvSnapshot | undefined>;
}
```

`PostgresSnapshotSource` loads flag/config/rule rows for `(project_id, env)` with parameterized
SQL and calls `compileSnapshot`. Missing environment → `undefined` → evaluate `not_found`. A flag
with no `flag_env_configs` row for that env is omitted from the map (same as missing). Redis
decorator lands in a later change; call sites talk only to `SnapshotSource`.

### 4. Composition root accepts a snapshot source (and optional key lookup)

`buildApp` takes `snapshotSource?: SnapshotSource`. Production wires `PostgresSnapshotSource`.
Contract tests that need `inject` without Postgres pass an in-memory source plus a fake
`findApiKey` (minted keys in process). Integration tests use a real pool. This matches
architecture ("tests pass fakes") without mocking domain functions.

### 5. Hash is `node:crypto` SHA-256 in domain

`createHash("sha256").update(salt + ":" + flagKey + ":" + userId, "utf8").digest().readUInt32BE(0) % 100`.
`node:crypto` is not I/O; ESLint already allows it in `src/domain`. Golden vectors are produced
by an independent script (`openssl dgst -sha256` or a one-off Node snippet that does not import
`src/domain`) and committed under `contracts/evaluate/bucket-vectors.json`.

### 6. Predicate attribute paths

- `user.id` reads `user.id`.
- `user.<name>` reads `user.attrs[name]`.
- Any other attribute string reads `user.attrs[attribute]` so stored `user.plan` and `plan` both
  work.
- `contains` is string-includes when both sides are strings; otherwise false.
- `eq`/`neq` use SameValueZero on JSON primitives. `in`/`not_in` use the same element-wise.
  Numeric ops require both sides to be finite numbers.

### 7. Contracts: fixtures + schema + domain agreement; inject when fakes exist

Fixtures in `contracts/evaluate/*.json` (`name`, `setup`, `request`, `response`) plus
`bucket-vectors.json`. The contract runner validates bodies against exported JSON schemas and
asserts `evaluate(setup, request)` equals `response.body`. HTTP 200/401/403/400 live in
integration against Postgres. Optional inject coverage uses the in-memory `SnapshotSource`.

Day 3 deferred swagger; this change does the same. Route JSON schemas are the contract.

### 8. Postgres errors become 503; Redis is irrelevant

Snapshot query failure → `UnavailableError` → 503. No cache fallback this day. Evaluate still
never fails because Redis is down (Redis is unused).

### 9. Soft microbench

`scripts/bench-evaluate.mjs` times in-process `evaluate` over a 20-rule snapshot. Documented in
README. Not wired as a CI job and MUST NOT fail the build.

## Risks / Trade-offs

- [Unused `default` reason] → documented; clients must not assume every enum member appears.
- [Unknown env is 200 not_found] → matches FR-ERR-001 preference for 200 over 4xx on the
  evaluate path; operators still 404 on admin GET of a missing env.
- [No cache] → every evaluate hits Postgres until the cache change; acceptable for Day 4 load.
- [Contract job has no Postgres] → integration owns live HTTP; contract owns goldens + schemas.

## Migration Plan

1. Deploy the image that replaces 501 with 200. Clients that treated 501 as "sleep and retry"
   start receiving flag values.
2. Rollback = previous image (501 returns). No SQL migration.

## Open Questions

None. Archived-vs-default, unused `default` reason, and unknown-env `not_found` are resolved
above.
