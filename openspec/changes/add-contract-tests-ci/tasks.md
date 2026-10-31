# Tasks

## 1. OpenAPI serving and committed document

- [ ] 1.1 Add `@fastify/swagger` (and `@fastify/swagger-ui` at `/docs`) in `buildApp`, register it before routes, serve `GET /openapi.json`, skip info logs for those paths, and verify `GET /openapi.json` returns 200 OpenAPI 3 without a key (NFR-MAINT-002)
- [ ] 1.2 Add `pnpm openapi:generate` that builds a fully-routed app (stub pool/keys/source as in design) and writes `contracts/openapi/openapi.json`; add Spectral (`.spectral.yaml`) as `pnpm openapi:lint`; verify generate is stable on a second run and lint passes (NFR-MAINT-002)
- [ ] 1.3 Document `/healthz`, `/healthz/deps`, and `/metrics` in route schemas so they appear in the OpenAPI document, and verify those three responses validate against the committed document (FR-OPS-001, FR-OPS-002)

## 2. Live contract runner

- [ ] 2.1 Document bucket 0 (`fixture-salt` + `checkout_v2` + `user-76`) and bucket 99 (`user-39`) next to the goldens (`contracts/README.md` and `docs/contracts.md`), keep existing evaluate fixtures, and verify the required case names are still loaded (FR-EVAL-004, FR-EVAL-005, NFR-REL-002)
- [ ] 2.2 Add a Vitest live runner that seeds each evaluate fixture into Postgres (Redis when `REDIS_URL` is set), `inject`s the request, deep-equals the body after stripping `request_id`/`created_at`/`updated_at`/`archived_at`, and validates against OpenAPI; verify `pnpm test:contract` lists each fixture and fails if an expected body is wrong (FR-EVAL-005)
- [ ] 2.3 Keep the in-memory evaluate contract tests; extend flag/audit/ops fixture checks so example bodies also validate against OpenAPI; verify existing `pnpm test:contract` cases still pass (NFR-MAINT-002)

## 3. CI, bench, docs

- [ ] 3.1 Reorder CI `verify` to lint → format → typecheck → unit → integration → named Contract → OpenAPI generate-diff + lint → build, add in-process bench after build with `continue-on-error: true`, keep the `image` job (no push, no deleted checks), and verify the workflow YAML still contains Format, Unit, Integration, Contract, Build, and image build (NFR-MAINT-001, NFR-PERF-001)
- [ ] 3.2 Add `scripts/bench-evaluate.sh` for HTTP evaluate p99 against local Compose with a warm cache (target <50ms) and keep `scripts/bench-evaluate.mjs`; verify the shell script prints p99 and mentions 50ms, and the in-process script prints p99 vs 10ms (NFR-PERF-001, NFR-PERF-002)
- [ ] 3.3 Write `docs/contracts.md` (add a fixture, regenerate OpenAPI intentionally) and one Tests and CI line in README; update `docs/architecture/testing-strategy.md`, `integrations.md`, `.cursor/rules/testing.mdc`, and the architecture decision log if they still say in-memory-only or swagger-not-wired; verify README is not rewritten beyond the CI line (NFR-MAINT-001)

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
DATABASE_URL=postgres://semaphore:semaphore@localhost:5432/semaphore \
REDIS_URL=redis://localhost:6379 pnpm test:contract
DATABASE_URL=postgres://semaphore:semaphore@localhost:5432/semaphore \
REDIS_URL=redis://localhost:6379 pnpm test:integration
pnpm openapi:generate && git diff --exit-code contracts/openapi/openapi.json
pnpm openapi:lint
pnpm build && node scripts/bench-evaluate.mjs
openspec validate add-contract-tests-ci --strict
```

## Workflow follow-up

- Open a ready PR from `test/contracts-ci`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive add-contract-tests-ci --yes` as a direct commit on `main`.
