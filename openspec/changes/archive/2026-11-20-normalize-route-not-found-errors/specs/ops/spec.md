# Spec Delta

## ADDED Requirements

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
