# Workflow Benchmark Guide

This guide explains how to measure arbitrary workflow statistics — HTTP response times, CLI throughput, Prometheus counters, pipeline latency — and track them over time with Benchkit.

---

## Benchmark types

Benchkit supports three benchmark styles. Choose the one that fits your measurement.

### Code benchmark

Your benchmark lives inside a test harness (Go, Rust, JMH, etc.) and the tool produces its own output file. The workflow just runs the harness and stashes the result.

**Best for:** micro-benchmarks, library performance, regression testing against a commit.

```yaml
- run: go test -bench=. -benchmem ./... | tee bench.txt
- uses: strawgate/benchkit/actions/stash@main
  with:
    results: bench.txt
    format: go
```

### Workflow benchmark

There is no test harness. You measure something by running commands or scripts inside the workflow, then emit a native benchkit JSON file yourself.

**Best for:** HTTP endpoint latency, CLI throughput, JSON scraping, Prometheus metrics, pipeline ingest rates.

```yaml
- name: Measure endpoint latency
  run: bash scripts/collect-metrics.sh > bench.json

- uses: strawgate/benchkit/actions/stash@main
  with:
    results: bench.json
    format: native
```

### Hybrid benchmark

A code harness runs the measurement, but you also want system-level context from the monitor action, or you emit additional native metrics alongside the tool output.

**Best for:** load tests where you want both throughput numbers from the tool *and* runner CPU/memory from the monitor; integration tests where you emit a native JSON summary in addition to tool output.

```yaml
- name: Start monitor
  uses: strawgate/benchkit/actions/monitor@main
  with:
    mode: start
    output: monitor.json

- name: Run load test
  run: |
    k6 run scripts/load-test.js --out json=k6-results.json
    python scripts/k6-to-native.py k6-results.json > bench.json

- name: Stop monitor
  uses: strawgate/benchkit/actions/monitor@main
  with:
    mode: stop

- uses: strawgate/benchkit/actions/stash@main
  with:
    results: bench.json
    monitor: monitor.json
    format: native
```

---

## The data model

Every stored run is a `BenchmarkResult` object. Understanding its shape lets you emit correct native JSON from any script.

### Runs, scenarios, and metrics

- A **run** is one execution of your benchmark workflow. It maps to one `data/runs/{id}.json` file on the `bench-data` branch.
- A **scenario** (represented as a `tags` key) is a named configuration variant, e.g. `{"scenario": "passthrough"}`. Tags let the dashboard split one run into multiple comparable series.
- A **metric** is a named measurement with a value, unit, and direction (`bigger_is_better` or `smaller_is_better`).

```
run (one CI execution)
└── benchmarks[]
    ├── name         "endpoint/health"
    ├── tags         {"region": "us-east-1", "scenario": "cold-start"}
    ├── metrics
    │   ├── latency_ms   { value: 42, unit: "ms", direction: "smaller_is_better" }
    │   └── rps          { value: 8500, unit: "req/sec", direction: "bigger_is_better" }
    └── samples[]    (optional time-series)
        ├── { t: 0.0, latency_ms: 38 }
        └── { t: 1.0, latency_ms: 44 }
```

### Outcome metrics vs monitor diagnostics

| Kind | Where it lives | Who writes it | What it means |
|------|----------------|---------------|---------------|
| **Outcome metric** | `benchmarks[].metrics` | Your script | The thing you are measuring: throughput, latency, accuracy |
| **Monitor diagnostic** | `benchmarks[]` with `_monitor/` name | `actions/monitor` | Runner resource usage: CPU, memory, load |

Write outcome metrics yourself. Attach monitor data when you need to correlate your result with runner health (e.g. to detect if a regression is caused by CPU contention, not code).

### When to attach `actions/monitor`

Attach the monitor when:

- You suspect resource contention could mask or amplify results.
- You want the dashboard to show runner CPU and memory alongside your outcome metrics.
- Your benchmark is long-running (>10 s) and runner health may drift.

Skip the monitor when:

- The benchmark is a quick single-shot measurement (< 5 s).
- You are already capturing resource metrics inside your own script.
- You are running on macOS or Windows (monitor is a no-op on non-Linux runners).

---

## Native JSON format

Emit this format from any script to feed benchkit.

```json
{
  "benchmarks": [
    {
      "name": "endpoint/health",
      "tags": {
        "region": "us-east-1",
        "scenario": "cold-start"
      },
      "metrics": {
        "latency_ms": {
          "value": 42,
          "unit": "ms",
          "direction": "smaller_is_better"
        },
        "rps": {
          "value": 8500,
          "unit": "req/sec",
          "direction": "bigger_is_better"
        }
      }
    }
  ]
}
```

The full schema is at [`schema/benchmark-result.schema.json`](../schema/benchmark-result.schema.json).

---

## Recommended file layout

```
your-repo/
├── .github/
│   └── workflows/
│       ├── benchmark.yml          # main benchmark workflow (push to main)
│       └── benchmark-pr.yml       # optional PR comparison workflow
├── scripts/
│   └── collect-metrics.sh         # your measurement script(s)
└── examples/
    └── native/
        └── benchmark.json         # example native JSON for documentation / testing
```

Keep measurement scripts in `scripts/` so they are reusable across workflows. Keep native JSON examples in `examples/native/` as documentation and for schema-validation tests.

---

## Minimal workflow benchmark recipe

Use this when you have no test harness — your workflow script is the benchmark.

### `.github/workflows/benchmark.yml`

