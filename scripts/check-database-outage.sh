#!/usr/bin/env bash
# Isolated Compose smoke: the API process survives a Postgres outage (FR-OPS-001).
#
# Brings up a throwaway Compose project, warms /readyz (idle pool clients),
# stops Postgres, and asserts the same api container keeps serving /healthz 200
# and /readyz 503 without an increased RestartCount. Restores Postgres and
# waits for /readyz 200 without restarting api. Then restarts only api while
# Postgres is down and asserts /healthz 200.
#
# Does not target the default local demo project. Always `compose down -v`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Never inherit COMPOSE_PROJECT_NAME: trap cleanup would `down -v` a live demo stack.
PROJECT="${OUTAGE_PROJECT:-semaphore-outage-$$}"
API_PORT="${API_PORT:-$((18000 + RANDOM % 1000))}"
POSTGRES_PORT="${POSTGRES_PORT:-$((15432 + RANDOM % 1000))}"
BASE="http://127.0.0.1:${API_PORT}"
COMPOSE=(docker compose -p "$PROJECT")
OUTAGE_WAIT_SECS="${OUTAGE_WAIT_SECS:-25}"
RECOVERY_WAIT_SECS="${RECOVERY_WAIT_SECS:-60}"
UP_WAIT_SECS="${UP_WAIT_SECS:-180}"

log() { printf 'check-database-outage: %s\n' "$*"; }
die() { printf 'check-database-outage: FAIL: %s\n' "$*" >&2; exit 1; }

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

api_id() {
  local id
  id="$("${COMPOSE[@]}" ps -q api)"
  [[ -n "$id" ]] || die "api container id is empty"
  printf '%s' "$id"
}

restart_count() {
  docker inspect -f '{{.RestartCount}}' "$1"
}

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

mkdir -p .demo-keys
chmod 777 .demo-keys 2>/dev/null || true

export COMPOSE_PROJECT_NAME="$PROJECT"
export API_PORT POSTGRES_PORT

log "project=$PROJECT api_port=$API_PORT postgres_port=$POSTGRES_PORT"
"${COMPOSE[@]}" up --build -d --wait --wait-timeout "$UP_WAIT_SECS" api db \
  || die "compose up api/db failed"

wait_http "${BASE}/healthz" "200" 30
wait_http "${BASE}/readyz" "200" 30
log "warmed readiness (idle pool clients expected)"

CONTAINER_ID="$(api_id)"
BEFORE_RESTARTS="$(restart_count "$CONTAINER_ID")"
log "api id=${CONTAINER_ID:0:12} restart_count=${BEFORE_RESTARTS}"

log "stopping Postgres with idle connections"
"${COMPOSE[@]}" kill db || die "failed to kill db"

wait_http "${BASE}/healthz" "200" "$OUTAGE_WAIT_SECS"
wait_http "${BASE}/readyz" "503" "$OUTAGE_WAIT_SECS"

AFTER_ID="$(api_id)"
AFTER_RESTARTS="$(restart_count "$AFTER_ID")"
[[ "$AFTER_ID" == "$CONTAINER_ID" ]] || die "api container id changed ($CONTAINER_ID -> $AFTER_ID)"
[[ "$AFTER_RESTARTS" == "$BEFORE_RESTARTS" ]] \
  || die "api RestartCount increased ($BEFORE_RESTARTS -> $AFTER_RESTARTS)"
log "outage: same container, restart_count=${AFTER_RESTARTS}, healthz 200, readyz 503"

log "restoring Postgres"
"${COMPOSE[@]}" start db || die "failed to start db"
wait_http "${BASE}/readyz" "200" "$RECOVERY_WAIT_SECS"
RECOVERED_ID="$(api_id)"
[[ "$RECOVERED_ID" == "$CONTAINER_ID" ]] || die "api restarted during recovery"
log "recovery: same container, readyz 200"

log "restarting only api while Postgres is down"
"${COMPOSE[@]}" kill db || die "failed to kill db before api restart"
"${COMPOSE[@]}" up -d --no-deps --force-recreate api \
  || die "failed to recreate api without dependencies"
wait_http "${BASE}/healthz" "200" "$OUTAGE_WAIT_SECS"
wait_http "${BASE}/readyz" "503" "$OUTAGE_WAIT_SECS"

API_CMD="$("${COMPOSE[@]}" config --format json | python3 -c 'import json,sys; print(" ".join(json.load(sys.stdin)["services"]["api"]["command"]))')"
[[ "$API_CMD" == *migrate* ]] && die "api command still runs migrate: $API_CMD"
[[ "$API_CMD" == *seed* ]] && die "api command still runs seed: $API_CMD"
[[ "$API_CMD" == *serve* ]] || die "api command does not run serve: $API_CMD"

log "PASS: process survived outage, recovered without restart, serve-only api restart"
