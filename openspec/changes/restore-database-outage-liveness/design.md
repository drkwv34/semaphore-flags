# Design

## Context

See `proposal.md` for motivation. `createPool` in `src/store/pool.ts` constructs `new Pool` with
no `error` listener. Node throws on an EventEmitter `error` with zero listeners, so an idle
client reset during a Postgres outage kills the API. `/healthz` in `src/api/app.ts` already
avoids dependency calls and `/readyz` already uses `pingPostgres`; both are unreachable if the
process has exited. Compose `api.command` is `migrate && seed && serve`, so a container restart
while Postgres is down never reaches `listen`. Redis-down degrade and evaluate/error contracts
stay as they are.

## Goals / Non-Goals

**Goals:**

- Survive idle pool `error` events without a process-wide exception handler.
- Keep FR-OPS-001 probe semantics: `/healthz` 200, `/readyz` 503 during outage, 200 after
  recovery on the same process.
- Split Compose bootstrap from persistent `serve` so restarts do not re-run SQL, while first
  start remains ordered and fatal on migrate/seed failure.
- Prove the outage with a real process/Compose smoke, not mocks and not the port-1 `/readyz` test.

**Non-Goals:**

- Changing evaluate JSON, error envelopes, or Redis-down degrade.
- Tolerating crashes as a contract (`restart: unless-stopped` is not recovery).
- Auto-migrate on `serve`. Config and migration failures stay fatal in their own commands.
- Taking down the shared integration Postgres used by other tests.

## Decisions

### 1. Pool `error` listener in `createPool`, not `process.on('uncaughtException')`

- **Choice:** `pool.on('error', …)` inside `createPool`. Log `warn` with a closed set of fields
  (`err_name`, optional `err_code`). Never log `message`, `stack`, connection string, or the
  client object. Rate-limit to one line per 10s (same degraded-dependency rule as Redis). The
  `pg` driver already drops the failed idle client; later `connect`/`query` opens a new one.
- **Why:** The crash is specifically an unhandled EventEmitter `error`. A global exception
  handler would swallow unrelated fatals (config, migrate, bugs).
- **Alternative:** `process.on('uncaughtException')` / `unhandledRejection`. Rejected: out of
  scope and would hide real bugs.

### 2. Default structured writer; optional injected logger for tests

- **Choice:** `createPool` accepts an optional `{ warn(obj, msg) }` logger. Default writes one
  JSON object to stdout (`level: "warn"`). Tests inject a capturing logger and assert the payload
  has no URL/password even when the Error message contains them.
- **Why:** `src/store` must not import Fastify. Serve can pass `app.log` later if we wire it;
  the listener must be attached before `listen` so there is no race.
- **Alternative:** Only Fastify `app.log`. Rejected: `createPool` runs in migrate/seed/cli before
  `buildApp`, and store cannot take a Fastify type.

### 3. One-shot `migrate` and `seed` services; api command is `serve`

- **Choice:** Compose services `migrate` and `seed` with `restart: "no"`. `seed` waits on
  `migrate` `service_completed_successfully`. `api` command is `node dist/cli.js serve` and
  waits on `seed` `service_completed_successfully`. `api` does not wait on `db` healthy, so a
  later `compose up -d --no-deps api` (or restart) can bind while Postgres is down. `demo-client`
  still waits on api healthy. Seed keeps `SEED_KEYS_PATH` and the `.demo-keys` volume; keys come
  from `docker compose logs seed`.
- **Why:** First `compose up` stays migrate → seed → serve, and a failed bootstrap blocks api.
  After success, Docker has an exited-0 seed container; restarting only api does not re-run SQL.
- **Alternative:** Keep `migrate && seed && serve` in api. Rejected: that is the restart loop.
- **Alternative:** Single `bootstrap` service with `migrate && seed`. Acceptable but two services
  make migrate-vs-seed failure obvious in `compose ps`.

### 4. Isolated Compose smoke, not shared integration Postgres

- **Choice:** `scripts/check-database-outage.sh` uses a unique `COMPOSE_PROJECT_NAME`, mapped
  ports, and `trap` cleanup (`compose down -v`). Flow: up and wait until `/readyz` 200 (creates
  idle clients); record api container id and `RestartCount`; stop/kill db; assert same container
  id, `RestartCount` unchanged, `/healthz` 200, `/readyz` 503 within an explicit timeout; start
  db; wait until `/readyz` 200 without restarting api; stop db; `compose up -d --no-deps api`;
  assert `/healthz` 200 and `/readyz` 503. Unit test `src/store/pool.test.ts` covers
  `emit('error')` without throwing. Keep `test/integration/readyz.test.ts` port-1 case.
- **Why:** Stopping the CI service Postgres would flake every other integration file. Mocks
  would not reproduce Node's unhandled `error`.
- **Alternative:** `DROP DATABASE … WITH FORCE` against a throwaway DB in the shared instance.
  Useful extra unit of coverage if cheap, but it is not the Compose restart/bootstrap proof.

### 5. CI adds the smoke job; existing jobs stay required

- **Choice:** New named job in `.github/workflows/ci.yml` that builds/runs the isolated script.
  Verify, image, and demo-client jobs are unchanged (not skipped, not `continue-on-error`).
- **Why:** NFR-MAINT-001. The smoke is the only test that fails when the process dies.

## Risks / Trade-offs

- [Outage smoke takes down a stack] → Unique Compose project name, dedicated ports, guaranteed
  `down -v` in `EXIT`/`INT`/`TERM`. Never target the default `semaphore-flags` project used by
  a developer’s local demo.
- [Declaring ready during outage] → `/readyz` still requires `pingPostgres`. Recovery is a later
  successful ping, not a restart-loop.
- [First-run migrate failure hidden] → api depends on seed `service_completed_successfully`;
  seed depends on migrate the same way. Failed SQL still fails `compose up --wait`.
- [Seed keys move off api logs] → README and bench script comments point at `compose logs seed`.
  File `.demo-keys/demo-keys.json` is unchanged.

## Migration Plan

Local: `docker compose up --build --wait` still bootstraps an empty volume. Operators who wrap
the old concatenated api command should switch to the split services (or run `migrate`, `seed`,
then `serve` themselves). Rollback is reverting the pool listener and the Compose command.

## Open Questions

None. Probe contracts, Redis degrade, and fatal migrate/seed on first start are fixed by the
brief.
