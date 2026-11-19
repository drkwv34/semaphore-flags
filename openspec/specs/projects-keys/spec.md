# projects-keys

## Purpose

Projects, API keys (admin vs evaluate) and environments.

SRS: FR-PROJ-001..003, NFR-SEC-001

## Requirements

### Requirement: Project records

The system SHALL persist a project with a unique slug, a display name, a per-project random salt, and a creation timestamp. (FR-PROJ-001)

#### Scenario: Unique slug is rejected

- **WHEN** a second project is created with a slug that already exists
- **THEN** the system does not insert a second project and reports a conflict to the caller

#### Scenario: Salt is stored per project

- **WHEN** a project is created
- **THEN** it has a non-empty random salt that is distinct from other projects' salts

### Requirement: Default environments on create

When a project is created the system SHALL insert environments `dev`, `staging`, and `prod` for that project. Environment keys SHALL match `^[a-z][a-z0-9-]{1,31}$`. (FR-PROJ-003)

#### Scenario: New project has three default environments

- **WHEN** a project is created via `semaphore projects create`
- **THEN** environments `dev`, `staging`, and `prod` exist for that project

### Requirement: API key minting and display-once

The system SHALL mint one `admin` key and one `evaluate` key when a project is created. Each raw key SHALL be printed exactly once at creation and SHALL NOT be stored in plaintext. (FR-PROJ-002, NFR-SEC-001)

#### Scenario: Keys printed once at create

- **WHEN** `semaphore projects create --name --slug` succeeds
- **THEN** stdout includes one admin raw key and one evaluate raw key, and the database stores hashes rather than those raw values

### Requirement: Key prefix and hash

Each API key SHALL use a readable type prefix (`sf_admin_` or `sf_eval_`) plus a stored non-secret `prefix` used for lookup. Only a SHA-256 hash of the full secret SHALL be persisted. Hash comparison SHALL be constant-time. (NFR-SEC-001)

#### Scenario: Lookup by prefix then hash

- **WHEN** a request presents a well-formed Bearer key
- **THEN** the system looks up the stored row by `prefix` and accepts the key only if the SHA-256 of the presented secret matches `key_hash` in constant time

### Requirement: Authentication failures

Missing, malformed, unknown, or revoked API keys SHALL produce HTTP 401 with code `UNAUTHORIZED`. The response SHALL NOT reveal which check failed. (FR-PROJ-002, NFR-SEC-001)

#### Scenario: Missing Authorization header

- **WHEN** a client calls an authenticated route without `Authorization`
- **THEN** the response is 401 `UNAUTHORIZED`

#### Scenario: Malformed or unknown key

- **WHEN** a client sends a malformed Bearer token or a well-formed key whose prefix is unknown
- **THEN** the response is 401 `UNAUTHORIZED`

#### Scenario: Revoked key

- **WHEN** a client sends a previously valid key whose `revoked_at` is set
- **THEN** the response is 401 `UNAUTHORIZED`

### Requirement: Authorization by key type

A valid API key of the wrong type SHALL produce HTTP 403 with code `FORBIDDEN`. Admin routes SHALL accept only admin keys. Evaluate routes SHALL accept only evaluate keys. Admin keys SHALL NOT be permitted to call evaluate routes. (FR-PROJ-002, NFR-SEC-001)

#### Scenario: Evaluate key on admin route

- **WHEN** a valid evaluate key calls `GET /v1/projects/current`
- **THEN** the response is 403 `FORBIDDEN`

#### Scenario: Admin key on evaluate route

- **WHEN** a valid admin key calls `POST /v1/evaluate`
- **THEN** the response is 403 `FORBIDDEN`

#### Scenario: Matching key type is allowed

- **WHEN** a valid admin key calls an admin route, or a valid evaluate key calls an evaluate route
- **THEN** authentication and type checks succeed

### Requirement: Current project endpoint

`GET /v1/projects/current` SHALL require an admin key and return the project bound to that key. The project id SHALL come only from the key, never from the request body. (FR-PROJ-001)

#### Scenario: Admin key reads its project

- **WHEN** a valid admin key calls `GET /v1/projects/current`
- **THEN** the response is 200 with that key's project `id`, `name`, `slug`, and `created_at`

### Requirement: Custom environments

`POST /v1/environments` SHALL require an admin key, accept JSON `{ "key": "<env>" }` matching `^[a-z][a-z0-9-]{1,31}$`, create the environment for the key's project, and return 409 `CONFLICT` when `(project_id, key)` already exists. (FR-PROJ-003)

#### Scenario: Create a custom environment

- **WHEN** an admin key posts a valid unused environment key
- **THEN** the response is 201 with the created environment

#### Scenario: Invalid environment key

- **WHEN** an admin key posts a key that fails the environment-key regex
- **THEN** the response is 400 `VALIDATION_FAILED`

#### Scenario: Duplicate environment key

- **WHEN** an admin key posts an environment key that already exists for that project
- **THEN** the response is 409 `CONFLICT`

### Requirement: Projects create CLI

`semaphore projects create --name <name> --slug <slug>` SHALL create the project, seed default environments, mint one admin and one evaluate key, and print each raw key exactly once. (FR-PROJ-001, FR-PROJ-002)

#### Scenario: Successful create

- **WHEN** the operator runs `semaphore projects create --name "Acme" --slug acme`
- **THEN** the project, three default environments, and two keys exist, and both raw keys are printed once

### Requirement: Idempotent demo seed

`semaphore seed` SHALL create a demo project (`slug` `demo`) with default environments and one admin plus one evaluate key if missing. A second run SHALL NOT mint or print new keys. When `SEED_KEYS_PATH` is set and keys are minted on this run, the CLI SHALL write those raw keys to that path for local Compose only; the database SHALL still store hashes, not plaintext. (FR-PROJ-001, FR-PROJ-002)

#### Scenario: First seed prints keys

- **WHEN** `semaphore seed` runs against an empty database after migrate
- **THEN** the demo project is created and raw keys are printed once

#### Scenario: Second seed is a no-op for keys

- **WHEN** `semaphore seed` runs again against the same database
- **THEN** no additional keys are minted and raw keys are not printed

#### Scenario: First seed can write a local key file

- **WHEN** `SEED_KEYS_PATH` is set and `semaphore seed` mints keys
- **THEN** that path contains the admin and evaluate raw keys and the database still stores only hashes

### Requirement: Parameterized SQL for identity tables

All reads and writes of projects, API keys, and environments SHALL use parameterized queries. Dynamic SQL concatenation of user input is forbidden. (NFR-SEC-002)

#### Scenario: Bind parameters for lookups

- **WHEN** the store looks up a key by prefix or inserts an environment key
- **THEN** values are passed as query parameters, not interpolated into the SQL string

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
