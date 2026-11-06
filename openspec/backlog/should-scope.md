# Should-scope backlog (proposal-only)

This note records **Should**-priority SRS items that are **not** in the v0.1.0 pin. It is an OpenSpec backlog, not a change to implement.

**Do not implement any item here** without a new OpenSpec change (`openspec new change …`) that is reviewed and applied separately. Day 9 `add-pin-ready-closeout` records this list only.

Sources: archived change proposals under `openspec/changes/archive/`, `openspec/config.yaml` out-of-scope, and capability status in `openspec/specs/README.md`.

| ID / name                         | Summary                                                                                                                          | Recorded in                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Admin SPA / demo admin page       | Optional SRS §2.3 Should UI. HTTP is the SDK; `/docs` is Swagger only.                                                           | `openspec/config.yaml`; `docs/architecture/api-conventions.md`; `docs/architecture/README.md`                                   |
| Multivariate / string variants    | Boolean flags only. `variant` is `"on"`/`"off"` derived from `value`.                                                            | `openspec/config.yaml`; `openspec/project.md`; `openspec/changes/archive/2026-10-27-add-evaluate-core/proposal.md`              |
| Experimentation stats             | No experiment assignment, p-values, or holdouts.                                                                                 | `openspec/config.yaml`; `openspec/project.md`                                                                                   |
| Streaming / native SDKs           | Clients call `POST /v1/evaluate` over HTTP.                                                                                      | `openspec/config.yaml`; `openspec/specs/client-guidance/spec.md`                                                                |
| Rule-builder UI                   | Rules are JSON on `PUT /v1/flags/:key/envs/:env`.                                                                                | `openspec/config.yaml`; `docs/architecture/README.md`                                                                           |
| Multi-region replication          | Single-region Postgres source of truth.                                                                                          | `openspec/config.yaml`; `openspec/project.md`                                                                                   |
| Hosted deployment                 | Compose local + GitHub Actions only. No production host.                                                                         | Day 8/9 briefs; `openspec/changes/archive/2026-11-01-add-readme-client-docs/proposal.md`                                        |
| `RATE_LIMITED` (429)              | Planned error code; add only with an approved rate-limit proposal.                                                               | `docs/architecture/error-handling.md`                                                                                           |
| NFR-PERF-001 as a CI-failing gate | In-process evaluate p99 < 10ms. `scripts/bench-evaluate.mjs` runs in CI with `continue-on-error: true`.                          | `.github/workflows/ci.yml`; `openspec/specs/ops/spec.md`; `openspec/changes/archive/2026-10-31-add-contract-tests-ci/design.md` |
| NFR-PERF-002 as a CI-failing gate | HTTP evaluate p99 < 50ms against local Compose with a warm cache. `scripts/bench-evaluate.sh` is a local path, not a merge gate. | `openspec/specs/ops/spec.md`; `docs/architecture/testing-strategy.md`                                                           |
| Audit retention / purge           | Append-only forever; no sweeper.                                                                                                 | `openspec/changes/archive/2026-10-28-add-evaluate-batch-audit-read/proposal.md`                                                 |

Must-scope capabilities already specified under `openspec/specs/` (projects-keys, flags, targeting-rules, evaluation, audit, caching, ops, client-guidance) remain the pin contract.

None of the rows above are implemented by `add-pin-ready-closeout`.
