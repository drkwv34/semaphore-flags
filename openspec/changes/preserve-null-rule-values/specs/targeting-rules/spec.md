# Spec Delta

## ADDED Requirements

### Requirement: JSON null scalar rule values persist

A targeting rule whose `op` is `eq` or `neq` and whose `value` is the JSON scalar `null` SHALL be stored, returned on `GET /v1/flags/:key`, and included in the compiled environment snapshot with `value` JSON `null`. JSON `null` SHALL NOT be treated as an absent rule or as a missing value. `in` / `not_in` membership of `null` and the rest of the operator matrix SHALL stay unchanged. (FR-RULE-001, FR-RULE-004)

#### Scenario: GET returns eq null

- **WHEN** an admin PUT stores `{ "priority": 0, "attribute": "user.x", "op": "eq", "value": null, "serve": true }`
- **THEN** `GET /v1/flags/:key` includes that rule with `value` JSON `null`

#### Scenario: Compiled snapshot keeps eq null

- **WHEN** the environment snapshot is loaded after storing an `eq` rule with `value` JSON `null`
- **THEN** the compiled flag's rules include that predicate with `value` JSON `null`

#### Scenario: Compiled snapshot keeps neq null

- **WHEN** the environment snapshot is loaded after storing a `neq` rule with `value` JSON `null`
- **THEN** the compiled flag's rules include that predicate with `value` JSON `null`
