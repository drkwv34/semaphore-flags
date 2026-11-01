# Design

## Context

See `proposal.md` for motivation. Evaluate, audit, cache, and metrics are implemented. README
still has a "Planned sections" stub. Compose already declares a `demo-client` service that mounts
`scripts/demo-client.mjs` and exits after `/healthz`. Seed creates project slug `demo` with
`checkout_v2` and `kill_switch` only. `client_fallback` is already a flag column and admin JSON
field; evaluate JSON does not include it. CI has `verify` + `image` jobs.

## Goals / Non-Goals

**Goals:**

- Make `docker compose up` produce demo-client lines with real reason codes.
- Keep slug `demo` and existing seed flags; add SRS demo flags beside them.
- Typecheck demo-client as part of `pnpm typecheck`; smoke it in CI without loosening jobs.

**Non-Goals:**

- Changing evaluate JSON or FR-EVAL-002.
- Renaming the demo project slug to `portfolio`.
- Shipping an SDK package.

## Decisions

### 1. Keep project slug `demo`; add flags, do not replace seed

- **Choice:** Extend `seedDemoFlags` with `kill_payments` (all envs stay at the create default:
  disabled 0%) and `beta_ui` (PUT staging `enabled: true`, `percentage: 10`, one rule
  `user.id` `in` `["demo_in"]` serve true). Keep `checkout_v2` / `kill_switch`.
- **Why:** Brief says extend, not replace. `projects-keys` already binds slug `demo`. README
  walkthrough still uses the seeded demo project as the portfolio demo.
- **Alternative:** Rename slug to `portfolio`. Rejected: breaks existing tests and curl examples.

### 2. TypeScript demo-client run with Node type stripping

- **Choice:** Replace `scripts/demo-client.mjs` with `scripts/demo-client.ts` included in the
  root `tsconfig.json` (already covers `scripts/`). Compose `node:22-alpine` runs
  `node --experimental-strip-types --no-warnings demo-client.ts` with a tiny `{ "type": "module" }`
  `package.json` mounted beside it.
- **Why:** Brief requires TypeScript and a Compose service. Node 22 can strip types without a
  second image build.
- **Alternative:** Compile into `dist/` via `tsconfig.build.json`. Rejected: would mix a client
  script into the API image. Alternative: keep `.mjs`. Rejected: brief says TypeScript.

### 3. Env key plus optional first-boot key file

- **Choice:** demo-client reads `SEMAPHORE_URL` and `SEMAPHORE_EVALUATE_KEY` (Compose interpolates
  `DEMO_EVALUATE_KEY` from `.env.example`). If the env key is empty and `SEED_KEYS_PATH` is set,
  read the evaluate key written by `semaphore seed` on first mint only. Compose mounts a bind
  dir `.demo-keys/` (gitignored) at `/shared` for both `api` and `demo-client`.
- **Why:** Keys are display-once and hashed in the DB; Compose cannot recover them on later
  boots. A local file makes `docker compose up` work on a fresh volume without committing
  secrets. Operators can still paste into `.env`.
- **Alternative:** Parse `docker compose logs api`. Rejected: racey and not a client contract.

### 4. Client fallback is local config, not evaluate JSON

- **Choice:** Document `client_fallback` on admin flag JSON. demo-client keeps a local map
  (`kill_payments` and `beta_ui` → `fail_closed`) and applies it on timeout/5xx/network error.
  Do not fetch admin `GET /v1/flags` from the evaluate path.
- **Why:** Evaluate keys cannot read admin routes (403). Inventing a new evaluate field would
  be new API semantics, which the brief forbids.
- **Alternative:** Have demo-client call admin GET. Rejected: wrong key type; would mint a
  second concern.

### 5. README-docs check instead of external link linter

- **Choice:** `scripts/check-readme-docs.ts` asserts the Client integration heading, the five
  FR-DOC-001 points, and that relative markdown links resolve on disk. Run it in the existing
  `verify` job after format (or after typecheck). No lychee.
- **Why:** Brief allows this when a crawler would be flaky. Relative-link existence is
  deterministic.
- **Alternative:** lychee against the network. Rejected: flakiness.

### 6. Compose smoke as a third CI job

- **Choice:** New job `demo` that does not skip `verify` or `image`. It `docker compose up
--build --wait`, asserts demo-client logs contain `disabled`, `rule_match`, and
  `percentage_in` or `percentage_out`, then tears down. Typecheck of demo-client is already
  covered by `pnpm typecheck` in `verify`.
- **Why:** Brief wants CI to exercise demo-client at least as typecheck and ideally a Compose
  smoke, without loosening existing jobs.
- **Alternative:** Fold smoke into `image`. Rejected: image job has a 10-minute timeout and
  currently only builds; a long compose smoke would couple failures.

## Risks / Trade-offs

- [Fresh-volume key file permissions] → Create `.demo-keys` in CI with `mkdir -p && chmod 777`;
  seed treats a write failure as non-fatal after printing keys.
- [Idempotent seed cannot reprint keys] → README says copy keys from the first-boot api log
  into `DEMO_EVALUATE_KEY` when `.demo-keys` is missing.
- [Random ids may all hash out of 10%] → demo-client evaluates several random subjects plus
  `demo_out` so at least one of `percentage_in` / `percentage_out` appears; CI accepts either,
  and `demo_in` supplies `rule_match`.
- [Compose smoke duration] → 15-minute timeout; `--wait` on api healthcheck; do not cache
  bust beyond `--build`.

## Migration Plan

- Docs and seed flags are additive. Existing DBs gain the two flags on the next `semaphore seed`.
- Rollback: previous image; extra flags remain harmless. `.demo-keys/` is local-only.

## Open Questions

None.
