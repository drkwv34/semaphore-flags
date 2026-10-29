# Tasks

## 1. Cache adapter

- [ ] 1.1 Add `ioredis` and implement `src/cache` (`cacheKey`, JSON `schema_version` 1 snapshot, no-op when `REDIS_URL` unset, fail-fast client, 3-failure/5s circuit, rate-limited warn) behind `SnapshotSource`; verify colocated unit tests for serialize version-mismatch miss, no-op passthrough, and circuit skip (FR-CACHE-001, FR-CACHE-004)
- [ ] 1.2 Add in-process singleflight on cache miss so concurrent `get` for one key loads Postgres once; verify a unit test that N parallel gets call the inner source once (FR-CACHE-003)
- [ ] 1.3 Wire `CachedSnapshotSource` in `buildApp`/`startServer` for both evaluate routes; verify existing evaluate contract fixtures still pass with the no-op cache (FR-CACHE-001, FR-EVAL-003)

## 2. Invalidation

- [ ] 2.1 After commit and before 2xx, delete `flags:{project_id}:{env}` for `putEnvConfig` and all project envs for create/patch/archive; swallow Redis errors after warn + invalidation-failure metric; skip no-op mutations; verify unit/service tests that the invalidator is invoked with the right keys and not invoked on no-op (FR-CACHE-002)
- [ ] 2.2 Cover every existing flag/rule/env-config mutation route (create, patch, archive, PUT env) so a cached evaluate then mutation then evaluate (single and batch) sees the new value with Redis on; verify Postgres+Redis integration with isolated schema/project (FR-CACHE-002)

## 3. Ops surfaces

- [ ] 3.1 Change `GET /healthz/deps` to `{ postgres: ok|degraded, redis: ok|degraded|disabled }`, keep `/readyz` Postgres-only, and add JSON schemas; verify unit + integration: unset → disabled, bad Redis URL → degraded with readyz 200, real Redis → ok (FR-OPS-001)
- [ ] 3.2 Add `prom-client` in `src/metrics` and `GET /metrics` with `semaphore_evaluate_total{reason}`, `semaphore_evaluate_duration_seconds`, `semaphore_admin_mutations_total`, cache hit/miss (and error) counters; verify after evaluate and admin traffic the text contains those names (FR-OPS-002)
- [ ] 3.3 Structured JSON logs with `request_id`, `project_id`, optional `flag_key`/`reason`, `duration_ms`; honour and echo `x-request-id`; exclude health/metrics from info request logs; verify a log line contains `request_id` (FR-OPS-003)

## 4. CI, Compose, docs

- [ ] 4.1 Add Redis 7 to the CI integration job (`REDIS_URL`) without deleting or loosening jobs; add Compose profile alias `redis` and optional api→redis depends_on; verify `docker compose --profile cache config` and `--profile redis config` succeed (FR-CACHE-001, NFR-MAINT-001)
- [ ] 4.2 Integration: cache hit after first evaluate; Redis-down (bad URL) evaluate 200 and deps redis degraded; schema isolation; document brief README Compose smoke (evaluate, mutate, evaluate, `curl /metrics | grep semaphore_`, stop redis, evaluate 200); verify `pnpm test:integration` and contract ops fixture for `/healthz/deps` (FR-CACHE-001..004, FR-OPS-001..002)
- [ ] 4.3 Record any new architecture decision row if needed; verify `docs/architecture/README.md` still matches the cache decorator flow (NFR-MAINT-001)

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration   # requires DATABASE_URL and REDIS_URL
openspec validate add-cache-metrics --strict
API_REDIS_URL=redis://redis:6379 docker compose --profile redis up --build --wait
# copy keys from `docker compose logs api`, then evaluate, mutate, evaluate, metrics, stop redis, evaluate
```

## Workflow follow-up

- Open a ready PR from `feat/cache-metrics`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive add-cache-metrics --yes` as a direct commit on `main`.
