# Spec Delta

## MODIFIED Requirements

### Requirement: Current project endpoint

`GET /v1/projects/current` SHALL require an admin key and return the project bound to that key. The project id SHALL come only from the key, never from the request body. When Postgres is unreachable with a connection error, the response SHALL be 503 `UNAVAILABLE`. (FR-PROJ-001, FR-ERR-001, NFR-REL-001)

#### Scenario: Admin key reads its project

- **WHEN** a valid admin key calls `GET /v1/projects/current`
- **THEN** the response is 200 with that key's project `id`, `name`, `slug`, and `created_at`

#### Scenario: Database connection error is 503

- **WHEN** API-key lookup or project load fails with a Postgres connection error
- **THEN** `GET /v1/projects/current` returns 503 `UNAVAILABLE` and not 500 `INTERNAL`
