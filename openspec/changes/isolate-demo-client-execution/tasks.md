# Tasks

## 1. Compose profile

- [ ] 1.1 Add `profiles: ["demo"]` to `demo-client` in `compose.yaml` and update the file header comments so default up is persistent services plus bootstrap; verify `docker compose config` default services omit `demo-client` and `--profile demo` / `cache` / `redis` still succeed (NFR-PORT-001)
- [ ] 1.2 Add `scripts/check-compose-startup.sh` (unique project name, trap `down -v`): default `docker compose up --build --wait` exits 0, same with `API_REDIS_URL=redis://redis:6379` and `--profile cache` and `--profile redis`, then `docker compose run --rm demo-client` prints `kill_payments` `disabled` and `beta_ui` `rule_match` / percentage; verify it is not a mock and does not treat exit 1 as success (NFR-PORT-001)

## 2. Docs and CI

- [ ] 2.1 Update README Run locally / Demo, `docs/pin-ready-checklist.md`, and architecture integration/testing notes so default up is `--wait` without demo-client and demo is `docker compose run --rm demo-client`; verify `pnpm exec tsx scripts/check-readme-docs.ts` still passes (NFR-DOC-001, NFR-PORT-001)
- [ ] 2.2 Add a named CI job that runs `scripts/check-compose-startup.sh` and extend the image job with `--profile demo` config; do not delete, skip, or loosen verify / image / demo-client / database-outage jobs; verify `.github/workflows/ci.yml` still contains those jobs (NFR-MAINT-001)

## Verification

```sh
docker compose config --quiet
docker compose --profile demo config --quiet
docker compose --profile cache config --quiet
docker compose --profile redis config --quiet
./scripts/check-compose-startup.sh
openspec validate isolate-demo-client-execution --strict
```
