# Specs (current truth)

One folder per capability, each with a `spec.md` describing behavior that is **shipped on `main`**. Requirements appear here only after a change that implements them is merged and archived.

| Capability                       | Folder             | SRS requirements                                                                                       | Status                                                                                                                                          |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects, API keys, environments | `projects-keys/`   | FR-PROJ-001..003, NFR-SEC-001                                                                          | Project + salt, admin vs evaluate keys, default `dev`/`staging`/`prod`                                                                          |
| Flags                            | `flags/`           | FR-FLAG-001..004                                                                                       | Boolean flags, per-env config, `client_fallback`, soft archive                                                                                  |
| Targeting rules                  | `targeting-rules/` | FR-RULE-001..004                                                                                       | Priority-ordered predicates; missing attribute is non-match                                                                                     |
| Evaluation                       | `evaluation/`      | FR-EVAL-001..005                                                                                       | Single + batch HTTP; FR-EVAL-002 order; goldens gate merges                                                                                     |
| Audit                            | `audit/`           | FR-AUD-001..004                                                                                        | Same-tx append-only `audit_events`; list with cursor pagination                                                                                 |
| Caching                          | `caching/`         | FR-CACHE-001..004                                                                                      | Redis compiled snapshot TTL 60s; invalidate after commit; Redis-down degrades                                                                   |
| Ops                              | `ops/`             | FR-OPS-001..003, FR-ERR, NFR-OBS-001, NFR-MAINT-001..002, NFR-PERF-001..002, NFR-DOC-001, NFR-PORT-001 | Health, metrics, OpenAPI, CI pyramid, Compose demo-client, README platform story. NFR-PERF-001/002 are local/soft benches, not failing CI gates |
| Client guidance                  | `client-guidance/` | FR-DOC-001, NFR-DOC-001                                                                                | README Client integration: timeouts, fallback, kill-switch fail-closed, ≤10s cache, never block boot                                            |

Admin SPA, multivariate variants, experimentation stats, streaming/native SDKs, rule-builder UI, multi-region, hosted deploy, and `RATE_LIMITED` (429) are Should / out of MVP. See [`openspec/backlog/should-scope.md`](../backlog/should-scope.md).

## Suggested change order

1. ~~`add-projects-keys-envs`~~ archived 2026-10-22.
2. ~~`add-flags-rules-audit`~~ archived 2026-10-23.
3. ~~`add-evaluate-core`~~ archived 2026-10-27.
4. ~~`add-evaluate-batch-audit-read`~~ archived 2026-10-28.
5. ~~`add-cache-metrics`~~ archived 2026-10-29.
6. ~~`add-contract-tests-ci`~~ archived 2026-10-31.
7. ~~`add-readme-client-docs`~~ archived 2026-11-01.
8. ~~`add-pin-ready-closeout`~~ (this change; archive after merge).

Format for a capability `spec.md`:

```markdown
# <capability>

## Purpose

One paragraph.

## Requirements

### Requirement: Short title

The system SHALL ...

#### Scenario: Descriptive name

- **WHEN** ...
- **THEN** ...
```
