# Spec Delta

## REMOVED Requirements

### Requirement: Placeholder until first change is archived

**Reason**: Replaced by compiled-snapshot cache, invalidation, singleflight, and Redis-down degrade.

**Migration**: Use the ADDED requirements in this change. No runtime callers existed for the placeholder beyond the scaffold `src/cache` module.

## ADDED Requirements

### Requirement: Compiled environment snapshot cache

When `REDIS_URL` is set, evaluate SHALL read the compiled flag set for `(project_id, env)` from cache key `flags:{project_id}:{env}` with TTL 60 seconds. When `REDIS_URL` is unset, evaluate SHALL read Postgres through the same cache interface. (FR-CACHE-001)

#### Scenario: Cache miss loads from Postgres and stores the snapshot

- **WHEN** evaluate runs for a project and env whose cache key is empty
- **THEN** the snapshot is loaded from Postgres and written to `flags:{project_id}:{env}` with TTL 60s

#### Scenario: Cache hit serves the stored snapshot

- **WHEN** evaluate runs again for the same project and env before TTL expiry and Redis is healthy
- **THEN** the response is produced from the cached snapshot without requiring a second Postgres snapshot load

#### Scenario: Unset REDIS_URL reads Postgres

- **WHEN** `REDIS_URL` is unset or empty
- **THEN** single and batch evaluate still return 200 from Postgres using the same cache interface

### Requirement: Shared cache for single and batch evaluate

`POST /v1/evaluate` and `POST /v1/evaluate-batch` SHALL use the same per-`(project_id, env)` compiled snapshot cache. (FR-CACHE-001, FR-EVAL-003)

#### Scenario: Batch uses the same key as single evaluate

- **WHEN** a single evaluate populates `flags:{project_id}:{env}` and a batch evaluate for that env follows
- **THEN** the batch is served from that cached snapshot

### Requirement: Invalidate on admin mutation

Every admin mutation that changes flags, rules, or per-env config SHALL delete the affected cache key(s) after the transaction commits and before returning 2xx. Flag-level changes SHALL delete keys for all environments of that project. (FR-CACHE-002)

#### Scenario: Env-config mutation is visible immediately

- **WHEN** an admin PUT updates a flag's env config while the cache holds the previous snapshot
- **THEN** the next single and batch evaluate for that env return the new value

#### Scenario: Flag-level mutation invalidates every env

- **WHEN** an admin archives or patches a flag
- **THEN** cache keys for all of that project's environments are deleted before 2xx

#### Scenario: Failed invalidation still returns 2xx

- **WHEN** Redis delete fails after a successful mutation commit
- **THEN** the mutation still returns 2xx and a warning is logged

### Requirement: Singleflight on cache miss

Concurrent misses for the same cache key SHALL load from Postgres at most once per process. (FR-CACHE-003)

#### Scenario: Parallel misses share one load

- **WHEN** many evaluate requests miss the same `flags:{project_id}:{env}` at once
- **THEN** only one Postgres snapshot load runs for that key and the others wait for it

### Requirement: Redis degrade

Redis unavailability or errors SHALL NOT cause evaluate or admin mutations to fail. Evaluate SHALL answer from Postgres with a warning log. (FR-CACHE-004, NFR-REL-001)

#### Scenario: Redis down still evaluates

- **WHEN** Redis is stopped or `REDIS_URL` points at an unreachable host
- **THEN** `POST /v1/evaluate` still returns 200 from Postgres and does not return 5xx

#### Scenario: Redis down still mutates

- **WHEN** Redis is unreachable during an admin flag mutation
- **THEN** the mutation still commits and returns 2xx

#### Scenario: Dead Redis does not stall

- **WHEN** Redis does not answer
- **THEN** evaluate still completes using short Redis timeouts rather than waiting for a default client timeout
