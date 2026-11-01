# Tasks

## 1. Seed demo flags and key file

- [x] 1.1 Extend `seedDemoFlags` with idempotent `kill_payments` (`fail_closed`, default false, all envs disabled) and `beta_ui` (`fail_closed`, staging enabled 10% with `user.id in ["demo_in"]` serve true); keep `checkout_v2` and `kill_switch`; verify integration seed test expects all four flags and the staging rule (FR-FLAG-001, FR-FLAG-002)
- [x] 1.2 When `SEED_KEYS_PATH` is set and seed mints keys, write admin + evaluate raw keys to that path from the CLI (DB still stores hashes); gitignore `.demo-keys/`; verify a unit or integration assertion that the file is written only on first mint (FR-PROJ-002)

## 2. demo-client

- [x] 2.1 Replace `scripts/demo-client.mjs` with `scripts/demo-client.ts` that loops `demo_in`, `demo_out`, and random ids against `kill_payments`/`prod` and `beta_ui`/`staging`, prints `flag subject value reason`, uses 150 ms timeout, and applies local `client_fallback` on timeout/5xx/network error; verify a unit test covers fallback mapping and parse of a 200 body (FR-DOC-001, NFR-PORT-001)
- [x] 2.2 Wire Compose: mount the TS script + `{ "type": "module" }` package.json, bind `.demo-keys` as `/shared`, set `SEED_KEYS_PATH` / `SEMAPHORE_URL` / `SEMAPHORE_EVALUATE_KEY` from `DEMO_EVALUATE_KEY`; document vars in `.env.example`; verify `docker compose config` still succeeds (NFR-PORT-001)

## 3. README, PR template, CI

- [x] 3.1 Rewrite README planned sections into the SRS §9 platform story plus Client integration covering all five FR-DOC-001 points, a TypeScript timeout/fallback snippet, and a Compose demo walkthrough (fresh seed output, then enable `kill_payments` 10% via admin curl); verify claims match code (algorithm, reasons, cache TTL 60s, audit GET) (NFR-DOC-001, FR-DOC-001)
- [x] 3.2 Add `.github/pull_request_template.md` with Client integration docs, OpenSpec, and tests checklist items; add `scripts/check-readme-docs.ts` that asserts the Client integration section, the five points, and relative README links; run it in the existing verify job; add a Compose smoke job that asserts `disabled`, `rule_match`, and a percentage reason without loosening existing jobs; verify workflow YAML still contains Format, Unit, Integration, Contract, Build, and image build (NFR-MAINT-001, NFR-DOC-001)
- [x] 3.3 Update `docs/architecture/integrations.md` so demo-client is no longer described as a healthz stub; verify the architecture doc matches the running client

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
DATABASE_URL=postgres://semaphore:semaphore@localhost:5432/semaphore \
REDIS_URL=redis://localhost:6379 pnpm test:integration
pnpm exec tsx scripts/check-readme-docs.ts
openspec validate add-readme-client-docs --strict
docker compose config --quiet
```

## Workflow follow-up

- Open a ready PR from `docs/readme-client-docs`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive add-readme-client-docs --yes` as a direct commit on `main`.
