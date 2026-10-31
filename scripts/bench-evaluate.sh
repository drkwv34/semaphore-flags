#!/usr/bin/env bash
# HTTP evaluate p99 against a local Compose stack with a warm cache (NFR-PERF-002).
#
# Prerequisites:
#   docker compose --profile redis up --build --wait
#   Copy the evaluate key from `docker compose logs api` (first boot / seed).
#
# Usage:
#   EVALUATE_KEY=sf_eval_… ./scripts/bench-evaluate.sh
#
# Target: p99 < 50ms after a warm cache. This script prints results; it does
# not fail CI (run it locally against Compose).
set -euo pipefail

URL="${SEMAPHORE_URL:-http://localhost:8080}"
KEY="${EVALUATE_KEY:-}"
ITERS="${BENCH_ITERS:-200}"
WARM="${BENCH_WARM:-20}"
TARGET_MS=50
BODY='{"flag_key":"kill_switch","env":"prod","user":{"id":"u1"}}'

if [[ -z "$KEY" ]]; then
  echo "bench-evaluate.sh: set EVALUATE_KEY to a seeded evaluate key" >&2
  exit 2
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

echo "bench-evaluate.sh: warming cache ($WARM requests) against ${URL}/v1/evaluate"

warm_i=0
while [[ "$warm_i" -lt "$WARM" ]]; do
  curl -sS -o /dev/null \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "${URL}/v1/evaluate"
  warm_i=$((warm_i + 1))
done

echo "bench-evaluate.sh: measuring $ITERS requests (target p99 < ${TARGET_MS}ms, warm cache)"

i=0
while [[ "$i" -lt "$ITERS" ]]; do
  # curl -w '%{time_total}' is seconds; convert to ms in awk below.
  curl -sS -o /dev/null -w '%{time_total}\n' \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "${URL}/v1/evaluate" >>"$tmp"
  i=$((i + 1))
done

awk -v target="$TARGET_MS" -v iters="$ITERS" '
  {
    ms = $1 * 1000
    samples[NR] = ms
    sum += ms
  }
  END {
    n = NR
    if (n == 0) {
      print "bench-evaluate.sh: no samples" > "/dev/stderr"
      exit 1
    }
    asort(samples)
    idx = int(n * 0.99)
    if (idx < 1) idx = 1
    if (idx > n) idx = n
    p99 = samples[idx]
    mean = sum / n
    printf "bench-evaluate.sh: %d HTTP calls, mean %.3fms, p99 %.3fms (target p99 < %.0fms, warm cache)\n", iters, mean, p99, target
    if (p99 >= target) {
      printf "bench-evaluate.sh: WARN p99 %.3fms is at or above %.0fms\n", p99, target > "/dev/stderr"
    }
  }
' "$tmp"
