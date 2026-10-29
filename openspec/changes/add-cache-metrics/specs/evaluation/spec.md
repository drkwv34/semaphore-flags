# Spec Delta

## MODIFIED Requirements

### Requirement: Postgres failure on evaluate

When the environment snapshot cannot be loaded because Postgres is unreachable, `POST /v1/evaluate` SHALL return 503 `UNAVAILABLE`. Redis unavailability SHALL NOT cause evaluate to fail; the request SHALL continue from Postgres. (FR-ERR-001, FR-CACHE-004, NFR-REL-001)

#### Scenario: Unreachable database is 503

- **WHEN** the evaluate handler cannot read the snapshot from Postgres
- **THEN** the response is 503 `UNAVAILABLE`

#### Scenario: Unreachable Redis is not 5xx

- **WHEN** Redis is down or erroring and Postgres can load the snapshot
- **THEN** `POST /v1/evaluate` returns 200 and does not return 5xx

### Requirement: Postgres failure on batch evaluate

When the environment snapshot cannot be loaded because Postgres is unreachable, `POST /v1/evaluate-batch` SHALL return 503 `UNAVAILABLE`. Redis unavailability SHALL NOT cause batch evaluate to fail; the request SHALL continue from Postgres. (FR-ERR-001, FR-CACHE-004, NFR-REL-001)

#### Scenario: Unreachable database is 503

- **WHEN** the batch handler cannot read the snapshot from Postgres
- **THEN** the response is 503 `UNAVAILABLE`

#### Scenario: Unreachable Redis is not 5xx

- **WHEN** Redis is down or erroring and Postgres can load the snapshot
- **THEN** `POST /v1/evaluate-batch` returns 200 and does not return 5xx
