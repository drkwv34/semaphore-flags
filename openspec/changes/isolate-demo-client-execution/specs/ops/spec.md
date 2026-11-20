# Spec Delta

## MODIFIED Requirements

### Requirement: Compose demo-client evaluates seeded flags

Compose SHALL include a `demo-client` service behind an opt-in profile `demo` that evaluates the seeded demo project for subjects `demo_in`, `demo_out`, and at least one random id against `kill_payments` in `prod` and `beta_ui` in `staging`, printing flag, subject, value, and reason per line. Default Compose up (no profile) SHALL NOT start `demo-client`. Operators SHALL run the client explicitly (`docker compose run --rm demo-client` or `--profile demo`). (NFR-PORT-001)

#### Scenario: Seeded kill switch is disabled

- **WHEN** demo-client evaluates `kill_payments` in `prod` after a fresh seed
- **THEN** each printed line for that flag has `reason` `disabled` and `value` false

#### Scenario: Seeded beta rule matches demo_in

- **WHEN** demo-client evaluates `beta_ui` in `staging` for subject `demo_in` after a fresh seed
- **THEN** the printed line has `value` true and `reason` `rule_match`

#### Scenario: Seeded beta percentage is shown

- **WHEN** demo-client evaluates `beta_ui` in `staging` for `demo_out` or a random id after a fresh seed
- **THEN** the printed reason is `percentage_in` or `percentage_out`

#### Scenario: Default Compose up does not run demo-client

- **WHEN** an operator runs `docker compose up --build --wait` with no service targets and no profile
- **THEN** migrate and seed complete, api becomes healthy, `demo-client` is not started, and the command exits 0

## ADDED Requirements

### Requirement: README Compose startup waits on persistent services

The README local-run command `docker compose up --build --wait` SHALL exit 0 after bootstrap and api health, including when Redis is enabled with `--profile cache` or `--profile redis`. A failed migrate or seed SHALL still fail that first start. (NFR-PORT-001, FR-OPS-001)

#### Scenario: Default up exits 0

- **WHEN** an operator follows the README (`cp .env.example .env`, `mkdir -p .demo-keys`, `docker compose up --build --wait`) against an empty volume
- **THEN** the command exits 0 and `GET /healthz` on the published API port returns 200

#### Scenario: Cache profile up exits 0

- **WHEN** an operator runs `API_REDIS_URL=redis://redis:6379 docker compose --profile cache up --build --wait`
- **THEN** the command exits 0 and Redis is running as part of that project

#### Scenario: Redis profile alias up exits 0

- **WHEN** an operator runs `API_REDIS_URL=redis://redis:6379 docker compose --profile redis up --build --wait`
- **THEN** the command exits 0 the same way as `--profile cache`

### Requirement: CI checks README Compose startup and demo-client

CI SHALL keep every existing job and SHALL additionally run an isolated Compose smoke of the README `docker compose up --build --wait` command (default, cache, and redis profiles) plus an explicit demo-client run that asserts reason codes. Existing jobs MUST NOT be skipped or loosened. (NFR-MAINT-001, NFR-PORT-001)

#### Scenario: README startup smoke is required

- **WHEN** a pull request runs CI
- **THEN** a named job runs `scripts/check-compose-startup.sh` (or equivalent) and a failure of that job fails the workflow

#### Scenario: Existing demo smoke remains

- **WHEN** CI runs on a pull request
- **THEN** the existing demo-client compose smoke job still starts `api`/`db` and runs `docker compose run --rm --no-deps demo-client` with reason-code assertions
