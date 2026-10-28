# Spec Delta

## ADDED Requirements

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
