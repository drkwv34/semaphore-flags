# Tasks

## 1. Portable bench script

- [ ] 1.1 Add `scripts/bench-evaluate.test.ts` that runs the real script with PATH-controlled mawk and a curl fixture: missing `EVALUATE_KEY` exits non-zero; `asort` currently exits 2 under mawk; one sample and 200 unsorted samples produce hand-computed mean/p99; non-200 HTTP exits non-zero (NFR-PERF-002)
- [ ] 1.2 Replace `asort` with `LC_ALL=C sort -n` plus POSIX awk; keep mean/p99 print, ms units, 50ms target, and warn-without-fail; check HTTP 200 per sample; do not add gawk; verify the tests in 1.1 pass under mawk (NFR-PERF-002)

## 2. Docs

- [ ] 2.1 Update README / ops notes only if prerequisites change (POSIX awk, no gawk); keep the in-process microbench job unchanged (`continue-on-error`); verify `.github/workflows/ci.yml` still runs `node scripts/bench-evaluate.mjs` as a soft step (NFR-PERF-001, NFR-PERF-002, NFR-MAINT-001)

## Verification

```sh
pnpm test:unit -- scripts/bench-evaluate.test.ts
PATH="$(command -v mawk | xargs dirname):$PATH" EVALUATE_KEY=unused BENCH_ITERS=1 BENCH_WARM=0 ./scripts/bench-evaluate.sh || true
openspec validate make-evaluate-benchmark-portable --strict
```
