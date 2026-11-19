# Spec Delta

## ADDED Requirements

### Requirement: Key mint is audited

The system SHALL insert exactly one `key.create` audit event per minted API key in the same transaction as the key row. Mint paths are project create, first demo seed, and replenishment of a missing live admin or evaluate key. A seed that mints no key SHALL NOT insert keys or `key.create` events. (FR-PROJ-002, FR-AUD-001, FR-AUD-002)

#### Scenario: Project create writes one event per key

- **WHEN** `semaphore projects create --name --slug` succeeds
- **THEN** the database has one admin key, one evaluate key, and exactly one `key.create` row per key in that transaction, with no raw secret or key hash in the audit payloads

#### Scenario: First seed writes one event per minted key

- **WHEN** `semaphore seed` mints the demo admin and evaluate keys
- **THEN** exactly one `key.create` event exists for each minted key

#### Scenario: Second seed does not duplicate keys or events

- **WHEN** `semaphore seed` runs again against a demo project that already has live admin and evaluate keys
- **THEN** no additional keys are minted and no additional `key.create` events are inserted

#### Scenario: Missing-key replenishment is audited

- **WHEN** `semaphore seed` finds the demo project with a missing live admin or evaluate key and mints only the missing type
- **THEN** exactly one `key.create` event is inserted for that minted key and existing keys are left unchanged

#### Scenario: Failed mint audit rolls back the key

- **WHEN** the `key.create` insert fails during mint
- **THEN** the transaction rolls back and the key row is not persisted

### Requirement: Project-scoped key list

`GET /v1/keys` SHALL require an admin key and return metadata for keys of that key's project only: `id`, `type`, `prefix`, `created_at`, `revoked_at`. The response SHALL NOT include the raw secret or `key_hash`. A valid evaluate key SHALL receive 403 `FORBIDDEN`. Missing or invalid keys SHALL receive 401 `UNAUTHORIZED`. Keys of any other project SHALL never appear. (FR-PROJ-002, NFR-SEC-001)

#### Scenario: Admin key lists its project metadata

- **WHEN** a valid admin key calls `GET /v1/keys`
- **THEN** the response is 200 with `items` of that project's keys and each item has only `id`, `type`, `prefix`, `created_at`, and `revoked_at`

#### Scenario: Evaluate key is forbidden on list

- **WHEN** a valid evaluate key calls `GET /v1/keys`
- **THEN** the response is 403 `FORBIDDEN`

#### Scenario: Missing key is unauthorized on list

- **WHEN** a client calls `GET /v1/keys` without a valid API key
- **THEN** the response is 401 `UNAUTHORIZED`

#### Scenario: Other project's keys are invisible

- **WHEN** an admin key lists keys after another project has keys
- **THEN** none of the other project's keys appear

### Requirement: Project-scoped key revoke

`POST /v1/keys/:id/revoke` SHALL require an admin key, target only a key in that admin key's project, and return 200 with the key metadata including `revoked_at`. Unknown or foreign ids SHALL be 404 `NOT_FOUND` without revealing whether the id exists elsewhere. Repeating or concurrent revoke SHALL leave a single `key.revoke` event and an unchanged `revoked_at`. Self-revoke of the calling admin key is allowed. The last admin key of a project MAY be revoked. (FR-PROJ-002, FR-AUD-002, NFR-SEC-001)

#### Scenario: Admin revokes an evaluate key

- **WHEN** a valid admin key revokes an evaluate key of the same project
- **THEN** the response is 200 with that key's metadata and a non-null `revoked_at`, and a later request authenticated with the revoked raw key is 401 `UNAUTHORIZED`

#### Scenario: Foreign or unknown target is not found

- **WHEN** an admin key revokes a key id that belongs to another project or does not exist
- **THEN** the response is 404 `NOT_FOUND` and no key is changed

#### Scenario: Evaluate key is forbidden on revoke

- **WHEN** a valid evaluate key calls `POST /v1/keys/:id/revoke`
- **THEN** the response is 403 `FORBIDDEN` and the target is unchanged

#### Scenario: Repeat revoke is idempotent

- **WHEN** an admin key revokes an already revoked key of the same project
- **THEN** the response is 200 with the existing `revoked_at` and no additional `key.revoke` event is inserted

#### Scenario: Concurrent revoke writes one event

- **WHEN** two admin revoke requests for the same live key of that project overlap
- **THEN** the key has one `revoked_at` and exactly one `key.revoke` event

#### Scenario: Self-revoke ends access

- **WHEN** an admin key revokes its own id
- **THEN** the response is 200 and the next request with that raw key is 401 `UNAUTHORIZED`

#### Scenario: Failed revoke audit rolls back

- **WHEN** the `key.revoke` insert fails
- **THEN** the transaction rolls back and `revoked_at` stays null

### Requirement: Operator CLI key list and revoke

`semaphore keys list --project <slug>` SHALL print metadata for that project's keys without raw secrets or hashes. `semaphore keys revoke --project <slug> --key-id <uuid>` SHALL use the same revoke transaction as HTTP, with `DATABASE_URL` and no API key. Both commands SHALL isolate the target to the named project. (FR-PROJ-002, NFR-SEC-001)

#### Scenario: CLI list prints metadata

- **WHEN** an operator runs `semaphore keys list --project <slug>` against a database that has that project
- **THEN** stdout includes each key's id, type, prefix, created_at, and revoked_at and does not include raw secrets or key hashes

#### Scenario: CLI revoke uses the shared transaction

- **WHEN** an operator runs `semaphore keys revoke --project <slug> --key-id <uuid>` for a live key of that project
- **THEN** the command succeeds, the key is revoked, a later HTTP request with that raw key is 401 `UNAUTHORIZED`, and exactly one `key.revoke` event exists for that key
