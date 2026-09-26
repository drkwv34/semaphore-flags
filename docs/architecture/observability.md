# Observability

## Structured logs

- Fastify's built-in pino logger, JSON to stdout. No `console.*` (ESLint `no-console` outside
  `scripts/`).
- Every request has a `request_id`: taken from `X-Request-Id` if the caller sends one, else a
  UUID. It is echoed in the `X-Request-Id` response header, included in every log line via
  `request.log`, stored on audit rows, and returned in error bodies.
- Always log through `request.log` inside a request so the `request_id` binding is kept. Use
  `app.log` only for boot/shutdown.
- Standard fields (FR-OPS-003): `request_id`, `project_id`, `flag_key`, `reason`,
  `duration_ms`. Use these exact snake_case names; do not invent synonyms.

### Levels

| Level   | Use for                                                                    |
| ------- | -------------------------------------------------------------------------- |
| `error` | 5xx, unexpected exceptions, failed shutdown                                |
| `warn`  | Degraded dependency (Redis down, invalidation failed), config fallbacks    |
| `info`  | Request completed, admin mutation committed, boot/shutdown, 4xx rejections |
| `debug` | Cache hit/miss, per-flag evaluation decisions, snapshot compile timings    |

Production default is `info`. Per-flag evaluate decisions are `debug` to keep the hot path cheap;
aggregate visibility comes from metrics.

### Redaction and PII

- Redacted by config: `authorization` and `x-api-key` request headers.
- Never log raw API keys, key hashes, `user.attrs`, or request/response bodies.
- `user.id` may appear only at `debug`.
- Repeated `warn` lines for the same degraded dependency are rate-limited (at most one per
  10s per dependency).

## Metrics

Prometheus text at `GET /metrics` (FR-OPS-002), via `prom-client` in `src/metrics`.

| Metric                                        | Type      | Labels                          |
| --------------------------------------------- | --------- | ------------------------------- |
| `semaphore_evaluate_total`                    | counter   | `reason`                        |
| `semaphore_evaluate_duration_seconds`         | histogram | `endpoint` (`single`/`batch`)   |
| `semaphore_admin_mutations_total`             | counter   | `action`                        |
| `semaphore_cache_requests_total`              | counter   | `result` (`hit`/`miss`/`error`) |
| `semaphore_cache_invalidation_failures_total` | counter   | —                               |

Rules:

- Prefix `semaphore_`; base units in names (`_seconds`, `_bytes`); counters end in `_total`.
- Label values come from closed enums only. Never label by `flag_key`, `project_id`, `user.id`
  or anything unbounded.
- Duration histogram buckets are tuned for the budget: `0.0005 … 0.1` seconds.
- Default Node process metrics are enabled.

## Health

| Endpoint        | Checks                                 | Status                   |
| --------------- | -------------------------------------- | ------------------------ |
| `/healthz`      | process is up; no dependency calls     | always 200 while serving |
| `/readyz`       | Postgres `SELECT 1` with 500ms timeout | 200 or 503               |
| `/healthz/deps` | Postgres + Redis (if configured)       | 200 with per-dep detail  |

Redis never affects `/readyz` (FR-OPS-001 decision). Health endpoints are excluded from
request-completed logs at `info` to avoid noise from probes.
