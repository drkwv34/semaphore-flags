# Spec Delta

## MODIFIED Requirements

### Requirement: Single evaluate endpoint

`POST /v1/evaluate` SHALL require an evaluate key and accept JSON `{ "flag_key", "env" and/or "environment", "user": { "id", "attrs"? } }`. `environment` is an alias of `env` with the conflict rules in the scenarios below. A successful evaluation SHALL return HTTP 200 `{ "flag_key", "value", "reason", "variant" }`. (FR-EVAL-001, NFR-SEC-001)

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

- **WHEN** the body omits `flag_key`, both `env` and `environment`, or `user.id`, or `user.id` exceeds 128 characters
- **THEN** the response is 400 `VALIDATION_FAILED`

#### Scenario: environment alias matches env

- **WHEN** a valid evaluate key posts the same well-formed body using `environment` instead of `env`
- **THEN** the response is 200 and equals the response for the identical body that used `env`

#### Scenario: both env and environment equal is 200

- **WHEN** a valid evaluate key posts both `env` and `environment` with the same string
- **THEN** the response is 200 and equals the response for `env` alone

#### Scenario: both env and environment differ is 400

- **WHEN** a valid evaluate key posts `env` and `environment` with different strings
- **THEN** the response is 400 `VALIDATION_FAILED` with `fields` identifying the conflict

### Requirement: Batch evaluate endpoint

`POST /v1/evaluate-batch` SHALL require an evaluate key and accept JSON `{ "env" and/or "environment", "user": { "id", "attrs"? }, "flag_keys" }` using the same `env` / `environment` alias rules as single evaluate. A successful call SHALL return HTTP 200 whose body is a map keyed by each requested flag key. Unknown keys SHALL appear as `reason` `not_found` with `value` false; a partial miss SHALL still be 200. (FR-EVAL-003, FR-ERR-001, NFR-SEC-001)

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

#### Scenario: environment alias matches env

- **WHEN** a valid evaluate key posts the same well-formed batch body using `environment` instead of `env`
- **THEN** the response is 200 and equals the response for the identical body that used `env`

### Requirement: Batch size limits

`flag_keys` SHALL contain between 1 and 50 inclusive entries. An empty array or more than 50 keys SHALL be rejected with HTTP 400 `VALIDATION_FAILED`. Omitting both `env` and `environment`, omitting `user.id` or `flag_keys`, or a `user.id` longer than 128 characters, SHALL also be 400 `VALIDATION_FAILED`. (FR-EVAL-003)

#### Scenario: Empty flag_keys is 400

- **WHEN** `flag_keys` is `[]`
- **THEN** the response is 400 `VALIDATION_FAILED`

#### Scenario: Fifty-one keys is 400

- **WHEN** `flag_keys` contains 51 entries
- **THEN** the response is 400 `VALIDATION_FAILED`

#### Scenario: Fifty keys is accepted

- **WHEN** `flag_keys` contains 50 valid keys
- **THEN** the response is 200 and the map contains an entry for each distinct requested key
