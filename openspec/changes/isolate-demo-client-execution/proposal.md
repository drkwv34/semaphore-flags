# Proposal

## Why

`docker compose up --build --wait` is the documented local start, but Compose treats the one-shot
`demo-client` (no profile, `restart: "no"`) as a service that should stay running. Its normal
exit 0 makes `--wait` fail, so a clone that follows only the README never reaches a ready API.
CI’s demo job hides this by targeting `api db` and running the client separately. (NFR-PORT-001)

## What Changes

- Put `demo-client` behind an opt-in Compose profile `demo` so the default up starts only
  persistent services plus the existing one-shot migrate/seed bootstrap.
- Document explicit demo execution: `docker compose run --rm demo-client` (and `--profile demo`
  as an alternative). Print the seeded reason codes with and without Redis.
- Add an isolated Compose smoke for the literal README command (default, `--profile cache`, and
  `--profile redis`) plus an explicit demo run. Keep the existing demo-client smoke job.
- Do not treat exit 1 as success, and do not leave a sleeping container to fake a healthcheck.

Out of scope: changing demo-client evaluate logic, admin SPA, weakening CI jobs.

## Capabilities

### New Capabilities

- (none — reuse `ops`)

### Modified Capabilities

- `ops`: default Compose up waits only on persistent services (and completed bootstrap);
  `demo-client` is opt-in; CI keeps the existing demo smoke and adds a README-startup smoke.
  (NFR-PORT-001, NFR-MAINT-001)

## Impact

- **Capabilities:** `ops`.
- **Code paths:** `compose.yaml` (`demo-client` profile); `README.md` Run locally / Demo;
  `.github/workflows/ci.yml`; `docs/pin-ready-checklist.md`; `docs/architecture/integrations.md`
  and testing notes; new `scripts/check-compose-startup.sh`.
- **Tests:** isolated Compose smoke that the README `up --build --wait` exits 0 (with cache and
  redis profiles) and that an explicit demo-client run prints `kill_payments` `disabled` and
  `beta_ui` `rule_match` / percentage. Existing demo job remains required.
- **APIs:** none.
- **Dependencies:** none.
- **CI:** add a named job; do not delete, skip, or loosen verify / image / demo / outage jobs
  (NFR-MAINT-001).
