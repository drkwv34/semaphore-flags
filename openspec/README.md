# OpenSpec

Spec-driven change process for semaphore-flags. Nothing non-trivial lands in `src/` without an
approved change proposal here first.

```
openspec/
  project.md              # product context, stack, conventions (read first)
  AGENTS.md               # step-by-step workflow for humans and coding agents
  specs/<capability>/     # source of truth: what the system does TODAY
    spec.md
  changes/<change-id>/    # proposed deltas, one folder per change
    proposal.md           # why + what + impact
    tasks.md              # implementation checklist
    design.md             # optional: trade-offs, only when non-obvious
    specs/<capability>/spec.md   # ADDED / MODIFIED / REMOVED requirements
  changes/archive/        # merged changes, prefixed with YYYY-MM-DD-
```

## Lifecycle

1. **Propose** — create `changes/<change-id>/` (kebab-case, verb-led: `add-evaluate-core`).
   Write `proposal.md`, `tasks.md` and spec deltas. Reference SRS requirement ids (`FR-EVAL-002`).
2. **Approve** — the proposal is reviewed in its own PR (or the first commit of the feature PR,
   titled `docs(openspec): propose <change-id>`). Approval = merged or explicitly acked in PR.
3. **Implement** — work through `tasks.md`, checking items off. Code, tests and fixtures must
   match the spec deltas; if reality diverges, update the proposal first.
4. **Archive** — after merge, fold the deltas into `specs/<capability>/spec.md` and move the
   change folder to `changes/archive/YYYY-MM-DD-<change-id>/`.

If the [OpenSpec CLI](https://github.com/Fission-AI/OpenSpec) is installed, `openspec list`,
`openspec validate <change-id> --strict` and `openspec archive <change-id>` automate steps 1–4.
The layout here is compatible with it, but the CLI is not required.

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
