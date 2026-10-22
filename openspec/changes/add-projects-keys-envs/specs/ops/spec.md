# Spec Delta

## REMOVED Requirements

### Requirement: Placeholder until first change is archived

**Reason**: Replaced by liveness, Postgres-only readiness, and optional dependency-detail requirements.

**Migration**: Use the ADDED requirements in this change. No runtime callers existed for the placeholder beyond the scaffold `/healthz`.

## ADDED Requirements

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

`GET /healthz/deps` SHALL return HTTP 200 with per-dependency status for Postgres and, when `REDIS_URL` is configured, Redis. Redis status SHALL NOT change `/readyz`. (FR-OPS-001)

#### Scenario: Deps report Postgres

- **WHEN** a client calls `GET /healthz/deps`
- **THEN** the body includes a Postgres status field and, if Redis is configured, a Redis status field
