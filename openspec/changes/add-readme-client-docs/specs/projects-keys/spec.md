# Spec Delta

## MODIFIED Requirements

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
