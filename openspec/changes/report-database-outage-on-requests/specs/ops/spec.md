# Spec Delta

## ADDED Requirements

### Requirement: Product routes map Postgres connection errors to UNAVAILABLE

Postgres connection errors (`ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`, a terminated connection, or a pool connection timeout) on auth, evaluate, and admin routes SHALL map in the central HTTP error handler to 503 with `error.code` `UNAVAILABLE` and a safe message. The handler SHALL log `warn`. `GET /healthz` and `GET /readyz` SHALL keep their existing contracts. (FR-ERR-001, FR-OPS-001, NFR-REL-001)

#### Scenario: Connection refused is 503 UNAVAILABLE

- **WHEN** a product route fails because the Postgres client raises `ECONNREFUSED`
- **THEN** the response is 503 with `error.code` `UNAVAILABLE` and the error is logged at `warn`

#### Scenario: Host not found is 503 UNAVAILABLE

- **WHEN** a product route fails because the Postgres client raises `ENOTFOUND`
- **THEN** the response is 503 with `error.code` `UNAVAILABLE`

#### Scenario: Connection reset or terminated is 503 UNAVAILABLE

- **WHEN** a product route fails because the Postgres client raises `ECONNRESET` or a terminated-connection error
- **THEN** the response is 503 with `error.code` `UNAVAILABLE`

#### Scenario: Pool timeout is 503 UNAVAILABLE

- **WHEN** a product route fails because the pool times out waiting for a connection
- **THEN** the response is 503 with `error.code` `UNAVAILABLE`

#### Scenario: Unknown errors stay INTERNAL

- **WHEN** a product route throws an error that is not a Postgres connection failure and is not a mapped domain error
- **THEN** the response is 500 `INTERNAL` with a generic message

#### Scenario: Liveness is unchanged

- **WHEN** a client calls `GET /healthz` while Postgres is unreachable
- **THEN** the response is 200 `{ "status": "ok" }`

#### Scenario: Readiness is unchanged

- **WHEN** a client calls `GET /readyz` while Postgres is unreachable
- **THEN** the response is 503 `UNAVAILABLE` as it is today
