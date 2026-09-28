# targeting-rules

## Purpose

Ordered attribute predicates; first match wins; missing attributes never match and never throw.

SRS: FR-RULE-001..004

## Requirements

### Requirement: Placeholder until first change is archived

No targeting-rule model or evaluation is implemented in `src/` yet. Normative requirements SHALL be added via an approved OpenSpec change (for example `add-flags-rules-audit`) and merged into this spec on archive. (FR-RULE-001)

#### Scenario: Spec validates before implementation

- **WHEN** `openspec validate targeting-rules --type spec` runs on this repository
- **THEN** this capability spec passes structural validation
