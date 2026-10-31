# Design

## Context

See `proposal.md` for motivation. Evaluate HTTP fixtures already exist under
`contracts/evaluate/` and the Vitest `contract` project injects them against an in-memory
`SnapshotSource`. Route JSON schemas exist; `@fastify/swagger` and `contracts/openapi/` do not.
CI `verify` runs lint → format → typecheck → unit → contract → integration → build, with a
parallel `image` job. `scripts/bench-evaluate.mjs` already reports in-process p99. Architecture
already names `/openapi.json`, `/docs`, Spectral/drift, and a contract merge gate.

## Goals / Non-Goals

**Goals:**

- Replay committed evaluate fixtures against the real app + Postgres (Redis when configured)
  with exact JSON equality after stripping listed volatile fields.
- Serve and commit OpenAPI generated from the same Fastify schemas that validate requests.
- Keep every existing CI check; add OpenAPI lint/drift and a named contract step after
  integration; run the microbench softly.

**Non-Goals:**

- Changing FR-EVAL-002 or evaluate JSON.
- Replacing in-memory inject tests (they stay as a fast schema/algorithm check).
- Hard-failing CI on p99 noise.
- README rewrite or demo-client work.

## Decisions

### 1. Live contract runner uses `app.inject` plus a real pool

- **Choice:** Each live evaluate fixture gets a unique project in an isolated schema
  (`withTestPool`), seeded from `setup` (salt, env, flags, rules, archive). `buildApp` is wired
  with that pool and `REDIS_URL` when set. Requests go through `inject` (real Fastify, real SQL)
  rather than binding a TCP port.
- **Why:** Matches existing integration tests; no port races in CI. Still "HTTP" from Fastify's
  point of view.
- **Alternative:** Listen on a port and `fetch`. Rejected: extra flakiness, no extra coverage.

### 2. Keep in-memory inject tests

- **Choice:** Existing `test/contract/evaluate.test.ts` in-memory path remains. A new live
  runner (`test/contract/evaluate-http.test.ts` or equivalent) requires `DATABASE_URL` and is
  the merge gate described by FR-EVAL-005.
- **Why:** Unit-speed algorithm/schema agreement is still useful; the brief asks to extend, not
  replace.
- **Alternative:** Delete in-memory tests. Rejected: slower feedback for schema-only edits.

### 3. Volatile fields are an explicit allow-list

- **Choice:** Deep-equal after deleting `request_id` anywhere and ISO timestamp keys
  `created_at` / `updated_at` / `archived_at` when present. Evaluate 200 bodies have none of
  these; error envelopes have `request_id`.
- **Why:** Brief forbids ignoring unexplained fields. Fixtures keep `"request_id": "fixture"` as
  a placeholder.
- **Alternative:** Regex-replace UUIDs. Rejected: could hide a real contract change.

### 4. `@fastify/swagger` registered first; `GET /openapi.json` is explicit

- **Choice:** Register `@fastify/swagger` (OpenAPI 3) at the start of `buildApp`, then routes.
  `GET /openapi.json` returns `app.swagger()`. `@fastify/swagger-ui` at `/docs` is enabled
  (cheap). Both skip info request logs like other ops probes.
- **Why:** Architecture already names these paths. Fastify schemas stay the source of truth.
- **Alternative:** Hand-written OpenAPI YAML. Rejected: would drift from route schemas.

Fully-wired routes (flags, evaluate) are only registered when `pool` / `findApiKey` /
`snapshotSource` exist. The generate script builds an app with stub `findApiKey` +
`snapshotSource` and a dummy `pool` so every product route is present in the committed
document, matching production `startServer`.

### 5. Committed OpenAPI + generate script + Spectral

- **Choice:** `pnpm openapi:generate` writes `contracts/openapi/openapi.json` (stable JSON
  key order). CI runs generate and `git diff --exit-code`. `pnpm openapi:lint` runs Spectral
  with `.spectral.yaml` extending `spectral:oas`, relaxing rules that fight Fastify's generated
  shape (e.g. missing `operationId` if the plugin does not emit them — prefer setting
  `operationId` on routes if cheap).
