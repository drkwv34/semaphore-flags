# Spec Delta

## ADDED Requirements

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
