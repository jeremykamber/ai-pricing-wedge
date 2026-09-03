#!/usr/bin/env bash
# Autoresearch benchmark entrypoint for the artifact-analysis pipeline.
#
# Runs the FIXED benchmark workload (jobright.ai intake + 3-persona analysis +
# cohort synthesis) through the real pipeline and emits METRIC lines:
#   METRIC total_wall_ms=<ms>      primary: end-to-end wall time
#   METRIC intake_ms=<ms>          secondary: artifact capture phase
#   METRIC personas_ms=<ms>        secondary: persona analysis phase
#   METRIC synthesis_ms=<ms>       secondary: cohort synthesis
#   METRIC slowest_persona_ms=<ms> secondary: critical-path persona
#   METRIC completed_count=<n>     guard: valid persona responses
#   METRIC synthesis_ok=<0|1>      guard: synthesis succeeded
#
# Exit 0 iff the run completed with all personas valid and synthesis OK.
set -euo pipefail
cd "$(dirname "$0")"

echo "[autoresearch] starting benchmark run at $(date -u +%FT%TZ)" >&2

OUT="$(bun scripts/autoresearch-bench.ts 2>&1)"
STATUS=$?

echo "$OUT"

# Propagate METRIC lines (already printed by the runner; kept here so the
# contract holds even if the runner's stdout is later redirected).
echo "$OUT" | grep -E "^METRIC " || true

if [ $STATUS -ne 0 ]; then
  echo "[autoresearch] benchmark FAILED (exit $STATUS)" >&2
  exit $STATUS
fi

COMPLETED="$(echo "$OUT" | grep -oE "METRIC completed_count=[0-9]+" | grep -oE "[0-9]+$" || echo 0)"
SYNTH_OK="$(echo "$OUT" | grep -oE "METRIC synthesis_ok=[01]" | grep -oE "[01]$" || echo 0)"
if [ "$COMPLETED" -lt 3 ] || [ "$SYNTH_OK" -ne 1 ]; then
  echo "[autoresearch] benchmark DEGRADED: completed_count=$COMPLETED synthesis_ok=$SYNTH_OK" >&2
  exit 1
fi

echo "[autoresearch] benchmark OK" >&2
exit 0
