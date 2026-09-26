/**
 * Postgres repositories. Parameterized SQL only (NFR-SEC-002). Owns transaction boundaries via
 * a unit-of-work helper; audit_events is INSERT-only from application code (FR-AUD-004).
 *
 * Scaffold only: no connection pool or repositories yet.
 */
export {};
