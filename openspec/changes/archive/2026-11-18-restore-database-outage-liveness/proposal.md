# Proposal

## Why

`GET /healthz` is specified as process liveness independent of Postgres (FR-OPS-001), but an idle
`pg` pool connection terminated during a database outage emits `error` with no listener, which
Node treats as fatal. The process dies, so neither `/healthz` nor `/readyz` can answer. Compose
also chains `migrate && seed && serve` in the persistent api command, so an api restart while
Postgres is down cannot bind the port at all.

## What Changes

- Handle `pg.Pool` `error` events explicitly: keep the process alive, discard the failed idle
  client (driver default), and emit a structured log that never includes the database URL or
  credentials. Do not install a process-wide exception handler.
- Keep `/healthz` 200 with no dependency calls. `/readyz` stays Postgres-only: 503 while Postgres
  is down, 200 after recovery on the same process, without a restart. Redis-down degrade and
  evaluate/error contracts are unchanged.
- Split Compose bootstrap from the persistent serve command. First `compose up` still runs
  migrate then seed then serve, in order, and a failed migrate or seed remains fatal for that
  first start. After a successful bootstrap, restarting only the api service with Postgres absent
  runs `serve` and answers `/healthz` 200 / `/readyz` 503.
- Add a unit regression for an unhandled pool `error` and an isolated real-process Compose smoke
  that stops Postgres with idle connections, asserts the same container and restart count, then
  recovers readiness without restarting the api. Do not replace that smoke with mocks or the
  existing unreachable-port `/readyz` test.

## Capabilities

### New Capabilities

- (none — reuse `ops`)

### Modified Capabilities

- `ops`: the process SHALL survive a Postgres outage (idle pool `error` is handled; `/healthz`
  remains 200). `/readyz` SHALL return 503 during the outage and 200 after Postgres recovers
  without restarting the process. Compose SHALL run migrate/seed as one-shot bootstrap separate
  from the persistent `serve` command so an api restart with Postgres down still serves probes.
  Redis SHALL still never gate readiness. (FR-OPS-001)

## Impact

- **Capabilities:** `ops`.
- **Code paths:** `src/store/pool.ts` (pool `error` listener, safe structured log);
  `src/store/pool.test.ts`; `src/server.ts` / `src/cli.ts` only if the listener must be wired at
  serve start; `compose.yaml` (one-shot migrate/seed, api command is `serve`);
  `scripts/check-database-outage.sh` (isolated Compose/process smoke); `test/integration/readyz.test.ts`
  (keep the unreachable-port case; do not treat it as the outage smoke); `.github/workflows/ci.yml`
  (add the outage smoke without deleting, skipping, or loosening existing jobs);
  `README.md` and `docs/architecture/` for Compose bootstrap vs serve; `openspec/specs/ops/spec.md`.
- **APIs:** `/healthz` and `/readyz` JSON and status codes are unchanged. Evaluate, error envelope,
  and Redis-down degrade are unchanged.
- **Dependencies:** none.
- **CI:** keep verify, image, and demo-client jobs. Add an isolated Compose outage smoke. Do not
  delete, skip, or loosen any existing job or check (NFR-MAINT-001).
- **Docs:** README Compose run section (bootstrap services vs `serve`); architecture decision log
  if a new row is warranted.
