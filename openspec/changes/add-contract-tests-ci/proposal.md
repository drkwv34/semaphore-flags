# Proposal

## Why

Evaluate goldens already live under `contracts/evaluate/` but they inject against an in-memory
snapshot, OpenAPI is not served or committed, and CI does not lint the document or run the
in-process bench. Day 7 makes contract fixtures a merge gate against the real app and Postgres
(FR-EVAL-005, FR-EVAL-004, NFR-MAINT-001, NFR-MAINT-002) and publishes the Fastify-generated
OpenAPI so clients and CI share one schema (NFR-PERF-001/002 for the soft bench).

## What Changes

- Keep the existing evaluate fixtures (kill switch, rule match, percentage boundaries at buckets
  0 and 99, missing attributes, archived, not_found, batch partial not_found, plus auth/size
  cases). Document how `user-76` / `user-39` hash to buckets 0 and 99. Commit them as the golden
  set.
- Contract runner (Vitest) boots the real Fastify app against real Postgres (and Redis when
  `REDIS_URL` is set), seeds each fixture, replays the HTTP request, and deep-equals the
  response. Only explicitly listed volatile fields (`request_id`, timestamps) are ignored. A
  changed body fails the test (FR-EVAL-005).
- Every fixture response, plus `/healthz`, `/healthz/deps`, and `/metrics`, is validated against
  the committed OpenAPI document.
- App serves `GET /openapi.json` from `@fastify/swagger` (optional `/docs` UI). The generated
  document is committed at `contracts/openapi/openapi.json`; CI regenerates and fails on drift,
  then lints with Spectral (NFR-MAINT-002).
- CI keeps existing jobs and does not loosen them. Step order becomes lint → format →
  typecheck → unit → integration → **contract** (named, required) → OpenAPI lint → build, plus
  the existing container image build (no push). In-process evaluate microbench runs in CI and
  prints p99 vs 10ms (soft: warn, not fail). `scripts/bench-evaluate.sh` documents HTTP evaluate
  p99 against local Compose with a warm cache (target <50ms) (NFR-PERF-001/002, NFR-MAINT-001).
- Short `docs/contracts.md` (how fixtures work, how to add one, how to regenerate OpenAPI
  intentionally) and a CI section line in README. No README rewrite.

Out of scope: marketing site, demo-client, About/topics API, admin SPA, new evaluate semantics,
loosening or deleting CI jobs.

## Capabilities

### New Capabilities

- (none — reuse `evaluation` and `ops`)

### Modified Capabilities

- `evaluation`: golden HTTP fixtures are a merge gate replayed against Postgres; responses MUST
  match exactly (volatile fields listed) and MUST validate against OpenAPI; in-process bench
  reports p99 vs 10ms (FR-EVAL-004, FR-EVAL-005, NFR-PERF-001, NFR-REL-002).
- `ops`: `GET /openapi.json` serves the generated OpenAPI 3 document; `/docs` may serve Swagger
  UI; health and metrics are documented in that document and linted in CI; CI order includes
  the contract job and image build without dropping existing checks (NFR-MAINT-001, NFR-MAINT-002,
  NFR-PERF-002, FR-OPS-001/002).

## Impact

- **Capabilities:** `evaluation`, `ops`.
- **Code paths:** `src/api/app.ts` (`@fastify/swagger`, `GET /openapi.json`, optional `/docs`);
  `test/contract/` live Postgres replay + OpenAPI Ajv checks; `contracts/evaluate/` (document
  bucket keys; keep existing goldens); `contracts/openapi/openapi.json`; `scripts/generate-openapi.ts`
  (or equivalent); `scripts/bench-evaluate.sh`; `.github/workflows/ci.yml`; `docs/contracts.md`;
  README CI line; `docs/architecture/testing-strategy.md` and `integrations.md` if they still
  describe in-memory-only contracts / unimplemented swagger.
- **APIs:** `GET /openapi.json` is new (JSON OpenAPI 3). Evaluate JSON is unchanged. `/docs` is
  optional UI, not a product API.
- **Dependencies:** `@fastify/swagger`, optionally `@fastify/swagger-ui`; Spectral CLI for lint;
  Ajv (or equivalent) for fixture schema checks.
- **CI:** keep `verify` and `image` jobs. Reorder so integration runs before contract. Add
  OpenAPI generate-and-diff + Spectral lint. Run in-process bench after build (soft). Do not
  delete, skip, or loosen any existing job or check (NFR-MAINT-001).
- **Docs:** `docs/contracts.md`; README Tests and CI line only.
