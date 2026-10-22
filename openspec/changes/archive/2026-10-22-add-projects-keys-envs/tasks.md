# Tasks

## 1. Persistence and domain primitives

- [x] 1.1 Add `pg` and `@types/pg`, create `migrations/0001_projects_keys_envs.sql` (`projects`, `api_keys`, `environments` as in design.md) and verify `psql`/`pg` can apply the file against an empty Postgres 16 database
- [x] 1.2 Implement `src/store/migrate.ts` (advisory lock, `schema_migrations`, transactional apply) and verify a second run is a no-op
- [x] 1.3 Implement domain `parseEnvKey` (`^[a-z][a-z0-9-]{1,31}$`) and API-key parse/hash helpers in `src/domain` and verify colocated unit tests for valid/invalid env keys and key parse/hash/constant-time compare (FR-PROJ-003, NFR-SEC-001)
- [x] 1.4 Implement pool + Tx helper + project/key/environment repositories (parameterized SQL, `23505` → `ConflictError`) and verify a unit/integration helper can insert and look up a project by slug (NFR-SEC-002)

## 2. CLI create and seed

- [x] 2.1 Implement `src/cli.ts` with `migrate`, `projects create --name --slug`, `seed`, `serve`; add `bin.semaphore`; verify `--help` lists the four commands
- [x] 2.2 Implement project-create use case (project + `dev`/`staging`/`prod` + one admin and one evaluate key, raw keys printed once) and verify `semaphore projects create` against Postgres prints both keys and stores only hashes (FR-PROJ-001, FR-PROJ-002)
- [x] 2.3 Implement idempotent `seed` for slug `demo` and verify a second run exits 0 without printing new raw keys

## 3. Auth, health, and HTTP surface

- [x] 3.1 Add `UnauthorizedError`/`ForbiddenError` usage plus `NotImplementedError` → 501 and `UnavailableError` → 503 in `src/api/errors.ts` and verify `errors.test.ts` mappings
- [x] 3.2 Implement per-route Bearer auth (prefix lookup, constant-time hash, revoked → 401, wrong type → 403; admin-only vs evaluate-only) and verify the 401/403 matrix on `GET /v1/projects/current` and `POST /v1/evaluate` against Postgres (FR-PROJ-002, NFR-SEC-001)
- [x] 3.3 Implement `GET /v1/projects/current` (admin) and `POST /v1/environments` (regex + 409 duplicate) and verify 200/201/400/409 plus `GET /v1/__probe` remains 404 without a key
- [x] 3.4 Implement `GET /readyz` (Postgres only, 503 when unreachable) and `GET /healthz/deps`; verify `/healthz` still 200 with no DB and `/readyz` 503 when the pool cannot connect (FR-OPS-001)

## 4. Compose, CI, and docs

- [x] 4.1 Wire Dockerfile (copy `migrations/`, CLI entry, Node `fetch` healthcheck) and Compose `api` command `migrate && seed && serve`; verify `docker compose up --build --wait` then curl `/v1/projects/current` with the seeded admin key returns 200
- [x] 4.2 Replace the CI integration echo with `pnpm test:integration` against a Postgres 16 service (keep lint, format, typecheck, unit, contract, build, compose-config, image-build); dump container logs on failure; verify the workflow file still lists every previous check name
- [x] 4.3 Update README run-locally (exact compose/curl commands) and the key model (types, prefix + hash, shown once); record the migrator and admin-cannot-evaluate decisions in `docs/architecture/README.md`; verify the documented curl path matches 4.1

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration   # requires DATABASE_URL to Postgres 16
openspec validate add-projects-keys-envs --strict
docker compose up --build --wait
# copy admin key from `docker compose logs api`, then:
curl -sS -H "Authorization: Bearer $ADMIN_KEY" http://localhost:8080/v1/projects/current
```

## Workflow follow-up

- Open a ready PR from `feat/projects-keys-envs`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive add-projects-keys-envs --yes` as a direct commit on `main`.
