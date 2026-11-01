# client-guidance

## Purpose

Documented client timeouts and fail-open / fail-closed fallback behavior.

SRS: FR-DOC-001, NFR-DOC-001

## Requirements

### Requirement: Client integration section documents timeouts

The README SHALL include a Client integration section that instructs clients to use short HTTP timeouts of 100–200 ms on evaluate calls. (FR-DOC-001)

#### Scenario: Timeouts are documented

- **WHEN** a reader opens the README Client integration section
- **THEN** the section states that evaluate calls use a 100–200 ms timeout

### Requirement: Client fallback on evaluate failure

The README SHALL instruct clients that on timeout, 5xx, or network error they MUST apply the flag's `client_fallback`: `fail_closed` yields false, `fail_open` yields true, and `fail_open` is rare and reserved for non-destructive UX. (FR-DOC-001)

#### Scenario: Fallback mapping is documented

- **WHEN** a reader opens the README Client integration section
- **THEN** the section maps `fail_closed` to false and `fail_open` to true for timeout, 5xx, and network errors

### Requirement: Kill switches fail closed

The README SHALL instruct clients that kill switches MUST use `client_fallback` `fail_closed`. (FR-DOC-001)

#### Scenario: Kill switch fallback is documented

- **WHEN** a reader opens the README Client integration section
- **THEN** the section states that kill switches use `fail_closed`

### Requirement: Brief in-process client cache

The README SHALL instruct clients that they MAY cache evaluate results in-process for at most 10 seconds, with care that stale values do not outlive a kill switch. (FR-DOC-001)

#### Scenario: Client cache bound is documented

- **WHEN** a reader opens the README Client integration section
- **THEN** the section states an in-process cache bound of 10 seconds or less

### Requirement: Never block application boot

The README SHALL instruct clients that they MUST NOT block application boot forever waiting for the flags service. (FR-DOC-001)

#### Scenario: Boot guidance is documented

- **WHEN** a reader opens the README Client integration section
- **THEN** the section states that boot MUST NOT wait indefinitely on the flags service

### Requirement: TypeScript timeout and fallback snippet

The README Client integration section SHALL include a short TypeScript snippet that sets a 100–200 ms timeout and applies `client_fallback` on error. (FR-DOC-001, NFR-DOC-001)

#### Scenario: Snippet shows timeout and fallback

- **WHEN** a reader opens the README Client integration section
- **THEN** a TypeScript example uses `AbortSignal.timeout` (or equivalent) in 100–200 ms and returns a boolean from `client_fallback` on failure

### Requirement: client_fallback is a flag admin field

Docs SHALL state that `client_fallback` is persisted on the flag and returned by admin flag create/get/patch JSON, and SHALL NOT claim that evaluate JSON includes it. (FR-FLAG-001, FR-DOC-001)

#### Scenario: Location of client_fallback is documented

- **WHEN** a reader opens the README Client integration section
- **THEN** the section points at admin flag JSON `client_fallback` and does not list it on `POST /v1/evaluate` responses
