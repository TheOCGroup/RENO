#!/bin/sh
# OCG 3D ENGINE — in-pod spend watchdog (Phase 9.2)
#
# Runs INSIDE the Runpod pod so that it keeps enforcing the runtime limit even
# when the founder's/operator's control session disconnects or crashes.
#
# It requests a pod STOP (or TERMINATE) via the Runpod API when either:
#   - wall-clock runtime exceeds OCG_POD_MAX_RUNTIME_SECONDS (mandatory), or
#   - no 3D job activity for OCG_POD_IDLE_TIMEOUT_SECONDS (optional, default 900).
#
# IMPORTANT LIMITATIONS (must be repeated in every report):
#   - A stop request is NOT a guaranteed billing cutoff. Runpod bills GPU time
#     until the pod actually reaches a stopped/terminated state, and a stopped
#     pod continues to bill its volume / container disk until terminated.
#   - If the Runpod API is unreachable from inside the pod, the stop request can
#     fail; the out-of-pod guard (scripts/gpu_session_guard.mjs) is the second
#     independent layer, and a low prepaid account balance is the only hard
#     monetary ceiling.
#
# Required env (injected by Runpod or the operator):
#   RUNPOD_POD_ID, RUNPOD_API_KEY, OCG_POD_MAX_RUNTIME_SECONDS
# Optional env:
#   OCG_POD_IDLE_TIMEOUT_SECONDS (default 900), OCG_POD_STOP_ACTION (stop|terminate,
#   default terminate), OCG_ACTIVITY_FILE (default /tmp/ocg-3d-last-activity),
#   OCG_WATCHDOG_POLL_SECONDS (default 15), OCG_WATCHDOG_DRY_RUN=1 (log only).

set -u

log() { printf '%s ocg-pod-watchdog %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

MAX_RUNTIME="${OCG_POD_MAX_RUNTIME_SECONDS:-}"
IDLE_TIMEOUT="${OCG_POD_IDLE_TIMEOUT_SECONDS:-900}"
ACTION="${OCG_POD_STOP_ACTION:-stop}"
ACTIVITY_FILE="${OCG_ACTIVITY_FILE:-/tmp/ocg-3d-last-activity}"
POLL="${OCG_WATCHDOG_POLL_SECONDS:-15}"
DRY_RUN="${OCG_WATCHDOG_DRY_RUN:-0}"
HARD_CEILING_SECONDS=3600

case "$MAX_RUNTIME" in
  ''|*[!0-9]*) log "FATAL OCG_POD_MAX_RUNTIME_SECONDS missing or not an integer; requesting shutdown immediately"; MAX_RUNTIME=0 ;;
esac
case "$IDLE_TIMEOUT" in ''|*[!0-9]*) IDLE_TIMEOUT=900 ;; esac
case "$POLL" in ''|*[!0-9]*|0) POLL=15 ;; esac
if [ "$MAX_RUNTIME" -gt "$HARD_CEILING_SECONDS" ]; then
  log "OCG_POD_MAX_RUNTIME_SECONDS=$MAX_RUNTIME exceeds hard ceiling; clamping to $HARD_CEILING_SECONDS"
  MAX_RUNTIME=$HARD_CEILING_SECONDS
fi
case "$ACTION" in stop|terminate) ;; *) ACTION=stop ;; esac

if [ "$ACTION" = "terminate" ] && [ "${OCG_POD_TERMINATION_APPROVED:-0}" != "1" ]; then ACTION=stop; fi
START=$(date +%s)
[ -f "$ACTIVITY_FILE" ] || touch "$ACTIVITY_FILE" 2>/dev/null || true

request_shutdown() {
  reason="$1"
  log "SHUTDOWN_REQUESTED reason=$reason action=$ACTION pod=${RUNPOD_POD_ID:-unknown}"
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY_RUN=1 — no API call made"
    exit 0
  fi
  if [ -z "${RUNPOD_POD_ID:-}" ] || [ -z "${RUNPOD_API_KEY:-}" ]; then
    log "ERROR RUNPOD_POD_ID/RUNPOD_API_KEY unavailable inside pod; cannot self-stop. Out-of-pod guard must stop this pod."
    exit 3
  fi
  if [ "$ACTION" = "terminate" ]; then
    mutation="mutation { podTerminate(input: {podId: \\\"${RUNPOD_POD_ID}\\\"}) }"
  else
    mutation="mutation { podStop(input: {podId: \\\"${RUNPOD_POD_ID}\\\"}) { id desiredStatus } }"
  fi
  attempt=1
  while [ $attempt -le 5 ]; do
    if command -v runpodctl >/dev/null 2>&1; then
      if [ "$ACTION" = "terminate" ]; then runpodctl remove pod "$RUNPOD_POD_ID" && { log "runpodctl remove accepted (attempt $attempt)"; exit 0; }
      else runpodctl stop pod "$RUNPOD_POD_ID" && { log "runpodctl stop accepted (attempt $attempt)"; exit 0; }
      fi
    fi
    if response=$(curl -fsS --max-time 20 -X POST "https://api.runpod.io/graphql" \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer ${RUNPOD_API_KEY}" \
         -d "{\"query\": \"${mutation}\"}"  ); then
      if printf '%s' "$response" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if not d.get("errors") and isinstance(d.get("data"),dict) and d["data"].get("podStop" if sys.argv[1]=="stop" else "podTerminate") is not None else 1)' "$ACTION"; then
      log "API $ACTION request accepted (attempt $attempt) — acceptance is NOT confirmation of billing stop"
      exit 0
      fi
    fi
    log "API $ACTION request failed (attempt $attempt); retrying"
    attempt=$((attempt + 1))
    sleep 10
  done
  log "ERROR all $ACTION attempts failed; out-of-pod guard must stop this pod"
  exit 4
}

log "armed max_runtime=${MAX_RUNTIME}s idle_timeout=${IDLE_TIMEOUT}s action=$ACTION dry_run=$DRY_RUN"
while :; do
  now=$(date +%s)
  elapsed=$((now - START))
  if [ "$elapsed" -ge "$MAX_RUNTIME" ]; then
    request_shutdown "max_runtime_exceeded elapsed=${elapsed}s"
  fi
  if [ "$IDLE_TIMEOUT" -gt 0 ]; then
    last=$(stat -c %Y "$ACTIVITY_FILE" 2>/dev/null || echo "$START")
    idle=$((now - last))
    if [ "$idle" -ge "$IDLE_TIMEOUT" ]; then
      request_shutdown "idle_timeout idle=${idle}s"
    fi
  fi
  sleep "$POLL"
done
