# semaphore-flags

[![CI](https://github.com/drkwv34/semaphore-flags/actions/workflows/ci.yml/badge.svg)](https://github.com/drkwv34/semaphore-flags/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Feature flags and kill switches with targeting rules, percentage rollouts, audit logs, and a fast
HTTP evaluate API.

> **Status: evaluate, audit list, cache, metrics, and the Compose demo-client are live.**
> Projects, API keys, environments, flag/rule admin, append-only audit, `POST /v1/evaluate`,
> `POST /v1/evaluate-batch`, `GET /v1/audit`, optional Redis snapshot cache, `/metrics`, and
> `/healthz/deps` are implemented.

## Problem

Shipping behind flags is easy until a kill switch silently fails open, a rollout reshuffles users
on restart, or nobody can say who flipped a flag in prod. semaphore-flags is a deliberately
narrow flag service that focuses on the parts that matter: evaluation correctness, an immutable
audit trail, cache invalidation you can trust, and documented client behavior when the service is
down.

## Why

The HTTP evaluate API **is** the SDK. Clients are expected to call `POST /v1/evaluate` with a
short timeout and a per-flag fallback, not to embed a native library. The service exists so that
kill switches, percentage buckets, and audit rows have one implementation instead of a copy in
every app.

## Stack

TypeScript (strict, ESM, Node 22) · Fastify 5 · Zod · Postgres 16 · Redis 7 (optional cache) ·
Vitest · OpenAPI · Docker Compose · GitHub Actions · pnpm.

TypeScript rather than a second Go service keeps this pin in one language: the evaluate path is
simple enough for the budgets (in-process p99 < 10ms, HTTP p99 < 50ms) while Fastify's
schema-driven serialization gives OpenAPI and response contracts for free. Go stays on the other
portfolio pin.

## Architecture

```
src/api        HTTP edge: routes, auth, JSON schemas, error mapper
src/services   use cases: transaction + audit insert + cache invalidation
src/domain     pure code: evaluate/ (algorithm, hash bucket), rules/ (predicates), errors
src/store      Postgres repositories (parameterized SQL, no ORM)
src/cache      optional Redis cache of compiled per-environment snapshots
src/metrics    Prometheus exposition
migrations/    forward-only SQL
contracts/     golden evaluate fixtures + committed OpenAPI
openspec/      specs and change proposals
scripts/       demo-client, benches, README docs check
```

- The domain is pure and cannot import outer layers (enforced by ESLint).
- Evaluate runs against a compiled snapshot per `(project, environment)`, never ORM entities.
- Every admin mutation writes its audit row in the same transaction and invalidates the cache
  before responding.
- Redis is optional: if it is down, evaluate reads Postgres and keeps answering.

Details: [`docs/architecture/`](docs/architecture/README.md). Conventions for coding agents:
[`AGENTS.md`](AGENTS.md) and [`.cursor/rules/`](.cursor/rules).

## Evaluate algorithm

`POST /v1/evaluate` (evaluate key only; admin key is `403`). Missing flags are `200` with
`reason: "not_found"`, never 404. Order is exact (FR-EVAL-002):

1. missing flag → `{ value: false, reason: "not_found" }`
2. archived flag → `{ value: false, reason: "archived" }`
3. `enabled === false` → `{ value: default_value, reason: "disabled" }` (kill switch)
4. first matching rule (priority ascending) → `{ value: rule.serve, reason: "rule_match" }`
5. `bucket < percentage` → `{ value: true, reason: "percentage_in" }`
6. otherwise → `{ value: false, reason: "percentage_out" }`

Hash bucket: `first_4_bytes_be(SHA256(project_salt + ":" + flag_key + ":" + user.id)) % 100`
(0..99). Rollout is `bucket < percentage`. Reasons enum:

`disabled | rule_match | percentage_in | percentage_out | default | archived | not_found`

`default` is reserved and unused. `variant` is `"on"` when `value` is true, else `"off"`.

## Audit

Admin mutations insert an append-only `audit_events` row in the **same Postgres transaction**
as the change (`flag.create` / `flag.update` / `flag.archive` / `env_config.update`, plus
`rule.create` / `update` / `delete` when the PUT rule set diffs). Audit rows are never updated
or deleted (application code has no such path; the database trigger rejects `UPDATE`/`DELETE`).

List the trail with `GET /v1/audit` (admin key only): filters `entity_type`, `entity_id`,
`action`, `since`/`until`; cursor pagination (`limit` default 50, max 200; `next_cursor`).
Evaluate keys receive 403.

## Cache

Optional Redis cache of the compiled snapshot at `flags:{project_id}:{env}`, TTL **60s**.
Mutations `DEL` the affected key after commit, before 2xx. If Redis is down, evaluate still
answers from Postgres; missed invalidation is bounded by the TTL. Enable with:

```sh
API_REDIS_URL=redis://redis:6379 docker compose --profile cache up --build --wait
```

`--profile cache` is an alias of `--profile redis`. Redis never fails evaluate and never
changes `/readyz`.

## Observability

| Endpoint            | Behavior                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| `GET /healthz`      | Liveness; always 200 while the process is up; no dependency calls      |
| `GET /readyz`       | Postgres only; 200 or 503                                              |
| `GET /healthz/deps` | Postgres `ok`/`degraded`; Redis `ok`/`degraded`/`disabled`             |
| `GET /metrics`      | Prometheus text (`semaphore_evaluate_total{reason}`, durations, cache) |

Structured JSON logs include `request_id` (honour incoming `x-request-id`, else generate, echo
on the response). `GET /openapi.json` is the live OpenAPI 3 document; `/docs` is Swagger UI.

## Trade-offs

- **Fail-closed vs fail-open (clients):** kill switches MUST use `client_fallback: fail_closed`
  so an outage turns the feature off. `fail_open` is rare and only for non-destructive UX
  (a beta banner). The service itself returns `false` + `not_found` for a missing flag rather
  than 404, so a typo does not take down the caller.
- **Cache TTL 60s:** invalidation is best-effort after commit. If `DEL` fails, readers may see
  the previous snapshot until expiry. That is the accepted bound; evaluate will not 5xx for
  Redis.

## Key model

Two key types (NFR-SEC-001): **admin** (mutations and admin reads) and **evaluate** (evaluate
routes only). Admin keys on evaluate routes are `403 FORBIDDEN`.

Format: `sf_admin_<8 hex>_<64 hex>` or `sf_eval_<8 hex>_<64 hex>`. The stored `prefix`
(`sf_admin_<8 hex>`) is used for lookup; only a SHA-256 hash of the full secret is persisted.
Comparison is constant-time. Revoked keys (`revoked_at` set) are `401`. Raw keys are printed
**once** at `semaphore projects create` / `semaphore seed` and never stored or logged.

Send `Authorization: Bearer <raw-key>`. Missing, malformed, unknown, or revoked → `401`. Valid
key of the wrong type → `403`. `project_id` comes only from the key.

## Run locally

```sh
cp .env.example .env
mkdir -p .demo-keys
docker compose up --build --wait
```

The api container runs `migrate`, then `seed`, then `serve`. Seed prints keys **once** on the
api logs and, on first mint, writes them to `.demo-keys/demo-keys.json` (gitignored):

```sh
docker compose logs api
# seed: project demo (…)
# admin key (shown once): sf_admin_…
# evaluate key (shown once): sf_eval_…
```

```sh
ADMIN_KEY=$(node -p "JSON.parse(require('fs').readFileSync('.demo-keys/demo-keys.json','utf8')).admin_key")
EVALUATE_KEY=$(node -p "JSON.parse(require('fs').readFileSync('.demo-keys/demo-keys.json','utf8')).evaluate_key")
# or paste from the seed log if the file is missing (second boot cannot reprint keys)

curl -sS -H "Authorization: Bearer $ADMIN_KEY" http://localhost:8080/v1/projects/current
# 200 {"id":"…","name":"Demo","slug":"demo","created_at":"…"}
```

The seeded **demo** project (portfolio walkthrough) includes `checkout_v2` (50% + a rule in
`dev`), `kill_switch` (disabled), `kill_payments` (prod disabled, `fail_closed`), and `beta_ui`
(staging enabled 10% with `user.id in ["demo_in"]`). Archive is `POST /v1/flags/:key/archive`,
not DELETE.

```sh
curl -sS -o /tmp/flag.json -w '%{http_code}\n' -X POST \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"key":"smoke_flag","default_value":false}' http://localhost:8080/v1/flags
# 201

curl -sS -o /tmp/env.json -w '%{http_code}\n' -X PUT \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"enabled":true,"percentage":50,"rules":[{"priority":0,"attribute":"user.plan","op":"eq","value":"pro","serve":true}]}' \
  http://localhost:8080/v1/flags/smoke_flag/envs/dev
# 200

curl -sS -o /tmp/get.json -w '%{http_code}\n' \
  -H "Authorization: Bearer $ADMIN_KEY" http://localhost:8080/v1/flags/smoke_flag
# 200

curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $EVALUATE_KEY" http://localhost:8080/v1/flags/smoke_flag
# 403

curl -sS -w '\n%{http_code}\n' \
  -H "Authorization: Bearer $ADMIN_KEY" 'http://localhost:8080/v1/audit?limit=10'
# 200 {"items":[{"id":"…","actor_key_id":"…","action":"flag.create",…}],"next_cursor":null}
```

Evaluate examples against the older seed flags:

```sh
curl -sS -w '\n%{http_code}\n' -X POST \
  -H "Authorization: Bearer $EVALUATE_KEY" -H "Content-Type: application/json" \
  -d '{"flag_key":"kill_switch","env":"prod","user":{"id":"u1"}}' \
  http://localhost:8080/v1/evaluate
# 200 {"flag_key":"kill_switch","value":false,"reason":"disabled","variant":"off"}

curl -sS -w '\n%{http_code}\n' -X POST \
  -H "Authorization: Bearer $EVALUATE_KEY" -H "Content-Type: application/json" \
  -d '{"flag_key":"checkout_v2","env":"dev","user":{"id":"u1","attrs":{"plan":"pro"}}}' \
  http://localhost:8080/v1/evaluate
# 200 {"flag_key":"checkout_v2","value":true,"reason":"rule_match","variant":"on"}
```

Batch evaluate (evaluate key only; max 50 keys). Unknown keys are `not_found`; a partial miss
is still 200. Each map value matches single evaluate for that key.

```sh
curl -sS -w '\n%{http_code}\n' -X POST \
  -H "Authorization: Bearer $EVALUATE_KEY" -H "Content-Type: application/json" \
  -d '{"env":"prod","user":{"id":"u1"},"flag_keys":["kill_switch","missing_flag"]}' \
  http://localhost:8080/v1/evaluate-batch
# 200 {"kill_switch":{"flag_key":"kill_switch","value":false,"reason":"disabled","variant":"off"},"missing_flag":{"flag_key":"missing_flag","value":false,"reason":"not_found","variant":"off"}}
```

In-process microbench (soft, not a CI gate): `pnpm build && node scripts/bench-evaluate.mjs`.
Budget is p99 < 10ms for ≤ 20 rules (NFR-PERF-001). HTTP evaluate p99 against local Compose with a
warm cache (target <50ms): `scripts/bench-evaluate.sh` (NFR-PERF-002).

Auth checks on that same route:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8080/v1/projects/current
# 401
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $EVALUATE_KEY" http://localhost:8080/v1/projects/current
# 403
```

```sh
curl -sS http://localhost:8080/healthz
curl -sS http://localhost:8080/readyz
curl -sS http://localhost:8080/healthz/deps
```

Cache smoke after seed, then stop Redis:

```sh
curl -sS -w '\n%{http_code}\n' -X POST \
  -H "Authorization: Bearer $EVALUATE_KEY" -H "Content-Type: application/json" \
  -d '{"flag_key":"kill_switch","env":"prod","user":{"id":"u1"}}' \
  http://localhost:8080/v1/evaluate
# 200 {"flag_key":"kill_switch","value":false,"reason":"disabled","variant":"off"}

curl -sS -o /dev/null -w '%{http_code}\n' -X PUT \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"enabled":true,"percentage":100,"rules":[]}' \
  http://localhost:8080/v1/flags/kill_switch/envs/prod
# 200

curl -sS -w '\n%{http_code}\n' -X POST \
  -H "Authorization: Bearer $EVALUATE_KEY" -H "Content-Type: application/json" \
  -d '{"flag_key":"kill_switch","env":"prod","user":{"id":"u1"}}' \
  http://localhost:8080/v1/evaluate
# 200 {"flag_key":"kill_switch","value":true,"reason":"percentage_in","variant":"on"}

curl -sS http://localhost:8080/metrics | grep semaphore_
# semaphore_evaluate_total{reason="disabled"} ...
# semaphore_evaluate_duration_seconds_bucket{endpoint="single",le="0.0005"} ...
# semaphore_admin_mutations_total{action="env_config.update"} ...
# semaphore_cache_requests_total{result="hit"} ...

docker compose --profile redis stop redis
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H "Authorization: Bearer $EVALUATE_KEY" -H "Content-Type: application/json" \
  -d '{"flag_key":"kill_switch","env":"prod","user":{"id":"u1"}}' \
  http://localhost:8080/v1/evaluate
# 200
```

Without Docker (Postgres must already be up):

```sh
pnpm install
pnpm migrate
pnpm seed
pnpm dev
```

CLI: `semaphore migrate` · `semaphore seed` · `semaphore projects create --name --slug` ·
`semaphore serve`.

## Demo

Fresh volume so seed prints keys and writes `.demo-keys/demo-keys.json`:

```sh
docker compose down -v
mkdir -p .demo-keys
docker compose up --build --wait
docker compose logs demo-client
```

Expected lines (flag, subject, value, reason):

```
kill_payments demo_in false disabled
kill_payments demo_out false disabled
beta_ui demo_in true rule_match
beta_ui demo_out false percentage_out
```

`demo_out` and the random `rnd_*` ids for `beta_ui` / staging are a 10% SHA-256 bucket, so you
will see `percentage_in` or `percentage_out`. `kill_payments` / prod stays `disabled`.

Then enable the kill switch at 10% and re-run the client for mixed percentage results:

```sh
ADMIN_KEY=$(node -p "JSON.parse(require('fs').readFileSync('.demo-keys/demo-keys.json','utf8')).admin_key")

curl -sS -o /dev/null -w '%{http_code}\n' -X PUT \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"enabled":true,"percentage":10,"rules":[]}' \
  http://localhost:8080/v1/flags/kill_payments/envs/prod
