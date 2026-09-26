# migrations

Forward-only SQL migrations (SRS §8.6). Tooling is chosen in the projects/keys/environments
OpenSpec change; until then this directory is intentionally empty.

- File naming: `NNNN_short_description.sql` (zero-padded, monotonically increasing).
- Never edit a migration once merged to `main`; add a new one.
- No `DOWN` migrations. Roll back by rolling forward.
- `audit_events` must be protected against `UPDATE`/`DELETE` at the database level (FR-AUD-004).
