#!/usr/bin/env bash
# Isolated Compose smoke: README `docker compose up --build --wait` exits 0
# without starting demo-client, and an explicit demo-client run prints reason
# codes (NFR-PORT-001).
#
# Does not target the default local demo project. Always `compose down -v`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Never inherit COMPOSE_PROJECT_NAME: trap cleanup would `down -v` a live demo stack.
PROJECT="${STARTUP_PROJECT:-semaphore-startup-$$}"
API_PORT="${API_PORT:-$((18000 + RANDOM % 1000))}"
POSTGRES_PORT="${POSTGRES_PORT:-$((15432 + RANDOM % 1000))}"
REDIS_PORT="${REDIS_PORT:-$((16379 + RANDOM % 1000))}"
BASE="http://127.0.0.1:${API_PORT}"
COMPOSE=(docker compose -p "$PROJECT")
UP_WAIT_SECS="${UP_WAIT_SECS:-180}"

log() { printf 'check-compose-startup: %s\n' "$*"; }
die() { printf 'check-compose-startup: FAIL: %s\n' "$*" >&2; exit 1; }

http_code() {
  local url="$1" code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || true)"
  [[ -n "$code" ]] || code="000"
  printf '%s' "$code"
}

wait_http() {
  local url="$1" want="$2" timeout="$3"
  local start now code
  start="$(date +%s)"
  while true; do
    code="$(http_code "$url")"
    if [[ "$code" == "$want" ]]; then
      return 0
    fi
    now="$(date +%s)"
    if (( now - start >= timeout )); then
      die "timeout waiting for $url == $want (last HTTP $code)"
    fi
    sleep 1
  done
}

service_names() {
  local extra=()
  if [[ $# -gt 0 ]]; then
    extra=("$@")
  fi
  "${COMPOSE[@]}" "${extra[@]}" config --format json | python3 -c '
import json, sys
cfg = json.load(sys.stdin)
print("\n".join(sorted(cfg.get("services", {}))))
'
}

assert_default_omits_demo() {
  local names
  names="$(service_names)"
  printf '%s\n' "$names" | grep -qx 'demo-client' && die "default compose config includes demo-client"
  printf '%s\n' "$names" | grep -qx 'api' || die "default compose config missing api"
  printf '%s\n' "$names" | grep -qx 'db' || die "default compose config missing db"
  log "default services omit demo-client"
}

assert_profile_includes_demo() {
  local names
  names="$(service_names --profile demo)"
  printf '%s\n' "$names" | grep -qx 'demo-client' || die "--profile demo config missing demo-client"
  log "profile demo includes demo-client"
}

cleanup() {
  "${COMPOSE[@]}" --profile cache --profile redis --profile demo down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

mkdir -p .demo-keys
chmod 777 .demo-keys 2>/dev/null || true

export COMPOSE_PROJECT_NAME="$PROJECT"
export API_PORT POSTGRES_PORT REDIS_PORT

log "project=$PROJECT api_port=$API_PORT postgres_port=$POSTGRES_PORT redis_port=$REDIS_PORT"

assert_default_omits_demo
assert_profile_includes_demo
"${COMPOSE[@]}" --profile cache config --quiet || die "compose --profile cache config failed"
"${COMPOSE[@]}" --profile redis config --quiet || die "compose --profile redis config failed"

up_and_wait() {
  local label="$1"
  shift
  log "up --wait ($label)"
  "${COMPOSE[@]}" "$@" up --build --wait --wait-timeout "$UP_WAIT_SECS" \
    || die "compose up --wait failed ($label)"
  wait_http "${BASE}/healthz" "200" 30
  local running
  running="$("${COMPOSE[@]}" ps --status running --services)"
  printf '%s\n' "$running" | grep -qx 'demo-client' \
    && die "demo-client is running after $label up --wait"
  printf '%s\n' "$running" | grep -qx 'api' || die "api is not running after $label up --wait"
}

log "README default up"
up_and_wait "default"

log "explicit demo-client"
DEMO_LOG="$(mktemp)"
"${COMPOSE[@]}" run --rm demo-client | tee "$DEMO_LOG" \
  || die "demo-client run failed"
grep -E 'kill_payments .+ false disabled' "$DEMO_LOG" >/dev/null \
  || die "demo-client missing kill_payments disabled"
grep -E 'beta_ui demo_in true rule_match' "$DEMO_LOG" >/dev/null \
  || die "demo-client missing beta_ui rule_match"
grep -Eq 'beta_ui .+ (percentage_in|percentage_out)' "$DEMO_LOG" \
  || die "demo-client missing beta_ui percentage reason"
rm -f "$DEMO_LOG"
log "demo-client reason codes ok"

"${COMPOSE[@]}" down -v --remove-orphans >/dev/null || die "down after default up failed"

export API_REDIS_URL="redis://redis:6379"
log "cache profile up"
up_and_wait "cache" --profile cache
running_cache="$("${COMPOSE[@]}" --profile cache ps --status running --services)"
printf '%s\n' "$running_cache" | grep -qx 'redis' || die "redis is not running after cache profile up"
"${COMPOSE[@]}" --profile cache down -v --remove-orphans >/dev/null || die "down after cache up failed"

log "redis profile up"
up_and_wait "redis" --profile redis
running_redis="$("${COMPOSE[@]}" --profile redis ps --status running --services)"
printf '%s\n' "$running_redis" | grep -qx 'redis' || die "redis is not running after redis profile up"
"${COMPOSE[@]}" --profile redis down -v --remove-orphans >/dev/null || die "down after redis up failed"
unset API_REDIS_URL

log "PASS: default/cache/redis up --wait exit 0; demo-client is opt-in"
