# Proposal

## Why

`scripts/bench-evaluate.sh` computes p99 with `awk asort()`, a gawk extension. On systems where
`awk` is mawk (Debian/Ubuntu default), the script exits 2 and never prints mean/p99, so the
documented NFR-PERF-002 HTTP budget cannot be measured. CI only runs the in-process Node
microbench, so this was not caught. (NFR-PERF-002)

## What Changes

- Sort samples with locale-stable numeric `sort` and reduce mean/p99 in POSIX awk. Keep the
  existing mean/p99 printout, millisecond units, and warm-cache target of 50ms.
- Keep a budget warning when p99 is at or above 50ms; do not turn the HTTP bench into a failing
  CI gate or install gawk as a hidden dependency.
- Reject non-200 evaluate responses so failed HTTP timings are not reported as service success.
- Add a unit test that runs the real script under mawk with a curl fixture of known times.

Out of scope: changing the in-process `bench-evaluate.mjs` budget, making NFR-PERF-002 a merge
gate, rewriting evaluate.

## Capabilities

### New Capabilities

- (none — reuse `ops`)

### Modified Capabilities

- `ops`: the HTTP evaluate bench MUST run with POSIX `awk` (including mawk) and MUST print
  mean and p99 against the 50ms warm-cache target. (NFR-PERF-002)

## Impact

- **Capabilities:** `ops`.
- **Code paths:** `scripts/bench-evaluate.sh`; `scripts/bench-evaluate.test.ts` (Vitest unit
  include already covers `scripts/**/*.test.ts`); README bench notes if prerequisites change;
  `.github/workflows/ci.yml` only if a portable smoke is added without loosening jobs.
- **Tests:** PATH-controlled mawk + curl fixture (one sample, 200 samples, unsorted, missing
  key exit non-zero, non-200 HTTP is not success). Optional warm-stack HTTP smoke.
- **APIs:** none.
- **Dependencies:** none (no gawk).
- **CI:** do not delete, skip, or loosen jobs (NFR-MAINT-001).
