# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
