# OpenSpec workflow for agents

Read `openspec/project.md`, then the relevant `openspec/specs/<capability>/spec.md`, before
writing code.

## When a proposal is required

Required: new endpoints, schema/migration changes, changes to evaluate semantics or reasons,
new error codes, cache key/TTL changes, new metrics, contract fixture changes, new dependencies
on external services.

Not required: typo fixes, refactors with no behavior change, test-only additions, dependency
patch bumps, CI tweaks.

## Creating a change

```
openspec/changes/<change-id>/
  proposal.md
  tasks.md
  specs/<capability>/spec.md
```

`proposal.md`:

```markdown
# <change-id>

## Why

One or two sentences. Cite SRS ids.

## What changes

- Bullet list of behavior changes. Mark breaking changes with **BREAKING**.

## Impact

- Capabilities: `evaluation`, …
- Code: `src/domain/evaluate`, `src/api/routes/evaluate.ts`, …
- Migrations: yes/no
- Contracts: fixtures added/changed
```

`tasks.md`:

```markdown
## 1. Implementation

- [ ] 1.1 …

## 2. Verification

- [ ] 2.1 Unit / contract / integration tests listed here
```

Spec delta (`specs/<capability>/spec.md`):

```markdown
## ADDED Requirements

### Requirement: Kill switch short-circuits evaluation

The system SHALL return the flag's `default_value` with reason `disabled` when the environment
config has `enabled = false`, without evaluating rules or rollout. (FR-EVAL-002)

#### Scenario: Disabled flag with a matching rule

- **WHEN** `checkout_v2` is disabled in `prod` and a rule would match the user
- **THEN** the response is `{ "value": false, "reason": "disabled" }`
```

Rules for deltas:

- Use `## ADDED`, `## MODIFIED` or `## REMOVED Requirements`.
- Every requirement uses SHALL/MUST and has at least one `#### Scenario:`.
- `MODIFIED` repeats the full requirement text, not a diff.

## Implementing

- Keep `tasks.md` checkboxes current in the same PR.
- If implementation forces a spec change, edit the delta first and call it out in the PR.
- The PR description links the change folder.

## Archiving

After the PR merges: merge deltas into `openspec/specs/<capability>/spec.md`, then
`git mv openspec/changes/<change-id> openspec/changes/archive/YYYY-MM-DD-<change-id>`.
