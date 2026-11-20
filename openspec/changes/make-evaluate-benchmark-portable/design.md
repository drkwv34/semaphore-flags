# Design

## Context

See `proposal.md` for motivation. `scripts/bench-evaluate.sh` warms `POST /v1/evaluate`, records
`curl -w '%{time_total}'` seconds, then uses `awk asort(samples)` and `idx = int(n * 0.99)`
(clamped to 1..n) for p99. Debian/Ubuntu `awk` is mawk, which has no `asort`. The in-process
`scripts/bench-evaluate.mjs` is unchanged. NFR-PERF-002 stays a local/soft measurement.

## Goals / Non-Goals

**Goals:**

- Same printed mean/p99/units/target on mawk and gawk.
- Preserve the existing p99 rank formula.
- Do not treat failed HTTP as success.
- Test the real script under mawk with a curl fixture.

**Non-Goals:**

- Installing gawk.
- Failing CI when p99 ≥ 50ms.
- Changing evaluate JSON or the 10ms in-process budget.

## Decisions

### 1. `LC_ALL=C sort -n` then POSIX awk reduction

- **Choice:** Write one seconds-sample per line. `LC_ALL=C sort -n` for a stable numeric order.
  POSIX awk reads 1-indexed `NR`, converts to ms, sums mean, and takes `samples[idx]` with
  `idx = int(n * 0.99)` clamped to `1..n` — the same rank as gawk `asort`.
- **Why:** No arrays-sort extension. Matches today’s p99 for the same multiset.
- **Alternative:** Insertion sort in awk. Acceptable but slower and easier to get 0- vs 1-index
  wrong. External `sort` is the usual POSIX reduction.
- **Alternative:** Require gawk in README. Rejected: hidden dependency; Ubuntu default is mawk.

### 2. Non-200 evaluate is a script failure

- **Choice:** Each measured curl writes HTTP status and time. If status is not 200, exit
  non-zero without printing a success mean/p99. Warm-up uses the same check.
- **Why:** Brief forbids counting failed HTTP timings as service success. `-o /dev/null` today
  ignores 401/404/5xx.
- **Alternative:** Skip failed samples and continue. Rejected: silently optimistic p99.

### 3. Vitest drives the real script with PATH fixtures

- **Choice:** `scripts/bench-evaluate.test.ts` in the existing unit project (`scripts/**/*.test.ts`).
  Temporary `PATH` provides `curl` (emits configured times/status) and uses system `awk` (mawk
  on Ubuntu). Cover: missing `EVALUATE_KEY` exit 2; one sample; unsorted 200-sample fixture with
  hand-computed mean/p99; non-200 exit non-zero. Optional live HTTP smoke when
  `SEMAPHORE_URL`/`EVALUATE_KEY` are set, not required for unit CI.
- **Why:** Regression must fail on `asort` and pass after the POSIX path without a live stack.
- **Alternative:** Only document mawk. Rejected: no merge gate.

## Risks / Trade-offs

- [sort vs asort on ties] → Numeric values are equal; rank is stable enough for p99.
- [locale decimal commas] → `LC_ALL=C` on sort; curl `time_total` is C locale.
- [p99 formula is not nearest-rank 0.99*(n+1)] → Preserve current `int(n * 0.99)` by contract.

## Migration Plan

Replace the awk block in place. Operators re-run the same command. Rollback restores `asort`.

## Open Questions

None.
