# migrations

Forward-only SQL migrations (SRS §8.6), applied by `semaphore migrate` (`src/store/migrate.ts`).

- File naming: `NNNN_short_description.sql` (zero-padded, monotonically increasing).
- Never edit a migration once merged to `main`; add a new one.
- No `DOWN` migrations. Roll back by rolling forward.
- Each file runs in its own transaction under a Postgres advisory lock.
- Versions are recorded in `schema_migrations`.
- `audit_events` must be protected against `UPDATE`/`DELETE` at the database level (FR-AUD-004)
  when that table is introduced.