- **Why:** NFR-MAINT-002; regenerate-on-drift is the architecture plan.
- **Alternative:** Only lint in CI without committing. Rejected: PR review would not see schema
  diffs.

### 6. Ajv validates fixture bodies against the committed document

- **Choice:** Load `contracts/openapi/openapi.json`, resolve the path+method+status schema
  (JSON for evaluate/health; `text/plain` string for `/metrics`), validate with Ajv
  (`allErrors`, OpenAPI-friendly). Live responses and committed fixture examples both run
  through it.
- **Why:** Independent of Fastify's response serializer, so a missing `response` schema still
  fails.
- **Alternative:** Trust Fastify serialization. Rejected: tests that inject with incomplete
  apps would not catch document holes.

### 7. CI: keep both jobs; reorder; named contract step; soft bench

- **Choice:** Keep `verify` and `image`. Inside `verify`: Lint, Format, Typecheck, Unit,
  Integration, Contract (`pnpm test:contract`), OpenAPI (generate-diff + lint), Build, then
  Bench (`node scripts/bench-evaluate.mjs`) with `continue-on-error: true` so a noisy p99
  warns via the failed step annotation but does not fail the job. `image` stays a required
  parallel job (Dockerfile build, `push: false`).
- **Why:** Brief order is lint → typecheck → unit → integration → contract → build → image.
  Format stays (do not loosen). Contract remains a named step. Image already exists; making it
  `needs: verify` would hide image failures when verify fails, so it stays parallel.
- **Alternative:** Split a third `contract` job with its own checkout/install. Rejected:
  duplicates install time; a named step in `verify` already gates. Do not remove contract from
  `verify`.

Contract tests in CI already have `DATABASE_URL` and `REDIS_URL` from the job services.

### 8. HTTP bench is a local script, not a CI gate

- **Choice:** `scripts/bench-evaluate.sh` curls `POST /v1/evaluate` against
  `SEMAPHORE_URL` (default `http://localhost:8080`) with `EVALUATE_KEY`, warms the cache, runs
  a fixed number of requests, prints p99 vs 50ms. It is documented; CI does not run it (needs
  Compose).
- **Why:** NFR-PERF-002 is an HTTP/Compose budget. Shared GitHub runners plus a freshly built
  stack would be noisy and slow.
- **Alternative:** Run Compose in CI for HTTP p99. Rejected: out of proportion for a soft
  budget already covered in-process.

### 9. Seeding uses store inserts, not admin HTTP

- **Choice:** Live runner inserts project (with fixture salt), env, keys, flags, env configs,
  rules, and archives via `src/store`. Auth headers use the minted raw keys according to
  `fixture.auth`.
- **Why:** Deterministic salt (`fixture-salt`) is required for buckets 0/99. Admin HTTP cannot
  set `projects.salt`.
- **Alternative:** Seed via `PUT /v1/flags/...` then SQL-update salt. Rejected: extra moving
  parts.

## Risks / Trade-offs

- [Live contracts need Postgres] → CI already provides it. Local `pnpm test:contract` now
  requires `DATABASE_URL` for the live suite; in-memory tests still run. Document in
  `docs/contracts.md`.
- [Dummy pool in OpenAPI generate] → never queried; only registers routes. If a plugin
  queries at register time, the generate script will fail closed.
- [Swagger UI in production] → unauthenticated by design (ops route). No secrets in the
  document. Acceptable; `/docs` can be disabled later behind an env flag if needed (not in
  this change).
- [Soft bench `continue-on-error`] → GitHub marks the step with a warning; the job stays
  green. That matches "warn, not fail" without deleting the step.
- [Parallel image job] → image may finish before contract. Logical pipeline still includes
  both as required checks.

## Migration Plan

1. Merge this change. Clients can `GET /openapi.json`; no evaluate JSON change.
2. Regenerating OpenAPI is `pnpm openapi:generate`. Intentional contract edits are fixture
   JSON + OpenSpec (already the rule).
3. Rollback = previous image. No SQL.

## Open Questions

None. Fixture set, volatile fields, CI order, and soft bench are bound by the Day 7 brief and
existing architecture.
