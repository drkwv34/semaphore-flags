# audit

## Purpose

Append-only audit log of every admin mutation, readable by admin keys only.

SRS: FR-AUD-001..004

## Requirements

### Requirement: Audit row shape

Each audit event SHALL persist `project_id`, `actor_key_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `created_at`, and `request_id`. `actor_key_id` MAY be null for bootstrap and operator CLI events that have no authenticated API key. Secrets and key hashes SHALL NOT appear in the JSON payloads. (FR-AUD-001)

#### Scenario: Create writes after_json

- **WHEN** an admin key creates a flag
- **THEN** an audit row exists with `action` `flag.create`, `entity_type` `flag`, `before_json` null, `after_json` describing the flag, `actor_key_id` of that key, and the request's `request_id`

#### Scenario: Bootstrap mint has a null actor

- **WHEN** `semaphore projects create` or `semaphore seed` mints a key
- **THEN** the `key.create` row has `actor_key_id` null, a unique `request_id` that identifies the command, and payloads that omit the raw secret and key hash

### Requirement: Same-transaction write

Every successful admin mutation SHALL insert its audit row in the same Postgres transaction as the change. A rolled-back mutation SHALL leave no audit row. No-op updates SHALL write no audit row. Successful API-key mint and effective key revoke SHALL follow the same rule. (FR-AUD-002)

#### Scenario: Flag update writes one flag.update row

- **WHEN** an admin key patches a live flag's description
- **THEN** exactly one new `flag.update` row exists for that flag with both before and after JSON

#### Scenario: Archive writes flag.archive

- **WHEN** an admin key archives a live flag
- **THEN** exactly one new `flag.archive` row exists for that flag

#### Scenario: Env put writes env_config.update and rule diffs

- **WHEN** an admin key PUTs a new env config that adds one rule, changes one existing rule, and omits a third
- **THEN** the transaction includes `env_config.update` plus `rule.create`, `rule.update`, and `rule.delete` as applicable

#### Scenario: Key mint and revoke share the change transaction

- **WHEN** a key is minted or an effective revoke commits
- **THEN** the matching `key.create` or `key.revoke` row is visible only after that same transaction commits

### Requirement: Append-only audit log

Audit rows SHALL never be updated or deleted in application code. The database SHALL reject UPDATE and DELETE against `audit_events`. (FR-AUD-004)

#### Scenario: UPDATE is rejected by the database

- **WHEN** a client issues `UPDATE audit_events SET action = 'x'`
- **THEN** the statement fails and the row is unchanged

#### Scenario: DELETE is rejected by the database

- **WHEN** a client issues `DELETE FROM audit_events`
- **THEN** the statement fails and the row remains

### Requirement: Admin audit list endpoint

`GET /v1/audit` SHALL require an admin key and SHALL list audit rows for the caller's project only. A valid evaluate key SHALL receive 403 `FORBIDDEN`. Missing or invalid keys SHALL receive 401 `UNAUTHORIZED`. Rows belonging to any other project SHALL never appear. (FR-AUD-003, NFR-SEC-001)

#### Scenario: Admin key lists the project's rows

- **WHEN** a valid admin key calls `GET /v1/audit`
- **THEN** the response is 200 and every item belongs to that key's project

#### Scenario: Evaluate key is forbidden

- **WHEN** a valid evaluate key calls `GET /v1/audit`
- **THEN** the response is 403 `FORBIDDEN`

#### Scenario: Other project's rows are invisible

- **WHEN** an admin key lists audit after another project has rows
- **THEN** none of the other project's rows appear in the response

### Requirement: Audit list filters

`GET /v1/audit` SHALL filter by `entity_type`, `entity_id`, `action`, and `since`/`until` (`created_at` inclusive range) when those query parameters are present. Unknown `entity_type` or `action` values and unparseable timestamps SHALL be 400 `VALIDATION_FAILED`. Allowed actions include `key.create` and `key.revoke`; allowed entity types include `key`. (FR-AUD-003)

#### Scenario: Filter by entity_type

- **WHEN** `entity_type=flag` is supplied
- **THEN** every returned item has `entity_type` `flag`

#### Scenario: Filter by entity_id

- **WHEN** `entity_id` of a known flag is supplied
- **THEN** every returned item has that `entity_id`

#### Scenario: Filter by action

- **WHEN** `action=flag.create` is supplied
- **THEN** every returned item has `action` `flag.create`

#### Scenario: Filter by created_at range

- **WHEN** `since` and `until` bound a window that contains some rows and excludes others
- **THEN** only rows with `created_at` in that inclusive window are returned

#### Scenario: Filter by key lifecycle action

- **WHEN** `action=key.create` or `action=key.revoke` is supplied
- **THEN** every returned item has that action and a request with an unknown action is 400 `VALIDATION_FAILED`

### Requirement: Audit list pagination

`GET /v1/audit` SHALL paginate with `limit` (default 50, maximum 200) and an opaque `cursor`. Order SHALL be `created_at` descending, `id` descending as tiebreak. Consecutive pages SHALL NOT duplicate or skip rows. The response SHALL include `items` and `next_cursor` (null when no further page). (FR-AUD-003)

#### Scenario: Default limit is 50

- **WHEN** `GET /v1/audit` is called without `limit`
- **THEN** at most 50 items are returned

#### Scenario: Limit above 200 is rejected

- **WHEN** `limit` is greater than 200
- **THEN** the response is 400 `VALIDATION_FAILED`

#### Scenario: Pages have no duplicates or gaps

- **WHEN** more than `limit` rows exist and the client follows `next_cursor` until it is null
- **THEN** the concatenated items equal the full ordered set with no duplicates and no omissions

### Requirement: Audit list item fields

Each list item SHALL include `actor_key_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `request_id`, and `created_at`. `actor_key_id` MAY be JSON null. Secrets and key hashes SHALL NOT appear in JSON payloads. (FR-AUD-001, FR-AUD-003)

#### Scenario: Create event exposes FR-AUD-001 fields

- **WHEN** an admin key lists audit after creating a flag
- **THEN** the matching item includes those fields, `action` `flag.create`, `before_json` null, and `after_json` describing the flag

#### Scenario: Key event omits secrets

- **WHEN** an admin key lists audit after a `key.create` or `key.revoke` event
- **THEN** the item includes the FR-AUD-001 fields, `entity_type` `key`, and neither the raw secret nor `key_hash`

### Requirement: Audit HTTP API is read-only

The HTTP API SHALL expose only GET for audit rows. Application code SHALL NOT UPDATE or DELETE `audit_events`. (FR-AUD-004)

#### Scenario: No update or delete route

- **WHEN** a client calls any method other than GET on `/v1/audit`
- **THEN** the server does not mutate audit rows

### Requirement: Key lifecycle audit actions

The closed set of audit actions SHALL include `key.create` and `key.revoke`, and the closed set of entity types SHALL include `key`. HTTP revoke SHALL store the authenticated admin key as `actor_key_id` and the HTTP `request_id`. Operator CLI revoke SHALL store `actor_key_id` null and a unique command `request_id`. (FR-AUD-001, FR-AUD-003)

#### Scenario: HTTP revoke names the admin actor

- **WHEN** an admin key successfully revokes a live key of its project
- **THEN** exactly one `key.revoke` row exists with that admin key as `actor_key_id`, the HTTP `request_id`, and the target key as `entity_id`

#### Scenario: CLI revoke uses a null actor

- **WHEN** `semaphore keys revoke --project --key-id` successfully revokes a live key
- **THEN** exactly one `key.revoke` row exists with `actor_key_id` null and a unique `request_id` that identifies the command
