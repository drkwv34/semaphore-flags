# ops

## Purpose

Health, readiness, Prometheus metrics, structured logs and the HTTP error model.

SRS: FR-OPS-001..003, FR-ERR-001..003, NFR-OBS-001

## Requirements

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

`scripts/bench-evaluate.sh` SHALL measure HTTP evaluate p99 against a local Compose stack with a warm cache, targeting under 50ms, using only POSIX `sort` and POSIX `awk` (including mawk). It SHALL print measured mean and p99 in milliseconds. Non-200 evaluate responses MUST NOT be counted as successful samples. Missing `EVALUATE_KEY` SHALL exit non-zero. The script MAY warn when p99 is at or above 50ms and MUST NOT require gawk. (NFR-PERF-002)

#### Scenario: Script documents the HTTP budget

- **WHEN** an operator reads or runs `scripts/bench-evaluate.sh`
- **THEN** the script states the warm-cache HTTP p99 target of 50ms and prints measured p99

#### Scenario: mawk computes mean and p99

- **WHEN** `awk` on PATH is mawk and the script is given a successful curl fixture of known times
- **THEN** the process exits 0 and printed mean and p99 match a POSIX numeric sort of those samples using `idx = int(n * 0.99)` clamped to `1..n`

#### Scenario: Failed HTTP is not a successful sample

- **WHEN** an evaluate call returns a non-200 status
- **THEN** the script exits non-zero and does not report that timing as a successful mean/p99 sample

### Requirement: README platform story

The README SHALL document the live platform: problem, why, demo, stack (TypeScript, not a second Go service), Compose run, tests/CI/contracts, architecture layers, evaluate algorithm and reason enum, append-only audit, Redis cache with invalidate-before-2xx and Redis-down degrade, observability, and fail-open vs fail-closed plus cache TTL trade-offs. Claims MUST match implemented behavior. (NFR-DOC-001)

#### Scenario: Platform sections are present

- **WHEN** a reader opens the README
- **THEN** it contains sections covering problem, stack, architecture, evaluate algorithm, audit, cache, observability, trade-offs, tests/CI, and a working demo walkthrough

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

### Requirement: Unknown routes use the error envelope

An HTTP request that matches no registered route SHALL return HTTP 404 with the common error envelope and code `NOT_FOUND`, a safe message, and `request_id` echoed on `x-request-id`. Fastify’s default `{ message, error, statusCode }` body MUST NOT be returned. (FR-ERR-001, FR-OPS-003)

#### Scenario: Unregistered path is NOT_FOUND

- **WHEN** a client calls `GET /`, `GET /admin`, `GET /v1/environments`, or `GET /v1/no-such-route`
- **THEN** the response is 404 with `error.code` `NOT_FOUND`, a safe `error.message`, and `error.request_id` equal to the `x-request-id` response header

#### Scenario: Incoming request id is echoed on 404

- **WHEN** a client sends `x-request-id` on a request to an unregistered path
- **THEN** the 404 body `error.request_id` and the `x-request-id` header both equal that value

#### Scenario: Docs remain available

- **WHEN** a client calls `GET /docs` without an API key
- **THEN** the response is 200 HTML

#### Scenario: Validation is still 400

- **WHEN** a registered route receives a body that fails JSON schema validation
- **THEN** the response is 400 `VALIDATION_FAILED` and not 404

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