```yaml
name: Workflow Benchmark
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * *'      # daily at 06:00 UTC

permissions:
  contents: write             # required to push to bench-data

jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Collect metrics
        run: bash scripts/collect-metrics.sh > bench.json

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench.json
          format: native

      - name: Aggregate
        uses: strawgate/benchkit/actions/aggregate@main
```

### `scripts/collect-metrics.sh`

```bash
#!/usr/bin/env bash
# Emit benchkit-native JSON with one or more outcome metrics.
# Edit the curl target and metric names to match your use case.
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
```

---

## Minimal hybrid benchmark recipe

Use this when a code harness produces results *and* you want system diagnostics.

### `.github/workflows/benchmark.yml`

```yaml
name: Hybrid Benchmark
on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start monitor
        uses: strawgate/benchkit/actions/monitor@main
        with:
          mode: start
          poll-interval: 250
          output: monitor.json

      - name: Run benchmarks
        run: go test -bench=. -benchmem ./... | tee bench.txt

      - name: Stop monitor
        uses: strawgate/benchkit/actions/monitor@main
        with:
          mode: stop

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench.txt
          monitor: monitor.json
          format: go

      - name: Aggregate
        uses: strawgate/benchkit/actions/aggregate@main
```

The `monitor: monitor.json` input merges runner diagnostics (`_monitor/system`, `_monitor/process/{name}`) into the stored run. The dashboard renders them in a separate **Runner Metrics** section so they do not pollute your outcome charts.

---

## Emitting metrics from multiple scenarios

If your script runs several configurations, emit one benchmark object per scenario using `tags` to distinguish them.

```bash
for SCENARIO in passthrough filter enrich; do
  RESULT=$(run_scenario "$SCENARIO")
  echo "$RESULT"   # accumulate, then wrap in {"benchmarks": [...]}
done
```

Or in Python:

```python
import json, subprocess

scenarios = ["passthrough", "filter", "enrich"]
benchmarks = []

for s in scenarios:
    result = run_scenario(s)
    benchmarks.append({
        "name": f"pipeline/{s}",
        "tags": {"scenario": s},
        "metrics": {
            "throughput_eps": {"value": result["eps"], "unit": "events/sec", "direction": "bigger_is_better"},
            "latency_ms":     {"value": result["latency_ms"], "unit": "ms", "direction": "smaller_is_better"},
        }
    })

print(json.dumps({"benchmarks": benchmarks}, indent=2))
```

---

## Prometheus and JSON scraping

To collect a Prometheus metric, use Python for reliable parsing instead of fragile grep/awk patterns that break when label ordering or whitespace changes:

```bash
#!/usr/bin/env bash
# scripts/collect-prometheus.sh
set -euo pipefail

# Scrape a Prometheus /metrics endpoint and extract a specific metric value.
# Python handles any label set and whitespace variations correctly.
LATENCY_MS=$(curl -s http://localhost:9090/metrics \
  | python3 -c "
import sys
for line in sys.stdin:
    if line.startswith('#') or not line.strip():
        continue
    if line.startswith('http_request_duration_seconds'):
        value_s = float(line.rsplit(' ', 1)[-1])
        print(int(value_s * 1000))
        sys.exit(0)
sys.exit(1)
")

cat <<EOF
{
  "benchmarks": [
    {
      "name": "http/p99-latency",
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
```

To scrape a JSON API response:

```bash
#!/usr/bin/env bash
# scripts/collect-json-api.sh
set -euo pipefail

RESPONSE=$(curl -s https://api.example.com/stats)

# Validate and extract the metric; fail with a clear error if the key is absent.
INGEST_RATE=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f'Failed to parse API response as JSON: {e}', file=sys.stderr)
    sys.exit(1)
if 'ingest_rate_eps' not in d:
    print(f'Key ingest_rate_eps not found in response. Keys: {list(d.keys())}', file=sys.stderr)
    sys.exit(1)
print(d['ingest_rate_eps'])
")

cat <<EOF
{
  "benchmarks": [
    {
      "name": "pipeline/ingest",
      "metrics": {
        "ingest_rate_eps": {
          "value": $INGEST_RATE,
          "unit": "events/sec",
          "direction": "bigger_is_better"
        }
      }
    }
  ]
}
EOF
```

---

## CLI / report parsing

If your tool writes a report file, parse it in a script and emit native JSON:

```bash
#!/usr/bin/env bash
# scripts/parse-report.sh <report-file>
set -euo pipefail

REPORT=$1
# Example: parse a line like "Throughput: 12345 events/sec"
EPS=$(grep "^Throughput:" "$REPORT" | awk '{print $2}')

cat <<EOF
{
  "benchmarks": [
    {
      "name": "pipeline/throughput",
      "metrics": {
        "throughput_eps": {
          "value": $EPS,
          "unit": "events/sec",
          "direction": "bigger_is_better"
        }
      }
    }
  ]
}
EOF
```

---

## From stat to dashboard: the full path

```
┌─────────────────────────────┐
│  Your measurement           │  (curl, CLI, Python, jq, …)
└────────────┬────────────────┘
             │ stdout: native JSON
             ▼
┌─────────────────────────────┐
│  scripts/collect-*.sh       │  writes bench.json
└────────────┬────────────────┘
             │ bench.json (native format)
             ▼
┌─────────────────────────────┐
│  actions/stash              │  parses + commits to bench-data branch
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  actions/aggregate          │  rebuilds index.json + series/*.json
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  @benchkit/chart Dashboard  │  renders trend charts, no server needed
└─────────────────────────────┘
```

See the [README](../README.md) for installation and dashboard configuration.
