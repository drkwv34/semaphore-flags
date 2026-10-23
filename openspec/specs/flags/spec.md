# flags

## Purpose

Boolean flags, per-environment config (enabled, percentage, rules) and soft archive.

SRS: FR-FLAG-001..004

## Requirements

### Requirement: Flag records

The system SHALL persist a boolean flag per project with a unique key matching `^[a-z][a-z0-9_]{1,63}$`, optional description, `default_value`, and `client_fallback` of `fail_closed` or `fail_open` (default `fail_closed`). (FR-FLAG-001)

#### Scenario: Valid flag is created

- **WHEN** an admin key posts a valid unused flag key
- **THEN** the response is 201 with the created flag, `flag_type` `boolean`, and `client_fallback` defaulting to `fail_closed` when omitted

#### Scenario: Invalid flag key is rejected

- **WHEN** an admin key posts a key that fails `^[a-z][a-z0-9_]{1,63}$`
- **THEN** the response is 400 `VALIDATION_FAILED` with field-level errors

#### Scenario: Duplicate flag key is rejected

- **WHEN** an admin key posts a key that already exists for that project, including archived flags
- **THEN** the response is 409 `CONFLICT`

### Requirement: Default env configs on create

Creating a flag SHALL insert a disabled 0% env config with no rules for every existing environment of the project. (FR-FLAG-002)

#### Scenario: New flag has a config per environment

- **WHEN** a project has environments `dev`, `staging`, and `prod` and an admin creates a flag
- **THEN** `GET /v1/flags/:key` includes those three env configs, each `enabled` false, `percentage` 0, and `rules` empty

### Requirement: List flags

`GET /v1/flags` SHALL require an admin key, exclude archived flags unless `include_archived=true`, and paginate with `limit` (default 50, max 200) and `offset` (default 0). (FR-FLAG-001)

#### Scenario: List omits archived flags by default

- **WHEN** a project has one live flag and one archived flag
- **THEN** `GET /v1/flags` returns only the live flag

#### Scenario: List can include archived flags

- **WHEN** a client calls `GET /v1/flags?include_archived=true`
- **THEN** archived flags appear in the items

#### Scenario: List paginates

- **WHEN** a client calls `GET /v1/flags?limit=1&offset=0` with two live flags
- **THEN** the response contains one item and enough paging metadata to fetch the rest

### Requirement: Get flag with env configs

`GET /v1/flags/:key` SHALL require an admin key and return the flag plus per-environment configs whose rules are sorted by priority ascending. Unknown keys SHALL be 404. Archived flags SHALL still be readable. (FR-FLAG-002)

#### Scenario: Get returns ordered rules

- **WHEN** an admin key gets a flag that has rules at priorities 10 and 0
- **THEN** the response is 200 and that env's `rules` array is ordered 0 then 10

#### Scenario: Unknown flag is 404

- **WHEN** an admin key gets a flag key that does not exist for the project
- **THEN** the response is 404 `NOT_FOUND`

#### Scenario: Archived flag is still readable

- **WHEN** an admin key gets a flag whose `archived_at` is set
- **THEN** the response is 200 with that flag and its env configs

### Requirement: Patch flag metadata

`PATCH /v1/flags/:key` SHALL require an admin key and MAY update `description`, `default_value`, and `client_fallback`. Mutations on an archived flag SHALL return 409. Unknown keys SHALL be 404. (FR-FLAG-001)

#### Scenario: Patch updates allowed fields

- **WHEN** an admin key patches `description` and `default_value` on a live flag
- **THEN** the response is 200 with the new values

#### Scenario: Patch of archived flag is 409

- **WHEN** an admin key patches an archived flag
- **THEN** the response is 409 `CONFLICT`

### Requirement: Replace env config

`PUT /v1/flags/:key/envs/:env` SHALL require an admin key and replace `enabled`, `percentage` (integer 0–100), and the full ordered `rules[]` for that env in one transaction. Unknown flag or env SHALL be 404. Archived flags SHALL be 409. (FR-FLAG-002, FR-FLAG-003)

#### Scenario: Put replaces rules atomically

- **WHEN** an admin key PUTs enabled true, percentage 50, and two valid rules
- **THEN** the response is 200 with those values and the rules sorted by priority ascending, and a subsequent GET matches

#### Scenario: Invalid percentage is 400

- **WHEN** an admin key PUTs `percentage` 101
- **THEN** the response is 400 `VALIDATION_FAILED` with field-level errors

#### Scenario: Unknown env is 404

- **WHEN** an admin key PUTs a config for an environment key the project does not have
- **THEN** the response is 404 `NOT_FOUND`

#### Scenario: Put on archived flag is 409

- **WHEN** an admin key PUTs an env config for an archived flag
- **THEN** the response is 409 `CONFLICT`

### Requirement: Soft archive

`POST /v1/flags/:key/archive` SHALL require an admin key, set `archived_at`, and leave the row in place. A second archive SHALL be 409. Unknown keys SHALL be 404. (FR-FLAG-004)

#### Scenario: Archive succeeds once

- **WHEN** an admin key archives a live flag
- **THEN** the response is 200 with `archived_at` set and the flag remains readable by GET

#### Scenario: Archive of already-archived flag is 409

- **WHEN** an admin key archives a flag that is already archived
- **THEN** the response is 409 `CONFLICT`

### Requirement: Admin-only flag routes

Every `/v1/flags` route SHALL accept only admin keys. A valid evaluate key SHALL produce 403 `FORBIDDEN`. (FR-FLAG-001, NFR-SEC-001)

#### Scenario: Evaluate key is forbidden on flag routes

- **WHEN** a valid evaluate key calls `POST /v1/flags`, `GET /v1/flags`, `GET /v1/flags/:key`, `PATCH /v1/flags/:key`, `PUT /v1/flags/:key/envs/:env`, or `POST /v1/flags/:key/archive`
- **THEN** each response is 403 `FORBIDDEN`

### Requirement: Parameterized SQL for flag tables

All reads and writes of flags, env configs, and rules SHALL use parameterized queries. (NFR-SEC-002)

#### Scenario: Bind parameters for flag key lookups

- **WHEN** the store looks up a flag by project and key or inserts an env config
- **THEN** values are passed as query parameters, not interpolated into the SQL string
