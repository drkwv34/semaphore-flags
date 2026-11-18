# Spec Delta

## MODIFIED Requirements

### Requirement: Liveness

`GET /healthz` SHALL return HTTP 200 while the process is serving, without calling Postgres or Redis. An idle Postgres pool error SHALL NOT terminate the process. (FR-OPS-001)

#### Scenario: Liveness does not touch dependencies

- **WHEN** a client calls `GET /healthz` whether or not Postgres is reachable
- **THEN** the response is 200 `{ "status": "ok" }`

#### Scenario: Liveness survives a Postgres outage

- **WHEN** the process has already been serving and Postgres then becomes unreachable, including when an idle pool connection is terminated
- **THEN** the same process keeps serving `GET /healthz` as HTTP 200 without a restart

### Requirement: Postgres-only readiness

`GET /readyz` SHALL return HTTP 200 when Postgres answers a liveness query, and HTTP 503 otherwise. Redis SHALL NOT affect readiness. After Postgres recovers, the same process SHALL return HTTP 200 without being restarted. (FR-OPS-001)

#### Scenario: Ready when Postgres answers

- **WHEN** Postgres accepts a `SELECT 1` (or equivalent) within the readiness timeout
- **THEN** `GET /readyz` returns 200

#### Scenario: Not ready when Postgres is unreachable

- **WHEN** Postgres does not answer
- **THEN** `GET /readyz` returns 503

#### Scenario: Readiness recovers without restart

- **WHEN** Postgres was unreachable so `GET /readyz` returned 503, and Postgres then accepts queries again
- **THEN** the same process returns HTTP 200 from `GET /readyz` without being restarted

## ADDED Requirements

### Requirement: Idle pool errors are non-fatal

The Postgres pool SHALL listen for idle-client `error` events, keep the process alive, and emit a structured log that MUST NOT include the database URL or credentials. Failed idle connections SHALL be discarded so later queries can reconnect. The process SHALL NOT install a global handler for all exceptions. (FR-OPS-001)

#### Scenario: Idle client error does not exit the process

- **WHEN** the pool emits an idle-client error (for example after Postgres closes an idle connection)
- **THEN** the process continues running and writes a structured log line that does not contain the database URL or password

### Requirement: Compose bootstrap is separate from serve

Compose SHALL run migrate and seed as one-shot bootstrap, in that order, separate from the persistent api `serve` command. A failed migrate or seed SHALL fail that first start. After a successful bootstrap, restarting only the api service while Postgres is down SHALL still bind the port and serve `GET /healthz` 200 and `GET /readyz` 503. (FR-OPS-001)

#### Scenario: First start stays ordered and fatal

- **WHEN** an operator runs a fresh Compose up with an empty database
- **THEN** migrate completes, then seed completes, then api serves, and a failed migrate or seed prevents api from serving

#### Scenario: Api restart with Postgres down still lives

- **WHEN** bootstrap has already succeeded and an operator restarts only the api service while Postgres is absent
- **THEN** the api process starts `serve` without re-running migrate or seed, `GET /healthz` returns 200, and `GET /readyz` returns 503
