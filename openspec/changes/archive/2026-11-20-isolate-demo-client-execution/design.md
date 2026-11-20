# Design

## Context

See `proposal.md` for motivation. `compose.yaml` already splits migrate/seed (one-shot,
`restart: "no"`) from persistent `api`/`db`. `demo-client` is also one-shot with `restart: "no"`
but has no profile, so default `docker compose up --wait` includes it. Compose `--wait` requires
included services to be running or healthy; an exited-0 client is neither, so the README command
exits 1. Redis already uses profiles `cache` and `redis`. CI demo job uses
`docker compose up --build -d --wait api db` then `docker compose run --rm --no-deps demo-client`.

## Goals / Non-Goals

**Goals:**

- README `docker compose up --build --wait` exits 0 (default, `--profile cache`, `--profile redis`).
- Demo remains copy-pasteable and prints seeded reason codes when run explicitly.
- CI gains a README-startup smoke without removing the existing demo job.

**Non-Goals:**

- Accepting exit 1 as success, or a sleep-loop healthcheck on demo-client.
- Changing evaluate, seed data, or demo-client timeout/fallback logic.
- Making Redis required.

## Decisions

### 1. Profile `demo` on `demo-client` only

- **Choice:** `profiles: ["demo"]` on `demo-client`. Default project services stay migrate, seed,
  api, db. Redis stays `cache`/`redis`. `docker compose run --rm demo-client` still runs the
  named service even when the profile is off (Compose starts an explicitly named service).
- **Why:** Same pattern as Redis. Default `--wait` only sees persistent services plus bootstrap
  completions that api already depends on.
- **Alternative:** `restart: unless-stopped` plus a dummy healthcheck. Rejected: hides completion
  and keeps a dead client as a daemon.
- **Alternative:** `profiles: ["demo"]` and require `--profile demo` for `compose run`. Rejected:
  extra flag for the documented one-shot; Compose already runs a named service.

### 2. Isolated README smoke script, keep existing demo job

- **Choice:** `scripts/check-compose-startup.sh` uses a unique `COMPOSE_PROJECT_NAME`, mapped
  ports, and `trap` `down -v`. Assert `docker compose config` default services omit `demo-client`
  and `--profile demo` includes it. Then `up --build --wait` (no targets) exits 0; repeat with
  `API_REDIS_URL=redis://redis:6379` and `--profile cache` / `--profile redis`. Then
  `docker compose run --rm demo-client` and grep `kill_payments` `disabled` and `beta_ui`
  `rule_match` / percentage. New CI job runs the script. Existing demo job stays as-is.
- **Why:** NFR-MAINT-001; the current demo job never exercised the README command.
- **Alternative:** Change the existing demo job to `up --wait` with no targets. Rejected: brief
  says keep the current smoke and add another.

### 3. Docs follow the README command

- **Choice:** Run locally stays `docker compose up --build --wait`. Demo section uses
  `docker compose run --rm demo-client` (not `logs demo-client` after default up). Mention Redis
  via `--profile cache` / `--profile redis`. Pin-ready checklist and architecture notes match.
- **Why:** Copy-paste README must be true.

## Risks / Trade-offs

- [Operators who relied on demo-client starting with default up] → Document the explicit run.
  Default up becoming healthy is the intended contract.
- [Compose `run` without profile] → Verified Compose starts a named service; CI keeps
  `--no-deps` in the existing job and the new script uses `run --rm` after api is healthy.
- [Startup smoke duration] → Isolated project, same image as other Compose jobs, tear down `-v`.

## Migration Plan

Pull and use the updated README. No data migration. Rollback is removing the profile (which
restores the `--wait` failure).

## Open Questions

None.