# 200

docker compose run --rm --no-deps demo-client
# kill_payments demo_in true percentage_in   (or false percentage_out)
# kill_payments rnd_… false percentage_out
# beta_ui demo_in true rule_match
```

`demo-client` is `scripts/demo-client.ts`. It reads `SEMAPHORE_URL` and
`SEMAPHORE_EVALUATE_KEY` (Compose interpolates `DEMO_EVALUATE_KEY` from `.env`) and falls back
to `SEED_KEYS_PATH` (`.demo-keys/demo-keys.json`). No secrets are committed.

## Client integration

Integrators call `POST /v1/evaluate` over HTTP. There is no shipped SDK. Follow all five of
these (FR-DOC-001):

1. **Short timeouts (100–200 ms)** per evaluate call (`AbortSignal.timeout` or equivalent).
2. **On timeout, 5xx, or network error**, use the flag's per-flag `client_fallback`:
   `fail_closed` → `false`, `fail_open` → `true`. `fail_open` is rare and only for
   non-destructive UX.
3. **Kill switches use `fail_closed`.** A payments kill switch that fails open is a production
   incident.
4. **Brief in-process caching (≤10 s)** of evaluate results is allowed, with care that a kill
   switch must not stay stale past that bound.
5. **Never block app boot forever** on the flags service. If evaluate is down at startup, apply
   `client_fallback` and continue.

`client_fallback` is a flag field (`fail_closed` | `fail_open`, default `fail_closed`) on admin
`POST /v1/flags`, `GET /v1/flags/:key`, and `PATCH /v1/flags/:key`. It is **not** returned by
`POST /v1/evaluate`. Configure it in your client (or cache it from an admin read); do not wait
for evaluate JSON to tell you how to fail.

```ts
type ClientFallback = "fail_closed" | "fail_open";

