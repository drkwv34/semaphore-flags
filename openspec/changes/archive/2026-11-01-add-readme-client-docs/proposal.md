# Proposal

## Why

Evaluate, audit, cache, and metrics are live, but the README still defers the platform story
and FR-DOC-001 client-safety section, and Compose `demo-client` only waits for `/healthz`.
Day 8 must make a reviewer able to run the seeded demo, see reason codes, and copy a
timeout-plus-fallback client contract (FR-DOC-001, NFR-DOC-001, NFR-PORT-001).

## What Changes

- Expand the README into the SRS §9 platform story (problem, why, demo, stack + why TypeScript,
  Compose run, tests/CI/contracts, architecture, evaluate algorithm, audit, cache, observability,
  trade-offs). Claims must match implemented behavior; no marketing fluff (NFR-DOC-001).
- Add a README **Client integration** section covering all five FR-DOC-001 points: 100–200 ms
  timeouts; on timeout/5xx/network error apply per-flag `client_fallback` (`fail_closed` → false,
  `fail_open` → true, rare, non-destructive UX); kill switches use `fail_closed`; brief in-process
  caching (≤10 s); never block app boot forever. Include a short TypeScript snippet. Document that
  `client_fallback` is a flag field on admin `GET/POST/PATCH /v1/flags`, not on evaluate JSON.
- Implement the Compose `demo-client` as a tiny TypeScript/Node script that evaluates the seeded
  demo project for `demo_in`, `demo_out`, and random ids against `kill_payments` (prod, disabled →
  `disabled`) and `beta_ui` (staging, `user.id in ["demo_in"]` → true, 10% rollout), printing
  `flag subject value reason` per line. Short timeout + documented fallback on error. Keys/URL
  from env (`.env.example`; no secrets committed) (NFR-PORT-001).
- Extend idempotent seed with SRS demo flags (`kill_payments`, `beta_ui`) without removing
  existing `checkout_v2` / `kill_switch`. Keep project slug `demo`.
- Add `.github/pull_request_template.md` with a checklist that includes Client integration docs
  plus OpenSpec/tests items.
- CI: keep every existing job. Add a cheap README-docs check (Client integration section +
  relative links) and typecheck/build of demo-client, plus a Compose smoke that asserts reason
  codes (NFR-MAINT-001).

Out of scope: React admin SPA, marketing site, new evaluate semantics, About/topics API,
pin-ready closeout.

## Capabilities

### New Capabilities

- (none — reuse `client-guidance`, `ops`, `flags`, `projects-keys`)

### Modified Capabilities

- `client-guidance`: replace the placeholder with the five FR-DOC-001 client-safety
  requirements, where `client_fallback` lives, and the TypeScript snippet contract (FR-DOC-001,
  NFR-DOC-001).
- `ops`: Compose `demo-client` walkthrough, PR template checklist, README platform sections,
  and CI docs/demo-client checks without loosening existing jobs (NFR-PORT-001, NFR-DOC-001,
  NFR-MAINT-001).
- `flags`: idempotent seed also creates `kill_payments` (all envs disabled, `fail_closed`) and
  `beta_ui` (staging enabled 10% with `user.id in ["demo_in"]`) (FR-FLAG-001, FR-FLAG-002).
- `projects-keys`: seed still prints keys once; optional `SEED_KEYS_PATH` may write those same
  first-boot keys for the local Compose demo only (FR-PROJ-001, FR-PROJ-002).

## Impact

- **Capabilities:** `client-guidance`, `ops`, `flags`, `projects-keys`.
- **Code paths:** `src/services/flags.ts` (seed flags); `src/cli.ts` (optional key file);
  `scripts/demo-client.ts` (replace stub `.mjs`); `compose.yaml`; `.env.example`;
  `.github/pull_request_template.md`; `.github/workflows/ci.yml`; `scripts/check-readme-docs.ts`;
  README; `docs/architecture/integrations.md`; integration seed assertions.
- **APIs:** none. Evaluate JSON unchanged. `client_fallback` remains on flag admin resources.
- **Dependencies:** none new.
- **CI:** keep `verify` and `image`. Add README-docs assertion and demo-client typecheck; add a
  Compose smoke that asserts reason codes. Do not delete, skip, or loosen any existing check.
- **Docs:** README rewrite of planned sections into the live platform story + Client integration;
  PR template.
