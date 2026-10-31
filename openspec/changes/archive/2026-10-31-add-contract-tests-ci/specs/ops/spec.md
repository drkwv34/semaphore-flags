# Spec Delta

## ADDED Requirements

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
