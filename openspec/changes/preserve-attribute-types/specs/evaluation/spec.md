# Spec Delta

## ADDED Requirements

### Requirement: Evaluate user attributes keep JSON types

`user.attrs` values on `POST /v1/evaluate` and `POST /v1/evaluate-batch` SHALL reach rule matching with the same JSON type the client sent (string, number, boolean, or null). Query and path parameters MAY still coerce types. OpenAPI SHALL continue to accept those four attr types. (FR-EVAL-001, FR-EVAL-002, FR-EVAL-003, FR-RULE-003)

#### Scenario: Numeric gte matches a JSON number

- **WHEN** an enabled flag has a rule `user.age gte 18` serving true and a valid evaluate key posts `user.attrs.age` as JSON number `18`
- **THEN** the response is 200 `{ "value": true, "reason": "rule_match" }`

#### Scenario: Numeric eq prefers number over string

- **WHEN** an enabled flag has rules `user.age eq 18` serving true at a lower priority than `user.age eq "18"` serving false, and the client sends `age` as JSON number `18`
- **THEN** the response is 200 `{ "value": true, "reason": "rule_match" }`

#### Scenario: Boolean eq prefers boolean over string

- **WHEN** an enabled flag has rules `user.beta eq true` serving true at a lower priority than `user.beta eq "true"` serving false, and the client sends `beta` as JSON boolean `true`
- **THEN** the response is 200 `{ "value": true, "reason": "rule_match" }`

#### Scenario: Numeric gt, lt, and in keep number types

- **WHEN** an enabled flag has numeric `gt`, `lt`, or `in` rules and the client sends matching JSON number attributes
- **THEN** each matching rule evaluates as `rule_match` with the rule's `serve` value

#### Scenario: Batch evaluate keeps the same attr types

- **WHEN** a valid evaluate key posts `POST /v1/evaluate-batch` with the same numeric or boolean `user.attrs` as a matching single evaluate
- **THEN** each requested key's entry equals the single-evaluate result, including `rule_match` on typed predicates

#### Scenario: OpenAPI still lists primitive attr types

- **WHEN** a client reads the OpenAPI schema for evaluate or evaluate-batch `user.attrs` additional properties
- **THEN** the document still accepts string, number, boolean, and null
