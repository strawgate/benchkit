#!/usr/bin/env bash
# scripts/collect-metrics.sh
#
# Minimal workflow benchmark collector.
# Measures HTTP endpoint latency and emits benchkit-native JSON to stdout.
#
# Usage:
#   bash scripts/collect-metrics.sh > bench.json
#
# Edit TARGET_URL and the metric block below to suit your use case.
set -euo pipefail

TARGET_URL="${TARGET_URL:-https://example.com/health}"

# Use curl's built-in timing to measure only HTTP round-trip time,
# excluding shell startup and command spawning overhead.
TIMING=$(curl -o /dev/null -s -w "%{http_code} %{time_total}" "$TARGET_URL")
HTTP_CODE=$(echo "$TIMING" | awk '{print $1}')
TIME_TOTAL=$(echo "$TIMING" | awk '{print $2}')

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Health check failed: HTTP $HTTP_CODE" >&2
  exit 1
fi

# Convert seconds (float) to milliseconds (integer).
# Pass TIME_TOTAL via environment variable to avoid shell injection.
LATENCY_MS=$(TIME_TOTAL="$TIME_TOTAL" python3 -c "import os; print(int(float(os.environ['TIME_TOTAL']) * 1000))")

cat <<EOF
{
  "benchmarks": [
    {
      "name": "endpoint/health",
      "metrics": {
        "latency_ms": {
          "value": $LATENCY_MS,
          "unit": "ms",
          "direction": "smaller_is_better"
        }
      }
    }
  ]
}
EOF
