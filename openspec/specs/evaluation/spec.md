# evaluation

## Purpose

Single and batch evaluate with the normative algorithm, deterministic SHA-256 bucketing and the fixed reason enum.

SRS: FR-EVAL-001..005, NFR-PERF-001..002, NFR-REL-002

## Requirements

### Requirement: Single evaluate endpoint

`POST /v1/evaluate` SHALL require an evaluate key and accept JSON `{ "flag_key", "env", "user": { "id", "attrs"? } }`. A successful evaluation SHALL return HTTP 200 `{ "flag_key", "value", "reason", "variant" }`. (FR-EVAL-001, NFR-SEC-001)

#### Scenario: Evaluate key receives 200

- **WHEN** a valid evaluate key posts a well-formed body for any flag key
- **THEN** the response is 200 with `flag_key`, boolean `value`, a reason from the enum, and `variant`

#### Scenario: Admin key is forbidden

- **WHEN** a valid admin key calls `POST /v1/evaluate`
- **THEN** the response is 403 `FORBIDDEN`

#### Scenario: Missing key is unauthorized

- **WHEN** `POST /v1/evaluate` is called without a Bearer token
- **THEN** the response is 401 `UNAUTHORIZED`

#### Scenario: Malformed body is 400

- **WHEN** the body omits `flag_key`, `env`, or `user.id`, or `user.id` exceeds 128 characters
- **THEN** the response is 400 `VALIDATION_FAILED`

### Requirement: Evaluate algorithm

Evaluation SHALL apply this order and SHALL NOT throw: missing flag → `not_found` / false; archived → `archived` / false; `enabled` false → `disabled` / `default_value`; first matching rule → `rule_match` / `rule.serve`; `bucket < percentage` → `percentage_in` / true; otherwise `percentage_out` / false. (FR-EVAL-002)

#### Scenario: Missing flag is not_found

- **WHEN** the project's environment snapshot has no flag for the requested key, including an unknown env
- **THEN** the response is 200 `{ "value": false, "reason": "not_found", "variant": "off" }`

#### Scenario: Archived flag is archived

- **WHEN** the flag exists and `archived_at` is set
- **THEN** the response is 200 `{ "value": false, "reason": "archived", "variant": "off" }` even if a rule would match

#### Scenario: Kill switch serves default_value

- **WHEN** the env config has `enabled` false
- **THEN** the response is 200 with `value` equal to the flag's `default_value` and `reason` `disabled`, ignoring rules and percentage

#### Scenario: First matching rule wins

- **WHEN** the env is enabled and the lowest-priority matching rule has `serve` true
- **THEN** the response is 200 `{ "value": true, "reason": "rule_match", "variant": "on" }` and later rules are not applied

#### Scenario: Percentage 0 is everyone out after rules

- **WHEN** the env is enabled, no rule matches, and `percentage` is 0
- **THEN** the response is 200 `{ "value": false, "reason": "percentage_out", "variant": "off" }`

#### Scenario: Percentage 100 is everyone in after rules

- **WHEN** the env is enabled, no rule matches, and `percentage` is 100
- **THEN** the response is 200 `{ "value": true, "reason": "percentage_in", "variant": "on" }`

### Requirement: SHA-256 hash bucketing

`bucket` SHALL be the first four bytes of SHA-256(`project_salt + ":" + flag_key + ":" + user.id`) interpreted big-endian, modulo 100, yielding an integer in 0..99 inclusive. Rollout SHALL use `bucket < percentage`. Committed golden vectors SHALL never change. (FR-EVAL-002, NFR-REL-002)

#### Scenario: Bucket 0 is in at percentage 1

- **WHEN** a user hashes to bucket 0 and `percentage` is 1 with no matching rule
- **THEN** the reason is `percentage_in` and `value` is true

#### Scenario: Bucket 99 is out at percentage 99

- **WHEN** a user hashes to bucket 99 and `percentage` is 99 with no matching rule
- **THEN** the reason is `percentage_out` and `value` is false

#### Scenario: Same salt, key, and id are stable

- **WHEN** the same `project_salt`, `flag_key`, and `user.id` are hashed twice
- **THEN** the bucket is identical

### Requirement: Reason enum and variant

`reason` SHALL be one of `disabled`, `rule_match`, `percentage_in`, `percentage_out`, `default`, `archived`, `not_found`. `variant` SHALL be `"on"` when `value` is true and `"off"` otherwise. The algorithm in this change SHALL NOT emit `default`. (FR-EVAL-001)

#### Scenario: Variant follows value

