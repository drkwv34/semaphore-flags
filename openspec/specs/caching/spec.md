# caching

## Purpose

Optional Redis cache of compiled environment flag sets with invalidation before 2xx and graceful degrade.

SRS: FR-CACHE-001..004, NFR-REL-001

## Requirements

### Requirement: Placeholder until first change is archived

No Redis cache integration is implemented in `src/` yet. Normative requirements SHALL be added via an approved OpenSpec change (for example `add-cache-metrics`) and merged into this spec on archive. (FR-CACHE-001)

#### Scenario: Spec validates before implementation

- **WHEN** `openspec validate caching --type spec` runs on this repository
- **THEN** this capability spec passes structural validation
