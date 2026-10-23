# Spec Delta

## REMOVED Requirements

### Requirement: Placeholder until first change is archived

**Reason**: Replaced by the append-only write path, same-transaction insert, and database-level immutability for Day 3. The admin read API remains a later change.

**Migration**: Use the ADDED requirements in this change. No runtime callers existed for the placeholder.

## ADDED Requirements

### Requirement: Audit row shape

Each audit event SHALL persist `project_id`, `actor_key_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `created_at`, and `request_id`. Secrets and key hashes SHALL NOT appear in the JSON payloads. (FR-AUD-001)

#### Scenario: Create writes after_json

- **WHEN** an admin key creates a flag
- **THEN** an audit row exists with `action` `flag.create`, `entity_type` `flag`, `before_json` null, `after_json` describing the flag, `actor_key_id` of that key, and the request's `request_id`

### Requirement: Same-transaction write

Every successful admin mutation SHALL insert its audit row in the same Postgres transaction as the change. A rolled-back mutation SHALL leave no audit row. No-op updates SHALL write no audit row. (FR-AUD-002)

#### Scenario: Flag update writes one flag.update row

- **WHEN** an admin key patches a live flag's description
- **THEN** exactly one new `flag.update` row exists for that flag with both before and after JSON

#### Scenario: Archive writes flag.archive

- **WHEN** an admin key archives a live flag
- **THEN** exactly one new `flag.archive` row exists for that flag

#### Scenario: Env put writes env_config.update and rule diffs

- **WHEN** an admin key PUTs a new env config that adds one rule, changes one existing rule, and omits a third
- **THEN** the transaction includes `env_config.update` plus `rule.create`, `rule.update`, and `rule.delete` as applicable

### Requirement: Append-only audit log

Audit rows SHALL never be updated or deleted in application code. The database SHALL reject UPDATE and DELETE against `audit_events`. (FR-AUD-004)

#### Scenario: UPDATE is rejected by the database

- **WHEN** a client issues `UPDATE audit_events SET action = 'x'`
- **THEN** the statement fails and the row is unchanged

#### Scenario: DELETE is rejected by the database

- **WHEN** a client issues `DELETE FROM audit_events`
- **THEN** the statement fails and the row remains
