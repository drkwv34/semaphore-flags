# Spec Delta

## ADDED Requirements

### Requirement: README platform story

The README SHALL document the live platform: problem, why, demo, stack (TypeScript, not a second Go service), Compose run, tests/CI/contracts, architecture layers, evaluate algorithm and reason enum, append-only audit, Redis cache with invalidate-before-2xx and Redis-down degrade, observability, and fail-open vs fail-closed plus cache TTL trade-offs. Claims MUST match implemented behavior. (NFR-DOC-001)

#### Scenario: Platform sections are present

- **WHEN** a reader opens the README
- **THEN** it contains sections covering problem, stack, architecture, evaluate algorithm, audit, cache, observability, trade-offs, tests/CI, and a working demo walkthrough

### Requirement: Compose demo-client evaluates seeded flags

Compose SHALL include a `demo-client` service that evaluates the seeded demo project for subjects `demo_in`, `demo_out`, and at least one random id against `kill_payments` in `prod` and `beta_ui` in `staging`, printing flag, subject, value, and reason per line. (NFR-PORT-001)

#### Scenario: Seeded kill switch is disabled

- **WHEN** demo-client evaluates `kill_payments` in `prod` after a fresh seed
- **THEN** each printed line for that flag has `reason` `disabled` and `value` false

#### Scenario: Seeded beta rule matches demo_in

- **WHEN** demo-client evaluates `beta_ui` in `staging` for subject `demo_in` after a fresh seed
- **THEN** the printed line has `value` true and `reason` `rule_match`

#### Scenario: Seeded beta percentage is shown

- **WHEN** demo-client evaluates `beta_ui` in `staging` for `demo_out` or a random id after a fresh seed
- **THEN** the printed reason is `percentage_in` or `percentage_out`

### Requirement: Demo-client uses timeout and fallback

The demo-client SHALL use a 100–200 ms timeout per evaluate call and SHALL apply the documented `client_fallback` on timeout, 5xx, or network error. It SHALL read the evaluate URL and key from the environment. (FR-DOC-001, NFR-PORT-001)

#### Scenario: Missing key fails closed for kill switches

- **WHEN** demo-client cannot reach evaluate and the flag is a kill switch
- **THEN** it prints `value` false using `fail_closed` rather than hanging

### Requirement: Pull request template includes client docs

The repository SHALL ship `.github/pull_request_template.md` with a checklist that includes updating Client integration docs when evaluate or fallback behavior changes, plus OpenSpec and tests items. (NFR-DOC-001, NFR-MAINT-001)

#### Scenario: Checklist item is present

- **WHEN** a contributor opens a new pull request
- **THEN** the template includes the Client integration docs checklist item and OpenSpec/tests items

### Requirement: CI checks README client docs and demo-client

CI SHALL keep every existing job and SHALL additionally assert that the README Client integration section contains the five FR-DOC-001 points, typecheck the demo-client, and run a Compose smoke that asserts reason codes appear. Existing jobs MUST NOT be skipped or loosened. (NFR-MAINT-001, NFR-DOC-001, NFR-PORT-001)

#### Scenario: README docs check fails when the section is missing

- **WHEN** the Client integration heading or one of the five FR-DOC-001 points is removed from the README
- **THEN** the CI docs check fails

#### Scenario: Existing verify and image jobs remain

- **WHEN** CI runs on a pull request
- **THEN** the verify job still runs lint, format, typecheck, unit, integration, contract, OpenAPI, and build, and the image job still builds without push
