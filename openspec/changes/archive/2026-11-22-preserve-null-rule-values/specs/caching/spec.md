# Spec Delta

## ADDED Requirements

### Requirement: Cached snapshot preserves JSON null rule values

When Redis is configured, the compiled snapshot stored at `flags:{project_id}:{env}` SHALL include targeting rules whose `value` is JSON `null`. A cache hit SHALL evaluate those rules the same as a Postgres snapshot load. When Redis is unset, Postgres-only evaluate SHALL still include those rules. (FR-CACHE-001, FR-EVAL-002)

#### Scenario: Redis payload keeps eq null

- **WHEN** an env config with an `eq` rule whose `value` is JSON `null` is evaluated and the snapshot is written to Redis
- **THEN** the cached snapshot for that `(project_id, env)` still contains that rule with `value` JSON `null`

#### Scenario: Cache hit matches eq null

- **WHEN** Redis holds a snapshot that includes `user.x eq null` serving true and evaluate is called with `user.attrs.x` JSON `null`
- **THEN** the response is 200 `{ "value": true, "reason": "rule_match" }` from the cached snapshot
