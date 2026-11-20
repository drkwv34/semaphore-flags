# Spec Delta

## MODIFIED Requirements

### Requirement: HTTP evaluate bench is documented for Compose

`scripts/bench-evaluate.sh` SHALL measure HTTP evaluate p99 against a local Compose stack with a warm cache, targeting under 50ms, using only POSIX `sort` and POSIX `awk` (including mawk). It SHALL print measured mean and p99 in milliseconds. Non-200 evaluate responses MUST NOT be counted as successful samples. Missing `EVALUATE_KEY` SHALL exit non-zero. The script MAY warn when p99 is at or above 50ms and MUST NOT require gawk. (NFR-PERF-002)

#### Scenario: Script documents the HTTP budget

- **WHEN** an operator reads or runs `scripts/bench-evaluate.sh`
- **THEN** the script states the warm-cache HTTP p99 target of 50ms and prints measured p99

#### Scenario: mawk computes mean and p99

- **WHEN** `awk` on PATH is mawk and the script is given a successful curl fixture of known times
- **THEN** the process exits 0 and printed mean and p99 match a POSIX numeric sort of those samples using `idx = int(n * 0.99)` clamped to `1..n`

#### Scenario: Failed HTTP is not a successful sample

- **WHEN** an evaluate call returns a non-200 status
- **THEN** the script exits non-zero and does not report that timing as a successful mean/p99 sample
