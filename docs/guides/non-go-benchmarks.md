# Non-Go Benchmark Ingestion

Benchkit is not limited to Go. Any language or tool can produce results that benchkit ingests, as long as the output is in a supported format. This guide shows how to use benchkit with Python, JavaScript, and other languages.

## Supported input formats

| Format | Flag | Description |
|---|---|---|
| **Native** | `native` | Benchkit's own JSON format — most flexible |
| **benchmark-action** | `benchmark-action` | JSON array used by [benchmark-action](https://github.com/benchmark-action/github-action-benchmark) |
| **Go bench** | `go` | Standard `go test -bench` text output |
| **Auto-detect** | `auto` (default) | Tries all formats automatically |

For non-Go languages, use the **native** or **benchmark-action** format.

## Example: Python benchmarks

### Using the native format

Write a Python script that outputs benchkit native JSON:

```python
#!/usr/bin/env python3
"""run_benchmarks.py — Run benchmarks and emit benchkit native JSON."""
import json
import time

def bench_sort():
    data = list(range(10000, 0, -1))
    start = time.perf_counter_ns()
    sorted(data)
    return time.perf_counter_ns() - start

def bench_search():
    data = list(range(100000))
    start = time.perf_counter_ns()
    _ = 99999 in data
    return time.perf_counter_ns() - start

results = {
    "benchmarks": [
        {
            "name": "sort-10k",
            "metrics": {
                "ns_per_op": {
                    "value": bench_sort(),
                    "unit": "ns/op",
                    "direction": "smaller_is_better",
                },
            },
        },
        {
            "name": "search-100k",
            "metrics": {
                "ns_per_op": {
                    "value": bench_search(),
                    "unit": "ns/op",
                    "direction": "smaller_is_better",
                },
            },
        },
    ],
}

with open("bench-results.json", "w") as f:
    json.dump(results, f, indent=2)
```

### Using the benchmark-action format

If your project already uses [benchmark-action](https://github.com/benchmark-action/github-action-benchmark), you can output its JSON format instead:

```python
#!/usr/bin/env python3
"""run_benchmarks_ba.py — Emit benchmark-action format."""
import json
import time

def bench_sort():
    data = list(range(10000, 0, -1))
    start = time.perf_counter_ns()
    sorted(data)
    return time.perf_counter_ns() - start

results = [
    {
        "name": "sort-10k",
        "value": bench_sort(),
        "unit": "ns/op",
        "range": "± 5000",
    },
]

with open("bench-results.json", "w") as f:
    json.dump(results, f, indent=2)
```

### GitHub Actions workflow for Python

```yaml
name: Python Benchmarks

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

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Run benchmarks
        run: python run_benchmarks.py

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench-results.json
          format: native  # or "benchmark-action"

  aggregate:
    needs: bench
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: strawgate/benchkit/actions/aggregate@main
```

## Example: JavaScript / Node.js benchmarks

```js
// run_benchmarks.mjs — Emit benchkit native JSON
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

function benchArraySort() {
  const arr = Array.from({ length: 10_000 }, (_, i) => 10_000 - i);
  const start = performance.now();
  arr.sort((a, b) => a - b);
  return (performance.now() - start) * 1e6; // ms → ns
}

function benchMapLookup() {
  const map = new Map(
    Array.from({ length: 100_000 }, (_, i) => [i, `value-${i}`])
  );
  const start = performance.now();
  map.get(99_999);
  return (performance.now() - start) * 1e6;
}

const results = {
  benchmarks: [
    {
      name: "array-sort-10k",
      metrics: {
        ns_per_op: {
          value: benchArraySort(),
          unit: "ns/op",
          direction: "smaller_is_better",
        },
      },
    },
    {
      name: "map-lookup-100k",
      metrics: {
        ns_per_op: {
          value: benchMapLookup(),
          unit: "ns/op",
          direction: "smaller_is_better",
        },
      },
    },
  ],
};

writeFileSync("bench-results.json", JSON.stringify(results, null, 2));
```

Then use the same stash workflow pattern:

```yaml
      - name: Run benchmarks
        run: node run_benchmarks.mjs

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench-results.json
          format: native
```

## Native format reference

The native format is a JSON object with a `benchmarks` array. Each benchmark has a `name`, optional `tags`, and a `metrics` object:

```json
{
  "benchmarks": [
    {
      "name": "my-benchmark",
      "tags": {
        "variant": "optimized"
      },
      "metrics": {
        "metric_name": {
          "value": 12345,
          "unit": "ns/op",
          "direction": "smaller_is_better",
          "range": 500
        }
      }
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Benchmark identifier |
| `tags` | object | no | Key-value pairs for grouping (e.g. `{ "cpu": "4", "scenario": "cold" }`) |
| `metrics.<key>.value` | number | yes | Measured value |
| `metrics.<key>.unit` | string | no | Human-readable unit (e.g. `"ns/op"`, `"MB/s"`) |
| `metrics.<key>.direction` | string | no | `"smaller_is_better"` or `"bigger_is_better"` |
| `metrics.<key>.range` | number | no | Variance or uncertainty (± value) |

The full schema is defined in [`schema/benchmark-result.schema.json`](../../schema/benchmark-result.schema.json).

## benchmark-action format reference

The [benchmark-action format](https://github.com/benchmark-action/github-action-benchmark) is a JSON array of objects:

```json
[
  {
    "name": "my-benchmark",
    "value": 12345,
    "unit": "ns/op",
    "range": "± 500"
  }
]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Benchmark identifier |
| `value` | number | yes | Measured value |
| `unit` | string | yes | Unit string (used to infer direction) |
| `range` | string | no | Variance as a string, e.g. `"± 500"` |

Each entry becomes a single benchmark with one metric called `value`. The metric direction is inferred from the unit string (e.g. `ns/op` → `smaller_is_better`, `ops/sec` → `bigger_is_better`).
