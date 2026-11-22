# Spec Delta

## ADDED Requirements

### Requirement: JSON null scalar rules evaluate as rule_match

When an enabled flag has an `eq` or `neq` targeting rule whose `value` is JSON `null`, evaluation SHALL apply that rule using the existing predicate semantics: a present attribute equal to JSON `null` matches `eq null`; a present non-null attribute matches `neq null`; a missing attribute does not match. A match SHALL return `reason` `rule_match` and `value` equal to the rule's `serve`, and SHALL NOT fall through to percentage. (FR-EVAL-002, FR-RULE-003)

#### Scenario: eq null with a null attribute is rule_match

- **WHEN** an enabled flag has `user.x eq null` serving true, percentage 0, and evaluate is called with `user.attrs.x` JSON `null`
- **THEN** the response is 200 `{ "value": true, "reason": "rule_match" }`

#### Scenario: neq null with a non-null attribute is rule_match

- **WHEN** an enabled flag has `user.x neq null` serving true, percentage 0, and evaluate is called with `user.attrs.x` a non-null JSON primitive
- **THEN** the response is 200 `{ "value": true, "reason": "rule_match" }`

#### Scenario: eq null with a missing attribute is not rule_match

- **WHEN** an enabled flag has `user.x eq null` serving true, percentage 0, and evaluate is called without `user.attrs.x`
- **THEN** the reason is not `rule_match` and evaluation continues to percentage
