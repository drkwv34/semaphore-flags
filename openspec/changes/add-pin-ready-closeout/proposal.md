# Proposal

| Field            | Value                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Status           | approved                                                                                                              |
| Approved by / on | Christian Agila / 2026-11-05                                                                                          |
| Capabilities     | none (`skip_specs: true`)                                                                                             |
| FR / NFR IDs     | NFR-PORT-001, NFR-MAINT-001, NFR-DOC-001 (evidence only); leftover Must FRs already specified under `openspec/specs/` |

## Why

semaphore-flags is at the final pin-ready closeout (Day 9). Reviewers need evidence that Must-scope product work is complete, leftover Must bugs are triaged, Should-scope items are recorded without being implemented, and every portfolio quality-bar item is marked met or not met with file/CI/command evidence.

## What Changes

- Triage leftover **Must** bugs only (SRS Must FRs not met, open GitHub issues, failing or flaky checks, obvious `TODO`/`FIXME` in product code). Fix small real defects; list anything deferred with a reason. No new product features and no Should-scope builds.
- Commit `docs/pin-ready-checklist.md` covering every portfolio quality-bar item with **met** / **not met** plus evidence (file path, CI run URL, or command).
- Record Should-scope items as a standing OpenSpec backlog note under `openspec/backlog/should-scope.md` (proposal-only; do **not** implement them).
- Do **not** call the GitHub API to set About/topics (known 403). Record **not met (manual, owner sets in GitHub Settings)** with the intended blurb and topics: About `Feature flags and kill switches with targeting rules, percentage rollouts, audit logs, and a fast HTTP evaluate API.` Topics `typescript, feature-flags, postgresql, redis, docker, github-actions, prometheus, platform, openapi`.
- Optional annotated tag `v0.1.0` on the merged `main` commit (GitHub release only if the API allows it without permission loops).
- Keep `main` green after merge; archive this change on `main` with the Fission-AI OpenSpec CLI.

No **BREAKING** API or schema changes are planned. Product capabilities already specified under `openspec/specs/` stay as-is unless a Must-scope defect requires a tiny fix that does not change requirements.

## Capabilities

### New Capabilities

- _(none — this change is pin-ready closeout documentation and triage, not a new product capability)_

### Modified Capabilities

- _(none — no spec-level product behavior changes; Should items stay unimplemented)_

This change sets `skip_specs: true` in `.openspec.yaml` because it is docs/process closeout: a quality-bar checklist, a Should-scope backlog note, and Must-only defect triage. Inventing a `pin-ready` product spec would not describe system behavior.

## Impact

- **Capabilities:** none (skip_specs). Existing Must specs under `openspec/specs/{projects-keys,flags,targeting-rules,evaluation,audit,caching,ops,client-guidance}` stay unchanged.
- **Code paths:** `docs/pin-ready-checklist.md` (new); `openspec/backlog/should-scope.md` (new standing backlog; not a spec); README repository-metadata section if missing; `openspec/README.md` / `openspec/project.md` / `openspec/specs/README.md` hygiene if stale; `package.json` version if still `0.0.0`.
- **APIs:** none.
- **Dependencies:** none.
- **CI:** keep every existing job (verify, image, demo-client compose smoke). Do not delete, skip, or loosen any check (NFR-MAINT-001).
- **Docs:** pin-ready checklist, Should backlog, tiny OpenSpec/README hygiene.
- Optional `v0.1.0` tag after merge.

## Out of scope

- New semaphore-flags product features beyond Must triage.
- Should-scope builds (React admin SPA, new flag types, multivariate experiments, streaming/native SDKs, rule-builder UI, multi-region, hosted deploy).
- Kickoff-club / courier-outbox / beacon-watch / profile-readme / lodestone work.
- Setting GitHub About/topics via API.
- Deleting, skipping, or loosening a CI job.
- History rewrite or `Co-authored-by` trailers.
