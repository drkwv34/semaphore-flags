# Design

## Context

See `proposal.md` for motivation. semaphore-flags on `main` (`beededc`) already ships Must-scope product (projects/keys/envs, flags/rules/audit, evaluate + batch, Redis cache + Prometheus, contract CI, README + Compose demo-client). GitHub has **zero issues**. Latest `CI` run on `main` (workflow run `41261180828`) succeeded on `beededc`, including verify (lint/format/README docs/typecheck/unit/integration/contract/OpenAPI/build), compose image, and demo-client smoke. Product `src/` stays untouched unless triage finds a small Must defect.

Constraints: `src/domain` stays pure; evaluate missing-flag is `200` + `not_found`; admin mutation + audit insert share one transaction and cache delete happens after commit before 2xx; never skip or loosen CI; never rewrite history; never call the GitHub About/topics API; author and committer are Christian Agila with zero `Co-authored-by` lines.

## Goals / Non-Goals

**Goals:**

- Evidence-first closeout: every quality-bar item in `docs/pin-ready-checklist.md` is **met** or **not met** with a concrete path, CI run URL, or command.
- Standing Should-scope backlog under `openspec/backlog/` that survives archive (not only this change’s proposal).
- Honest triage: if nothing Must-scope is broken, say so; still fix tiny docs inaccuracies that would fail the quality bar (`openspec/README.md` still claims capability specs are structural placeholders after Days 2–8 shipped; README has no GitHub metadata section; `package.json` is still `0.0.0`).

**Non-Goals:**

- Spec deltas for product capabilities (this change uses `skip_specs: true`).
- Implementing any Should item, admin SPA, new flag types, multivariate experiments, or work in other repos.
- Rewriting the evaluate algorithm, Compose, demo-client, or CI unless a Must defect is proven.
- Calling the GitHub API to set About/topics.

## Decisions

### 1. Skip spec deltas

- **Choice:** `skip_specs: true`. Closeout docs are not product behavior; inventing a `pin-ready` capability would fail the “durable system behavior” rule.
- **Alternative:** Add a `pin-ready` spec. Rejected — `openspec validate` would then require SHALL/WHEN/THEN for a checklist file, which is process not product. Same pattern as beacon-watch Day 9 and courier-outbox Day 9.

### 2. Standing backlog path

- **Choice:** `openspec/backlog/should-scope.md` (proposal-only note; no tasks to implement). Archive moves the change folder but this file stays in-tree.
- **Alternative:** Only list Should items in this change’s `proposal.md`. Rejected — archive would bury the only backlog record.

### 3. Quality-bar evidence format

- **Choice:** Markdown tables with columns: item, status (`met` / `not met`), evidence. About/topics: do **not** call the API (Day 9 brief: known 403). Mark **not met (manual, owner sets in GitHub Settings)** with the intended blurb and topics, and add a README § Repository metadata fallback so the intended values are in-tree.
- **Alternative:** One `gh repo edit` attempt like courier-outbox/kickoff-club. Rejected — this brief forbids the call.
- **Alternative:** Claim About is met because README already lists the value story. Rejected — the bar is the GitHub repository metadata, not a README fallback.

### 4. Tiny Must-scope docs hygiene (not features)

- **Choice:** Add `openspec/specs/README.md` indexing shipped capabilities. Rewrite the stale “structural placeholders” sentence in `openspec/README.md`. Add a Day 9 closeout line to `openspec/project.md`. Add README § Repository metadata. Bump `package.json` `"version"` from `0.0.0` to `0.1.0` to match the optional pin tag.
- **Alternative:** Leave them stale. Rejected — “rules + agentic docs first” and an honest architecture/OpenSpec section would be weaker evidence.

### 5. Deferred Must vs Should

- **Choice:** Admin SPA, multivariate/string variants, experimentation stats, streaming/native SDKs, rule-builder UI, multi-region, hosted deploy, `RATE_LIMITED` (429), and NFR-PERF-001/002 as CI-failing gates stay Should. In-process evaluate microbench remains `continue-on-error`; HTTP p99 `scripts/bench-evaluate.sh` remains a local Compose path. Must FRs (projects, keys, flags, rules, evaluate, audit, cache, metrics, client docs) are already specified and tested.
- **Alternative:** Treat any of those as leftover Musts and implement them. Rejected — `openspec/config.yaml` and archived proposals marked them Should or out of MVP; implementing them is Should-scope.

### 6. Tag and merge order

- **Choice:** Open a ready PR from `chore/pin-ready`. Merge only after all CI jobs succeed on the PR head (including demo-client compose smoke). Merge locally as Christian Agila with `git merge --no-ff` (never the GitHub merge button/API). Archive on `main` as a direct commit (`openspec archive add-pin-ready-closeout --yes`; `--skip-specs` because skip_specs is already declared). Optional annotated `v0.1.0` on the post-archive `main` SHA if tagging is allowed.
- **Alternative:** Tag the PR head. Rejected — pin version should point at merged `main`.

## Risks / Trade-offs

- [GitHub About PATCH would 403] → Do not call it; record **not met (manual)** in the checklist.
- [No Must bugs exist] → Checklist triage section states “none found”; do not invent product work.
- [Co-author hook reintroduces trailers] → Local `commit-msg.cursor.co-author` is a no-op; verify every commit message before push.
- [Archive `--skip-specs` vs `--yes` only] → Prefer `--yes` first; add `--skip-specs` if the CLI still wants a spec sync that skip_specs already declined.
- [Concurrency-cancelled CI on the merge commit] → Judge the PR head, then wait for CI on main’s post-archive push.

## Migration Plan

Not applicable (no schema or API migration). Rollback is revert of the closeout commits on `main`.

## Open Questions

None that affect approach or tasks. Tag `v0.1.0` is optional per the Day 9 brief; attempt after archive if `git`/`gh` allow it.
