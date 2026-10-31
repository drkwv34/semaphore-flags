# Contract fixtures

Golden HTTP request/response pairs that gate merges (FR-EVAL-005, NFR-MAINT-002). They live under
`contracts/` and are replayed by `pnpm test:contract`.

## Layout

| Path                                     | What it covers                                    |
| ---------------------------------------- | ------------------------------------------------- |
| `contracts/evaluate/*.json`              | `POST /v1/evaluate` and `/v1/evaluate-batch`      |
| `contracts/evaluate/bucket-vectors.json` | SHA-256 bucket goldens (never edit existing rows) |
| `contracts/flags/`                       | Admin flag/rule example bodies                    |
| `contracts/audit/`                       | Audit list shape and evaluate-key 403             |
| `contracts/ops/`                         | `/healthz/deps`                                   |
| `contracts/openapi/openapi.json`         | Generated OpenAPI 3 document                      |

Evaluate fixtures have this shape:

```json
{
  "name": "kill switch disabled in prod",
  "auth": "evaluate",
  "setup": { "salt": "fixture-salt", "env": "prod", "flags": [ … ] },
  "request": { "method": "POST", "url": "/v1/evaluate", "body": { … } },
  "response": { "status": 200, "body": { … } }
}
```

`auth` is `evaluate`, `admin`, or `none`. `setup.salt` is the project salt used for hashing.

## Hash buckets 0 and 99

`bucket = first_4_bytes_be(SHA256(salt + ":" + flag_key + ":" + user.id)) % 100`.

Committed vectors in `bucket-vectors.json` (do not change existing entries):

| salt           | flag_key      | user.id   | bucket |
| -------------- | ------------- | --------- | ------ |
| `fixture-salt` | `checkout_v2` | `user-76` | 0      |
| `fixture-salt` | `checkout_v2` | `user-39` | 99     |

Percentage-boundary fixtures use those subject keys (`percentage-in-bucket-0.json`,
`percentage-out-bucket-99.json`).

## How the runner works

1. **In-memory** (`test/contract/evaluate.test.ts`): compile `setup` into a snapshot, agree with
   the unit algorithm, `inject` against a fake `SnapshotSource`.
2. **Live** (`test/contract/evaluate-http.test.ts`): seed `setup` into real Postgres (Redis when
   `REDIS_URL` is set), boot `buildApp` with that pool, `inject` the request, and
   deep-equal the JSON body after stripping only `request_id`, `created_at`, and `updated_at`.
3. Every fixture response, plus `/healthz`, `/healthz/deps`, and `/metrics`, is validated against
   `contracts/openapi/openapi.json`.

Live tests require `DATABASE_URL` (and use `REDIS_URL` when present). CI provides both.

A changed expected body is an API change: update the fixture in the same OpenSpec change that
changes the route.

## Add a fixture

1. Copy an existing file in `contracts/evaluate/`.
2. Set `name`, `auth`, `setup`, `request`, and `response`.
3. For percentage cases, pick a `(salt, flag_key, user.id)` from `bucket-vectors.json` or add a
   **new** vector (never edit an old one).
4. Run `pnpm test:contract`. If you meant to change the HTTP body, the live test will fail until
   the fixture matches.

## Regenerate OpenAPI

Route JSON schemas in `src/api` are the source of truth.

```sh
pnpm openapi:generate   # writes contracts/openapi/openapi.json
pnpm openapi:lint       # Spectral
```

CI regenerates and fails on diff. Do not hand-edit the committed document; change the route
schema and regenerate intentionally.

The app serves the live document at `GET /openapi.json` and Swagger UI at `GET /docs`.