async function evaluateOrFallback(input: {
  url: string;
  key: string;
  flagKey: string;
  env: string;
  userId: string;
  fallback: ClientFallback; // from your config / last admin GET /v1/flags/:key
}): Promise<boolean> {
  try {
    const res = await fetch(`${input.url}/v1/evaluate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        flag_key: input.flagKey,
        env: input.env,
        user: { id: input.userId },
      }),
      signal: AbortSignal.timeout(150), // 100–200 ms
    });
    if (!res.ok) return input.fallback === "fail_open";
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null && "value" in body && body.value === true;
  } catch {
    // timeout, 5xx via !res.ok above, or network error
    return input.fallback === "fail_open";
  }
}
```

`scripts/demo-client.ts` is the same contract: 150 ms timeout, `fail_closed` for
`kill_payments` and `beta_ui`, one line per decision.

## Tests and CI

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
DATABASE_URL=postgres://semaphore:semaphore@localhost:5432/semaphore \
REDIS_URL=redis://localhost:6379 pnpm test:integration
```

CI runs lint → format → README client-docs check → typecheck → unit → integration → contract
(Postgres 16 + Redis 7) → OpenAPI generate-and-lint → build → in-process evaluate microbench
(soft), plus Compose validation, an image build (no push), and a demo-client Compose smoke that
asserts reason codes. Contract fixtures: [`docs/contracts.md`](docs/contracts.md).

## License

[MIT](LICENSE)