- **WHEN** evaluation returns `value` true
- **THEN** `variant` is `"on"`

#### Scenario: Variant off when false

- **WHEN** evaluation returns `value` false
- **THEN** `variant` is `"off"`

### Requirement: Postgres failure on evaluate

When the environment snapshot cannot be loaded because Postgres is unreachable, `POST /v1/evaluate` SHALL return 503 `UNAVAILABLE`. Redis is not used in this change. (FR-ERR-001)

#### Scenario: Unreachable database is 503

- **WHEN** the evaluate handler cannot read the snapshot from Postgres
- **THEN** the response is 503 `UNAVAILABLE`

### Requirement: Batch evaluate endpoint

`POST /v1/evaluate-batch` SHALL require an evaluate key and accept JSON `{ "env", "user": { "id", "attrs"? }, "flag_keys" }`. A successful call SHALL return HTTP 200 whose body is a map keyed by each requested flag key, each value `{ "flag_key", "value", "reason", "variant" }` using the same reason enum as single evaluate. Unknown keys SHALL appear as `reason` `not_found` with `value` false; a partial miss SHALL still be 200. (FR-EVAL-003, FR-ERR-001, NFR-SEC-001)

#### Scenario: Evaluate key receives a map

- **WHEN** a valid evaluate key posts a well-formed body with one or more flag keys
- **THEN** the response is 200 and every requested key is present in the map with `flag_key`, boolean `value`, a reason from the enum, and `variant`

#### Scenario: Admin key is forbidden

- **WHEN** a valid admin key calls `POST /v1/evaluate-batch`
- **THEN** the response is 403 `FORBIDDEN`

#### Scenario: Missing key is unauthorized

- **WHEN** `POST /v1/evaluate-batch` is called without a Bearer token
- **THEN** the response is 401 `UNAUTHORIZED`

#### Scenario: Partial not_found is 200

- **WHEN** the body includes both a known flag key and an unknown flag key
- **THEN** the response is 200, the known key has its evaluated result, and the unknown key is `{ "value": false, "reason": "not_found", "variant": "off" }`

### Requirement: Batch size limits

`flag_keys` SHALL contain between 1 and 50 inclusive entries. An empty array or more than 50 keys SHALL be rejected with HTTP 400 `VALIDATION_FAILED`. Omitting `env`, `user.id`, or `flag_keys`, or a `user.id` longer than 128 characters, SHALL also be 400 `VALIDATION_FAILED`. (FR-EVAL-003)

#### Scenario: Empty flag_keys is 400

- **WHEN** `flag_keys` is `[]`
- **THEN** the response is 400 `VALIDATION_FAILED`

#### Scenario: Fifty-one keys is 400

- **WHEN** `flag_keys` contains 51 entries
- **THEN** the response is 400 `VALIDATION_FAILED`

#### Scenario: Fifty keys is accepted

- **WHEN** `flag_keys` contains 50 valid keys
- **THEN** the response is 200 and the map contains an entry for each distinct requested key

### Requirement: Batch agrees with single evaluate

For every requested key, the batch entry SHALL equal the result of `POST /v1/evaluate` for the same project, env, user, and flag key, including kill switch, rule match, percentage in/out, archived, and not_found. Batch SHALL reuse the single-evaluate algorithm and SHALL NOT fork it. (FR-EVAL-002, FR-EVAL-003)

#### Scenario: Kill switch matches single evaluate

- **WHEN** a flag's env config has `enabled` false
- **THEN** the batch entry for that key equals the single-evaluate response (`reason` `disabled`, `value` equal to `default_value`)

#### Scenario: Rule match matches single evaluate

- **WHEN** the env is enabled and the first matching rule serves true
- **THEN** the batch entry equals the single-evaluate `rule_match` result

#### Scenario: Percentage boundaries match single evaluate

- **WHEN** no rule matches and percentage is 0, 1 (bucket 0), 99 (bucket 99), or 100
- **THEN** each batch entry equals the corresponding single-evaluate `percentage_in` or `percentage_out` result

#### Scenario: Archived matches single evaluate

- **WHEN** the flag is archived
- **THEN** the batch entry equals the single-evaluate `archived` result even if a rule would match

### Requirement: Postgres failure on batch evaluate

When the environment snapshot cannot be loaded because Postgres is unreachable, `POST /v1/evaluate-batch` SHALL return 503 `UNAVAILABLE`. Redis is not used in this change. (FR-ERR-001)

#### Scenario: Unreachable database is 503

- **WHEN** the batch handler cannot read the snapshot from Postgres
- **THEN** the response is 503 `UNAVAILABLE`
