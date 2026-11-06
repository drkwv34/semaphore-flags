# Tasks

## 1. OpenSpec planning

- [x] 1.1 Create change `add-pin-ready-closeout` with proposal, skipped specs (`skip_specs: true`), design, and this task list; verify `openspec status --change add-pin-ready-closeout` shows proposal/design/tasks done and specs skipped

## 2. Must-scope triage and docs hygiene

- [x] 2.1 Triage leftover Must bugs (GitHub issues, latest CI on main, SRS Must vs shipped specs, `TODO`/`FIXME` in product code); record findings in `docs/pin-ready-checklist.md` and fix only small real defects if found (verify: `gh issue list --state open` is empty or listed, and any code fix has a test or command)
- [x] 2.2 Add `openspec/specs/README.md` indexing shipped capabilities and rewrite the stale “structural placeholders” sentence in `openspec/README.md`; verify the index lists `projects-keys`, `flags`, `targeting-rules`, `evaluation`, `audit`, `caching`, `ops`, and `client-guidance`
- [x] 2.3 Update `openspec/project.md` so Day 9 pin-ready closeout is marked and Should items remain labelled Should; bump `package.json` `"version"` from `0.0.0` to `0.1.0`; add README § Repository metadata with the intended About/topics; verify `package.json` version is `0.1.0` and README contains that heading

## 3. Should-scope backlog (do not implement)

- [x] 3.1 Add `openspec/backlog/should-scope.md` listing admin SPA, multivariate/string variants, experimentation stats, streaming/native SDKs, rule-builder UI, multi-region, hosted deploy, `RATE_LIMITED` (429), and NFR-PERF-001/002 as CI-failing gates as proposal-only; verify the file states explicitly that none of these are implemented in this change

## 4. Quality-bar checklist

- [x] 4.1 Commit `docs/pin-ready-checklist.md` with every portfolio quality-bar item marked met / not met plus evidence (path, CI run URL, or command); verify About/topics is **not met (manual, owner sets in GitHub Settings)** and that the GitHub About API was not called
- [x] 4.2 Confirm the checklist names Compose `--wait` + seed + demo-client, unit + integration + contract tests, MIT LICENSE, OpenSpec skills/commands/archive, and `.cursor/rules/`; verify those rows exist

## 5. Validation

- [x] 5.1 Run `openspec validate add-pin-ready-closeout --strict` and `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; verify all exit 0

## Verification

```sh
openspec validate add-pin-ready-closeout --strict
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec tsx scripts/check-readme-docs.ts
docker compose config --quiet
```

## Workflow follow-up

- Open a ready (non-draft) PR to `main` from `chore/pin-ready`.
- Wait for CI on the PR head; fix and push if it fails; merge only when green, including demo-client compose smoke. A concurrency-cancelled run on the merge commit is not a failure; judge the PR head, then wait for CI on main’s post-archive push.
- Merge locally as Christian Agila: `git checkout main && git pull && git merge --no-ff chore/pin-ready -m "Merge pull request #<n> from drkwv34/chore/pin-ready" && git push origin main`. Never use the GitHub merge button or API.
- After merge, archive on `main` as Christian Agila: `openspec archive add-pin-ready-closeout --yes` (add `--skip-specs` if the CLI still requests a spec sync).
- Confirm CI on `main`; optionally annotated-tag `v0.1.0`.
