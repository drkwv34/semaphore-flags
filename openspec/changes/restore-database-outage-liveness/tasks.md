# Tasks

## 1. Pool idle-error handling

- [x] 1.1 Add a colocated unit test that a freshly created pool `emit('error', Error(...))` containing a URL and password neither throws nor exits, and that the structured log omits URL and credentials; verify it fails on current `createPool` then passes after 1.2 (FR-OPS-001)
- [x] 1.2 Attach a `pool.on('error')` listener in `createPool` that rate-limits a `warn` log with `err_name` / optional `err_code` only (no message, stack, URL, or client); do not add `process.on('uncaughtException')`; verify `pnpm test:unit` covers the new test (FR-OPS-001)

## 2. Compose bootstrap vs serve

- [x] 2.1 Split `compose.yaml` so `migrate` and `seed` are one-shot (`restart: "no"`, ordered `service_completed_successfully`) and `api` command is `node dist/cli.js serve`; verify `docker compose config` still succeeds for default, `--profile cache`, and `--profile redis` (FR-OPS-001)
- [x] 2.2 Update README (and bench script comments that still say keys come from api logs) so first-run bootstrap stays migrate then seed then serve, keys are read from seed logs / `.demo-keys`, and an api restart with Postgres down is documented as `/healthz` 200 `/readyz` 503; verify `pnpm exec tsx scripts/check-readme-docs.ts` still passes (FR-OPS-001, NFR-DOC-001)
- [x] 2.3 Add `scripts/check-database-outage.sh` as an isolated Compose/process smoke (unique project name, trap cleanup): warm `/readyz` 200, stop db with idle connections, same container id, `RestartCount` unchanged, `/healthz` 200 `/readyz` 503, restore db until `/readyz` 200 without restarting api, then restart only api with db down and assert `/healthz` 200; verify the script fails on current main behavior and passes after 1.2+2.1, and that it is not a mock or the port-1 `/readyz` test (FR-OPS-001)

## 3. CI, existing probes, docs

- [x] 3.1 Add a named CI job that runs `scripts/check-database-outage.sh` without deleting, skipping, or loosening verify / image / demo-client jobs or the existing unreachable-port `/readyz` test; keep Redis-down evaluate 200 coverage; verify `.github/workflows/ci.yml` still contains those jobs and `pnpm test:integration` still includes the Redis-down case (FR-OPS-001, FR-CACHE-004, NFR-MAINT-001)
- [x] 3.2 Record the pool-error and Compose-bootstrap decisions in `docs/architecture/README.md` (and observability/testing notes if they still imply a crash is acceptable); verify the decision log has a new row and `docs/architecture/testing-strategy.md` names the outage smoke (NFR-MAINT-001)

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration   # requires DATABASE_URL and REDIS_URL; Redis-down case must still pass
openspec validate restore-database-outage-liveness --strict
docker compose config --quiet
docker compose --profile cache config --quiet
docker compose --profile redis config --quiet
./scripts/check-database-outage.sh
```

## Workflow follow-up

- Open a ready PR from `fix/database-outage-liveness`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive restore-database-outage-liveness --yes` as a direct commit on `main`.
