# ops

## Purpose

Health, readiness, Prometheus metrics, structured logs and the HTTP error model.

SRS: FR-OPS-001..003, FR-ERR-001..003, NFR-OBS-001

## Requirements

### Requirement: Liveness

`GET /healthz` SHALL return HTTP 200 while the process is serving, without calling Postgres or Redis. (FR-OPS-001)

#### Scenario: Liveness does not touch dependencies

- **WHEN** a client calls `GET /healthz` whether or not Postgres is reachable
- **THEN** the response is 200 `{ "status": "ok" }`

### Requirement: Postgres-only readiness

`GET /readyz` SHALL return HTTP 200 when Postgres answers a liveness query, and HTTP 503 otherwise. Redis SHALL NOT affect readiness. (FR-OPS-001)

#### Scenario: Ready when Postgres answers

- **WHEN** Postgres accepts a `SELECT 1` (or equivalent) within the readiness timeout
- **THEN** `GET /readyz` returns 200

#### Scenario: Not ready when Postgres is unreachable

- **WHEN** Postgres does not answer
- **THEN** `GET /readyz` returns 503

### Requirement: Optional dependency detail

`GET /healthz/deps` SHALL return HTTP 200 with per-dependency status for Postgres and Redis. Postgres SHALL be `ok` or `degraded`. Redis SHALL be `ok`, `degraded`, or `disabled` (when `REDIS_URL` is unset). Redis status SHALL NOT change `/readyz`. (FR-OPS-001)

#### Scenario: Deps report Postgres

- **WHEN** a client calls `GET /healthz/deps`
- **THEN** the body includes a Postgres status field and a Redis status field

#### Scenario: Redis disabled when unset

- **WHEN** `REDIS_URL` is unset
- **THEN** `GET /healthz/deps` returns 200 with `redis` `disabled`

#### Scenario: Redis degraded when unreachable

- **WHEN** `REDIS_URL` is set but Redis does not answer
- **THEN** `GET /healthz/deps` returns 200 with `redis` `degraded` and `GET /readyz` remains 200 if Postgres is up

### Requirement: Prometheus metrics

`GET /metrics` SHALL return Prometheus text including `semaphore_evaluate_total{reason}`, `semaphore_evaluate_duration_seconds`, `semaphore_admin_mutations_total`, and cache hit/miss counters. Label values SHALL come from closed enums only. (FR-OPS-002, NFR-OBS-001)

#### Scenario: Evaluate traffic increments counters

- **WHEN** evaluate requests have completed
- **THEN** `GET /metrics` includes `semaphore_evaluate_total` with a `reason` label and `semaphore_evaluate_duration_seconds`

#### Scenario: Admin mutations increment counters

- **WHEN** an admin mutation that changes flags or env config has returned 2xx
- **THEN** `GET /metrics` includes `semaphore_admin_mutations_total`

#### Scenario: Cache hit and miss are counted

- **WHEN** evaluate has served a Redis hit and a Redis miss
- **THEN** `GET /metrics` includes cache hit and miss counters

### Requirement: Structured request logs

Request logs SHALL be JSON and SHALL include `request_id`. When known they SHALL also include `project_id`, `flag_key`, `reason`, and `duration_ms`. The server SHALL honour incoming `x-request-id` or generate one, and SHALL echo it on the response. (FR-OPS-003)

#### Scenario: Incoming request id is echoed

- **WHEN** a client sends `x-request-id` on any HTTP request
- **THEN** the response includes that value in `x-request-id` and a JSON log line contains `request_id`

#### Scenario: Generated request id is echoed

- **WHEN** a client omits `x-request-id`
- **THEN** the server generates an id, echoes it on the response, and includes it in JSON logs

### Requirement: OpenAPI document is served

`GET /openapi.json` SHALL return HTTP 200 with the generated OpenAPI 3 document for the live route schemas. `/docs` MAY serve a Swagger UI that reads that document. (NFR-MAINT-002, FR-OPS-001)

#### Scenario: OpenAPI JSON is public

- **WHEN** a client calls `GET /openapi.json` without an API key
- **THEN** the response is 200 `application/json` and the body is an OpenAPI 3 document whose `info.title` identifies semaphore-flags

#### Scenario: Docs UI is optional and unauthenticated

- **WHEN** `GET /docs` is enabled
- **THEN** the response is 200 HTML and does not require an API key

### Requirement: Committed OpenAPI is linted and drift-checked

The generated OpenAPI document SHALL be committed at `contracts/openapi/openapi.json`. CI SHALL regenerate it and fail if it differs, and SHALL lint it with Spectral (or equivalent). (NFR-MAINT-001, NFR-MAINT-002)

#### Scenario: Drift fails CI

- **WHEN** route schemas change and `contracts/openapi/openapi.json` is not regenerated
- **THEN** the CI OpenAPI drift check fails

#### Scenario: Lint fails on an invalid document

- **WHEN** the committed OpenAPI document violates the project's Spectral ruleset
- **THEN** the CI OpenAPI lint step fails

### Requirement: Health and metrics match OpenAPI

`GET /healthz`, `GET /healthz/deps`, and `GET /metrics` responses SHALL conform to the schemas documented in the OpenAPI document. (FR-OPS-001, FR-OPS-002, NFR-MAINT-002)

#### Scenario: Liveness JSON validates

- **WHEN** a client calls `GET /healthz`
- **THEN** the 200 body validates against the OpenAPI schema for that path

#### Scenario: Deps JSON validates

- **WHEN** a client calls `GET /healthz/deps`
- **THEN** the 200 body validates against the OpenAPI schema for that path

#### Scenario: Metrics is documented as Prometheus text

- **WHEN** a client calls `GET /metrics`
- **THEN** the response is 200 `text/plain` and matches the OpenAPI description for that path

### Requirement: CI pipeline gates merges with contract and image build

CI SHALL run lint, typecheck, unit, integration, contract, build, and a container image build with no push, in that logical order. Existing jobs MUST remain and MUST NOT be skipped or loosened. The contract job or step SHALL be named and required. (NFR-MAINT-001, FR-EVAL-005)

#### Scenario: Contract step is a required named check

- **WHEN** a pull request runs CI
- **THEN** a named contract job or step runs after integration and a failure of that step fails the workflow

#### Scenario: Image builds without pushing

- **WHEN** CI reaches the image job
- **THEN** the Dockerfile is built and the image is not pushed to a registry

#### Scenario: Format check remains

- **WHEN** CI runs the verify job
- **THEN** format check still runs and still fails the job on prettier drift

### Requirement: HTTP evaluate bench is documented for Compose

`scripts/bench-evaluate.sh` SHALL document how to measure HTTP evaluate p99 against a local Compose stack with a warm cache, targeting under 50ms. (NFR-PERF-002)

#### Scenario: Script documents the HTTP budget

- **WHEN** an operator reads or runs `scripts/bench-evaluate.sh`
- **THEN** the script states the warm-cache HTTP p99 target of 50ms and prints measured p99
