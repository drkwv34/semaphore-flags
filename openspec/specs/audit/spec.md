# audit

## Purpose

Append-only audit log of every admin mutation, readable by admin keys only.

SRS: FR-AUD-001..004

## Requirements

### Requirement: Placeholder until first change is archived

No audit persistence or query API is implemented in `src/` yet. Normative requirements SHALL be added via an approved OpenSpec change (for example `add-flags-rules-audit`) and merged into this spec on archive. (FR-AUD-001)

#### Scenario: Spec validates before implementation

- **WHEN** `openspec validate audit --type spec` runs on this repository
- **THEN** this capability spec passes structural validation
