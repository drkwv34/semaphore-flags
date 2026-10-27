# targeting-rules

## Purpose

Ordered attribute predicates; first match wins; missing attributes never match and never throw.

SRS: FR-RULE-001..004

## Requirements

### Requirement: Rule shape on write

Each targeting rule SHALL have a non-empty `attribute` string, `op` in `eq,neq,in,not_in,contains,gt,gte,lt,lte`, a `value` matching that op, and boolean `serve`. (FR-RULE-001, FR-RULE-004)

#### Scenario: Valid eq rule is accepted

- **WHEN** a PUT includes `{ "priority": 0, "attribute": "user.plan", "op": "eq", "value": "pro", "serve": true }`
- **THEN** the rule is stored and returned unchanged in meaning

#### Scenario: Empty attribute is 400

- **WHEN** a PUT includes a rule whose `attribute` is empty or whitespace
- **THEN** the response is 400 `VALIDATION_FAILED` with a field error on that rule's attribute

#### Scenario: Unknown op is 400

- **WHEN** a PUT includes a rule whose `op` is not one of the nine allowed operators
- **THEN** the response is 400 `VALIDATION_FAILED` with a field error on that rule's op

### Requirement: Operator value types

`in` and `not_in` SHALL require a non-empty array of JSON primitives. `gt`, `gte`, `lt`, and `lte` SHALL require a JSON number. `eq`, `neq`, and `contains` SHALL require a JSON primitive (string, number, boolean, or null). (FR-RULE-004)

#### Scenario: in requires a non-empty primitive array

- **WHEN** a PUT includes `op` `in` with `value` `[]` or with a nested object
- **THEN** the response is 400 `VALIDATION_FAILED` with a field error on that rule's value

#### Scenario: numeric ops require a number

- **WHEN** a PUT includes `op` `gt` with `value` `"5"`
- **THEN** the response is 400 `VALIDATION_FAILED` with a field error on that rule's value

#### Scenario: eq rejects objects and arrays

- **WHEN** a PUT includes `op` `eq` with `value` `{ "x": 1 }` or `[1]`
- **THEN** the response is 400 `VALIDATION_FAILED` with a field error on that rule's value

### Requirement: Unique priorities per env

Rule priorities SHALL be unique within a flag's environment config. Stored and returned rules SHALL be ordered by priority ascending. (FR-RULE-002)

#### Scenario: Duplicate priorities are 400

- **WHEN** a PUT includes two rules that share the same priority
- **THEN** the response is 400 `VALIDATION_FAILED` with field-level errors

#### Scenario: Rules are stored sorted

- **WHEN** a PUT includes priorities 5 then 1
- **THEN** GET and the PUT response list priority 1 before priority 5

### Requirement: Atomic rule replace

Replacing an env config SHALL apply the new `rules[]` in the same transaction as `enabled` and `percentage`. A validation failure SHALL leave the previous rules unchanged. (FR-RULE-002)

#### Scenario: Invalid replace does not keep a partial write

- **WHEN** an env already has one valid rule and a PUT sends one valid rule plus one invalid rule
- **THEN** the response is 400 and GET still returns the previous rule set

### Requirement: Predicate evaluation never throws

Evaluating a stored rule against a user SHALL return a boolean. A missing attribute, a wrong JSON type for a numeric or contains comparison, or a null that the operator cannot use SHALL be a non-match (`false`). Predicates SHALL never throw. (FR-RULE-003)

#### Scenario: Missing attribute does not match

- **WHEN** a rule addresses `user.plan` and `user.attrs` has no `plan`
- **THEN** the predicate is false and evaluation continues to the next rule

#### Scenario: eq matches a present attribute

- **WHEN** a rule is `user.plan eq "pro"` and `user.attrs.plan` is `"pro"`
- **THEN** the predicate is true

#### Scenario: numeric op with a string attribute is false

- **WHEN** a rule is `user.age gt 18` and `user.attrs.age` is `"21"`
- **THEN** the predicate is false

#### Scenario: user.id attribute reads the id field

- **WHEN** a rule is `user.id eq "u-1"` and the evaluate `user.id` is `"u-1"`
- **THEN** the predicate is true

#### Scenario: not_in with a missing attribute is false

- **WHEN** a rule is `user.country not_in ["US"]` and `country` is absent
- **THEN** the predicate is false
