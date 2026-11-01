# Spec Delta

## ADDED Requirements

### Requirement: Demo seed kill_payments and beta_ui

`semaphore seed` SHALL ensure the demo project has `kill_payments` (default false, `fail_closed`, every env disabled) and `beta_ui` (`fail_closed`, staging enabled at 10% with a `user.id in ["demo_in"]` serve-true rule). Existing `checkout_v2` and `kill_switch` SHALL remain. A second seed SHALL NOT duplicate flags. (FR-FLAG-001, FR-FLAG-002)

#### Scenario: Fresh seed has both demo flags

- **WHEN** `semaphore seed` runs against an empty database after migrate
- **THEN** flags `kill_payments` and `beta_ui` exist alongside `checkout_v2` and `kill_switch`

#### Scenario: kill_payments is disabled in prod

- **WHEN** evaluate is called for `kill_payments` in `prod` after seed
- **THEN** the result is `value` false and `reason` `disabled`

#### Scenario: beta_ui matches demo_in in staging

- **WHEN** evaluate is called for `beta_ui` in `staging` with `user.id` `demo_in` after seed
- **THEN** the result is `value` true and `reason` `rule_match`

#### Scenario: Second seed does not duplicate flags

- **WHEN** `semaphore seed` runs a second time
- **THEN** each of `kill_payments`, `beta_ui`, `checkout_v2`, and `kill_switch` still exists once
