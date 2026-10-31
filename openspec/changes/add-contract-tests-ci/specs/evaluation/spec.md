# Spec Delta

## ADDED Requirements

### Requirement: Evaluate contract fixtures are a merge gate

Golden JSON fixtures under `contracts/evaluate/` SHALL cover kill switch off, rule match, percentage boundaries at buckets 0 and 99, missing attributes, archived, not_found, and at least one evaluate-batch case with a partial not_found. CI SHALL replay every fixture against the running app and real Postgres. (FR-EVAL-004, FR-EVAL-005, NFR-MAINT-002)

#### Scenario: Required evaluate cases are present

- **WHEN** contract tests load `contracts/evaluate/*.json` excluding `bucket-vectors.json`
- **THEN** fixtures named for kill switch, rule match, bucket 0, bucket 99, missing attribute, archived, not_found, and batch partial not_found are present

#### Scenario: Bucket 0 and 99 subject keys are documented

- **WHEN** a reader inspects the percentage-boundary fixtures and bucket vectors
- **THEN** the committed salt, flag key, and user ids that hash to buckets 0 and 99 are recorded and never silently changed

#### Scenario: Fixture replay matches the expected HTTP body

- **WHEN** the contract runner seeds a fixture into Postgres, boots the app, and sends the fixture request
- **THEN** the HTTP status matches and the JSON body equals the fixture response after omitting only the listed volatile fields (`request_id` and timestamps)

#### Scenario: A changed expected response fails the suite

- **WHEN** a fixture's expected body no longer matches the live response
- **THEN** the contract test for that fixture fails

### Requirement: Evaluate responses conform to OpenAPI

Every evaluate and evaluate-batch fixture response SHALL validate against the committed OpenAPI document for that path, method, and status. (FR-EVAL-005, NFR-MAINT-002)

#### Scenario: Successful evaluate body matches the document

- **WHEN** a 200 evaluate fixture is replayed
- **THEN** the response body is valid against the OpenAPI schema for `POST /v1/evaluate` status 200

#### Scenario: Error evaluate body matches the document

- **WHEN** a 4xx evaluate or evaluate-batch fixture is replayed
- **THEN** the response body is valid against the OpenAPI error envelope for that status

### Requirement: In-process evaluate microbench reports p99

CI SHALL run an in-process evaluate microbench of a single flag with at most 20 rules and SHALL print p99 compared to 10ms. The bench MUST NOT fail the pipeline on shared runners. (NFR-PERF-001)

#### Scenario: Bench runs and prints p99

- **WHEN** CI reaches the bench step after a successful build
- **THEN** the log includes iteration count, mean, and p99 versus the 10ms budget

#### Scenario: Noisy p99 does not fail CI

- **WHEN** the printed p99 is at or above 10ms on a shared runner
- **THEN** the workflow still succeeds and the result remains visible in the log
