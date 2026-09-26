/**
 * Optional Redis cache for compiled per-environment flag snapshots (SRS FR-CACHE-*).
 * Redis is never a hard dependency: every failure degrades to Postgres with a warning log.
 *
 * Scaffold only: no client, keys or singleflight yet.
 */
export {};
