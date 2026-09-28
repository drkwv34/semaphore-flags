# OpenSpec (Fission-AI)

This repository uses the [Fission-AI OpenSpec](https://github.com/Fission-AI/OpenSpec) framework for
spec-driven changes. The CLI is `@fission-ai/openspec`; Cursor is wired via generated skills and
`/opsx-*` commands.

## Layout

```
openspec/
  config.yaml           # schema, project context, artifact rules (read by CLI + agents)
  specs/<capability>/   # source of truth: what the system does today
    spec.md
  changes/<change-id>/  # active proposals (created by CLI or /opsx-propose)
  changes/archive/      # merged changes (YYYY-MM-DD-<change-id>/)
.cursor/
  skills/openspec-*     # agent skills (propose, apply, archive, …)
  commands/opsx-*.md    # slash commands (/opsx-propose, /opsx-apply, …)
```

Legacy `openspec/project.md` is retained for links from older docs; planning context lives in
`openspec/config.yaml` (`context:`).

## Install CLI

Node ≥ 20.19:

```bash
npm install -g @fission-ai/openspec@latest
export PATH="$(npm prefix -g)/bin:$PATH"
openspec --version
```

Refresh Cursor wiring after CLI upgrades:

```bash
openspec update --tools cursor --force --no-animation
```

## Workflow in Cursor

| Step                       | Cursor          | Skill                     |
| -------------------------- | --------------- | ------------------------- |
| Propose a change           | `/opsx-propose` | `openspec-propose`        |
| Implement from `tasks.md`  | `/opsx-apply`   | `openspec-apply-change`   |
| Update an in-flight change | `/opsx-update`  | `openspec-update-change`  |
| Explore / clarify          | `/opsx-explore` | `openspec-explore`        |
| Sync specs from changes    | `/opsx-sync`    | `openspec-sync-specs`     |
| Archive after merge        | `/opsx-archive` | `openspec-archive-change` |

Typical loop:

1. **Propose** — `/opsx-propose` (or `openspec new change <id>`) creates `changes/<change-id>/` with
   `proposal.md`, `tasks.md`, optional `design.md`, and spec deltas under `changes/.../specs/`.
2. **Approve** — review in PR; approval = merged or explicitly acknowledged.
3. **Apply** — `/opsx-apply`; tick `tasks.md`; no non-trivial `src/` work without an approved change.
4. **Validate** — `openspec validate <change-id> --strict` (and `openspec validate --all` before merge).
5. **Archive** — `/opsx-archive` or `openspec archive <change-id> --yes` folds deltas into
   `specs/<capability>/spec.md` and moves the folder to `changes/archive/`.

## CLI cheatsheet

```bash
openspec list                    # active changes
openspec list --specs            # capabilities
openspec validate --all          # all specs + changes
openspec validate <id> --strict  # one change
openspec show <capability> --type spec
openspec context --json          # resolved root + config context
```

## Capabilities

| Capability        | SRS requirements        |
| ----------------- | ----------------------- |
| `projects-keys`   | FR-PROJ-001..003        |
| `flags`           | FR-FLAG-001..004        |
| `targeting-rules` | FR-RULE-001..004        |
| `evaluation`      | FR-EVAL-001..005        |
| `audit`           | FR-AUD-001..004         |
| `caching`         | FR-CACHE-001..004       |
| `ops`             | FR-OPS-001..003, FR-ERR |
| `client-guidance` | FR-DOC-001              |

Capability specs currently hold structural placeholders until the first feature changes are proposed,
implemented, and archived into `specs/`.
