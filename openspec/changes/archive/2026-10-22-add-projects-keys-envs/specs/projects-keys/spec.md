# Spec Delta

## REMOVED Requirements

### Requirement: Placeholder until first change is archived

**Reason**: Replaced by normative project, API-key, environment, CLI, and auth requirements for Day 2.

**Migration**: Use the ADDED requirements in this change. No runtime callers existed for the placeholder.

## ADDED Requirements

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

`semaphore seed` SHALL create a demo project (`slug` `demo`) with default environments and one admin plus one evaluate key if missing. A second run SHALL NOT mint or print new keys. (FR-PROJ-001)

#### Scenario: First seed prints keys

- **WHEN** `semaphore seed` runs against an empty database after migrate
- **THEN** the demo project is created and raw keys are printed once

#### Scenario: Second seed is a no-op for keys

- **WHEN** `semaphore seed` runs again against the same database
- **THEN** no additional keys are minted and raw keys are not printed

### Requirement: Parameterized SQL for identity tables

All reads and writes of projects, API keys, and environments SHALL use parameterized queries. Dynamic SQL concatenation of user input is forbidden. (NFR-SEC-002)

#### Scenario: Bind parameters for lookups

- **WHEN** the store looks up a key by prefix or inserts an environment key
- **THEN** values are passed as query parameters, not interpolated into the SQL string

### Requirement: Evaluate placeholder after auth

`POST /v1/evaluate` SHALL authenticate as an evaluate route and, when evaluation is not implemented, return HTTP 501 with a typed error code. (FR-PROJ-002)

#### Scenario: Authenticated evaluate is not implemented

- **WHEN** a valid evaluate key calls `POST /v1/evaluate`
- **THEN** the response is 501 after the key type check succeeds
