# @benchkit/format

Benchmark result types and format parsers for [benchkit](../../README.md). Parses Go bench output, [Hyperfine](https://github.com/sharkdp/hyperfine) JSON, [benchmark-action](https://github.com/benchmark-action/github-action-benchmark) JSON, [pytest-benchmark](https://pytest-benchmark.readthedocs.io/) JSON, and the benchkit native format into a single normalized shape.

## Installation

```bash
npm install @benchkit/format
```

## Quick start

```ts
import { parse } from "@benchkit/format";

// Auto-detect the format and parse
const result = parse(input);

for (const bench of result.benchmarks) {
  for (const [name, metric] of Object.entries(bench.metrics)) {
    console.log(`${bench.name} ${name}: ${metric.value} ${metric.unit ?? ""}`);
  }
}
```

## Parser entry points

### `parse(input, format?)`

Main entry point. Accepts a string and an optional format hint. When `format` is
omitted or `"auto"`, the parser inspects the input and picks the right strategy:

| Detected shape | Trigger | Format |
|---|---|---|
| JSON object with a `benchmarks` array whose entries have a `stats` object | `benchmarks[0].stats` is an object | `pytest-benchmark` |
| JSON object with a `benchmarks` array | Top-level `benchmarks` key present | `native` |
| JSON object with a `results` array | Top-level `results` key with objects containing a `command` string | `hyperfine` |
| JSON array of objects | Array whose first element has both a string `name` and a numeric `value` | `benchmark-action` |
| Plain text lines | Lines matching `/^Benchmark\w.*\s+\d+\s+[\d.]+\s+\w+\/\w+/` | `go` |
| Plain text lines | Lines matching `/^test\s+\S+\s+\.\.\.\s+bench:/` | `rust` |

If auto-detection fails, `parse` throws with a message listing the supported formats.

```ts
import { parse } from "@benchkit/format";

// Explicit format
const result = parse(goOutput, "go");

// Auto-detect (default)
const result = parse(unknownInput);
```

### `parseGoBench(input)`

Parses Go `testing.B` text output. Each benchmark line produces one `Benchmark`
entry. The `-P` processor suffix is extracted into a `procs` tag. Multiple
value/unit pairs on the same line produce separate named metrics.

**Input** (typical `go test -bench=. -benchmem` output):

```
goos: linux
goarch: amd64
BenchmarkSort/small-8     500000     2345 ns/op     128 B/op     3 allocs/op
BenchmarkSort/large-8       1000   987654 ns/op   65536 B/op   512 allocs/op
BenchmarkHash-8          1000000      890 ns/op       0 B/op     0 allocs/op
PASS
ok  	example.com/mypackage	3.456s
```

**Call:**

```ts
import { parseGoBench } from "@benchkit/format";

const input = `
BenchmarkSort/small-8     500000     2345 ns/op     128 B/op     3 allocs/op
BenchmarkSort/large-8       1000   987654 ns/op   65536 B/op   512 allocs/op
BenchmarkHash-8          1000000      890 ns/op       0 B/op     0 allocs/op
`.trim();

const result = parseGoBench(input);
```

**Result** (abbreviated):

```json
{
  "benchmarks": [
    {
      "name": "BenchmarkSort/small",
      "tags": { "procs": "8" },
      "metrics": {
        "ns_per_op":     { "value": 2345,   "unit": "ns/op",     "direction": "smaller_is_better" },
        "bytes_per_op":  { "value": 128,    "unit": "B/op",      "direction": "smaller_is_better" },
        "allocs_per_op": { "value": 3,      "unit": "allocs/op", "direction": "smaller_is_better" }
      }
    },
    {
      "name": "BenchmarkSort/large",
      "tags": { "procs": "8" },
      "metrics": {
        "ns_per_op":     { "value": 987654, "unit": "ns/op",     "direction": "smaller_is_better" },
        "bytes_per_op":  { "value": 65536,  "unit": "B/op",      "direction": "smaller_is_better" },
        "allocs_per_op": { "value": 512,    "unit": "allocs/op", "direction": "smaller_is_better" }
      }
    },
    {
      "name": "BenchmarkHash",
      "tags": { "procs": "8" },
      "metrics": {
        "ns_per_op":     { "value": 890, "unit": "ns/op", "direction": "smaller_is_better" },
        "bytes_per_op":  { "value": 0,   "unit": "B/op",  "direction": "smaller_is_better" },
        "allocs_per_op": { "value": 0,   "unit": "allocs/op", "direction": "smaller_is_better" }
      }
    }
  ]
}
```

### `parseBenchmarkAction(input)`

Parses the JSON array format used by
[benchmark-action/github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark).
Each array entry becomes one `Benchmark` with a single metric called `value`.
The `range` string (e.g. `"± 300"`) is parsed into a numeric `range` field.

**Input** (JSON produced by the benchmark tool):

```json
[
  { "name": "encode/small",  "value": 125430, "unit": "ops/sec", "range": "± 1200" },
  { "name": "encode/medium", "value":  48200, "unit": "ops/sec", "range": "± 480" },
  { "name": "decode/small",  "value":  98700, "unit": "ops/sec" },
  { "name": "latency/p99",   "value":    4.2, "unit": "ms",      "range": "+/- 0.3" }
]
```

**Call:**

```ts
import { parseBenchmarkAction } from "@benchkit/format";

const result = parseBenchmarkAction(input);
```

**Result** (abbreviated):

```json
{
  "benchmarks": [
    {
      "name": "encode/small",
      "metrics": {
        "value": { "value": 125430, "unit": "ops/sec", "direction": "bigger_is_better", "range": 1200 }
      }
    },
    {
      "name": "encode/medium",
      "metrics": {
        "value": { "value": 48200, "unit": "ops/sec", "direction": "bigger_is_better", "range": 480 }
      }
    },
    {
      "name": "decode/small",
      "metrics": {
        "value": { "value": 98700, "unit": "ops/sec", "direction": "bigger_is_better" }
      }
    },
    {
      "name": "latency/p99",
      "metrics": {
        "value": { "value": 4.2, "unit": "ms", "direction": "smaller_is_better", "range": 0.3 }
      }
    }
  ]
}
```

### `parseNative(input)`

Parses the benchkit native JSON format. Validates that the input contains a
`benchmarks` array where each entry has a string `name` and an object `metrics`
whose values each have a numeric `value`. Direction, unit, range, tags, and
samples are all optional. Returns the parsed object as-is after validation.

**Input** (benchkit native JSON):

```json
{
  "context": {
    "commit": "abc123def456",
    "ref": "main",
    "timestamp": "2025-06-01T12:00:00Z"
  },
  "benchmarks": [
    {
      "name": "compress/gzip",
      "tags": { "level": "6", "arch": "amd64" },
      "metrics": {
        "throughput": { "value": 312.5, "unit": "MB/s",   "direction": "bigger_is_better" },
        "latency":    { "value":   3.2,  "unit": "ms",     "direction": "smaller_is_better" }
      }
    },
    {
      "name": "compress/zstd",
      "tags": { "level": "3", "arch": "amd64" },
      "metrics": {
        "throughput": { "value": 498.0, "unit": "MB/s",   "direction": "bigger_is_better" },
        "latency":    { "value":   2.1,  "unit": "ms",     "direction": "smaller_is_better" }
      },
      "samples": [
        { "t": 0.0, "throughput": 490.0 },
        { "t": 0.5, "throughput": 501.0 },
        { "t": 1.0, "throughput": 503.0 }
      ]
    }
  ]
}
```

**Call:**

```ts
import { parseNative } from "@benchkit/format";
import { readFileSync } from "node:fs";

const result = parseNative(readFileSync("results.json", "utf-8"));
// result.benchmarks[0].name => "compress/gzip"
// result.benchmarks[0].metrics.throughput.value => 312.5
```

### `buildNativeResult(options)`

Builds a valid [`BenchmarkResult`](#benchmarkresult) from a plain options object
and validates the result before returning it. This is the programmatic counterpart
to the [`benchkit-native emit`](#benchkit-native-cli) CLI helper.

Metric values can be bare numbers (value only) or full descriptor objects with
optional `unit`, `direction`, and `range` fields.

**Call:**

```ts
import { buildNativeResult } from "@benchkit/format";

// Throughput metric
const result = buildNativeResult({
  benchmarks: [{
    name: "http-ingest",
    metrics: {
      events_per_sec: { value: 13240.5, unit: "events/sec", direction: "bigger_is_better" },
    },
  }],
});

// Multi-metric with tags and context
const result2 = buildNativeResult({
  benchmarks: [{
    name: "mock-http-ingest",
    tags: { scenario: "json-ingest" },
    metrics: {
      events_per_sec: { value: 13240.5, unit: "events/sec", direction: "bigger_is_better" },
      p95_batch_ms:   { value: 143.2,   unit: "ms",         direction: "smaller_is_better" },
    },
  }],
  context: { commit: "abc123", ref: "main" },
});

// Multiple benchmark entries in one result
const result3 = buildNativeResult({
  benchmarks: [
    { name: "bench-a", metrics: { latency_ms: 12.3 } },
    { name: "bench-b", metrics: { latency_ms: 9.8 } },
  ],
});

// With time-series samples
const result4 = buildNativeResult({
  benchmarks: [{
    name: "agent-run",
    metrics: { service_rss_mb: { value: 512.3, unit: "mb", direction: "smaller_is_better" } },
    samples: [
      { t: 0, service_rss_mb: 498.1 },
      { t: 5, service_rss_mb: 512.3 },
      { t: 10, service_rss_mb: 521.0 },
    ],
  }],
});
```

Throws with a descriptive message if any structural constraint is violated (same
validation as `parseNative`).

## `benchkit-native` CLI

`@benchkit/format` ships a `benchkit-native` binary that emits valid native
benchmark result JSON from a shell step — no hand-written JSON required.

```bash
# After installing @benchkit/format:
npx benchkit-native emit --help
```

### `benchkit-native emit`

```
benchkit-native emit --name <name> --metric <spec> [options]

Required:
  --name <string>          Benchmark name (e.g. mock-http-ingest)
  --metric <spec>          Metric in the form name=value[:unit[:direction]]
                           Repeat for multiple metrics.
                           direction: bigger_is_better | smaller_is_better

Optional:
  --tag <key=value>        Arbitrary tag dimension. Repeat for multiple tags.
  --sample <spec>          Time-series sample: t=<secs>[,metric=value,...]
  --commit <sha>           Git commit SHA for context metadata.
  --ref <gitref>           Git ref (branch/tag) for context metadata.
  --timestamp <iso8601>    ISO 8601 timestamp for context metadata.
  --runner <label>         Runner label or machine description.
  --output <file>          Write JSON to file instead of stdout.
  --append                 Append benchmark to an existing output file.
```

#### Shell examples

**Throughput metric:**

```bash
benchkit-native emit \
  --name http-ingest \
  --metric events_per_sec=13240.5:events/sec:bigger_is_better \
  --output result.json
```

**Latency metric:**

```bash
benchkit-native emit \
  --name api-latency \
  --metric p95_ms=143.2:ms:smaller_is_better \
  --output result.json
```

**Memory metric:**

```bash
benchkit-native emit \
  --name agent-run \
  --metric service_rss_mb=512.3:mb:smaller_is_better
```

**Multi-metric result with tags and context:**

```bash
benchkit-native emit \
  --name mock-http-ingest \
  --tag scenario=json-ingest \
  --metric events_per_sec=13240.5:events/sec:bigger_is_better \
  --metric p95_batch_ms=143.2:ms:smaller_is_better \
  --commit "$GITHUB_SHA" \
  --ref "$GITHUB_REF" \
  --output workflow-bench.json
```

**Result with samples:**

```bash
benchkit-native emit \
  --name agent-run \
  --metric service_rss_mb=512.3:mb:smaller_is_better \
  --sample t=0,service_rss_mb=498.1 \
  --sample t=5,service_rss_mb=512.3 \
  --sample t=10,service_rss_mb=521.0 \
  --output result.json
```

**Appending multiple benchmarks to one file:**

```bash
# First benchmark
benchkit-native emit --name bench-a --metric latency_ms=12.3:ms:smaller_is_better \
  --output results.json

# Append a second benchmark
benchkit-native emit --name bench-b --metric latency_ms=9.8:ms:smaller_is_better \
  --output results.json --append
```

#### GitHub Actions usage

```yaml
- name: Emit benchmark result
  run: |
    npx benchkit-native emit \
      --name mock-http-ingest \
      --tag scenario=json-ingest \
      --metric events_per_sec=13240.5:events/sec:bigger_is_better \
      --metric p95_batch_ms=143.2:ms:smaller_is_better \
      --commit "$GITHUB_SHA" \
      --ref "$GITHUB_REF" \
      --output workflow-bench.json

- uses: strawgate/benchkit/actions/stash@main
  with:
    result-file: workflow-bench.json
    format: native
```

Parses Rust `cargo bench` (libtest) text output. Each benchmark line produces one
`Benchmark` entry.

```ts
import { parseRustBench } from "@benchkit/format";

const result = parseRustBench(
  "test sort::bench_sort   ... bench:         320 ns/iter (+/- 42)"
);
// result.benchmarks[0].metrics => { ns_per_iter: { value: 320, unit: "ns/iter", range: 42 } }
```

### `parseHyperfine(input)`

Parses the JSON export from [Hyperfine](https://github.com/sharkdp/hyperfine)
(`hyperfine --export-json`). Each result becomes a benchmark named after the
command, with `mean`, `stddev`, `median`, `min`, and `max` metrics.

```ts
import { parseHyperfine } from "@benchkit/format";

const result = parseHyperfine(JSON.stringify({
  results: [
    {
      command: "sleep 0.1",
      mean: 0.105,
      stddev: 0.002,
      median: 0.105,
      min: 0.103,
      max: 0.108,
      times: [0.103, 0.105, 0.108]
    }
  ]
}));
```

### `parsePytestBenchmark(input)`

Parses [pytest-benchmark](https://pytest-benchmark.readthedocs.io/) JSON output
(`pytest --benchmark-json=results.json`). Each benchmark entry becomes a
`Benchmark` with metrics for `mean` (primary, seconds), `ops`, `rounds`,
`median`, `min`, `max`, and `stddev`.

```ts
import { parsePytestBenchmark } from "@benchkit/format";

const result = parsePytestBenchmark(JSON.stringify({
  benchmarks: [
    {
      name: "test_sort",
      fullname: "tests/test_perf.py::test_sort",
      stats: {
        min: 0.000123,
        max: 0.000156,
        mean: 0.000134,
        stddev: 0.0000089,
        rounds: 1000,
        median: 0.000132,
        ops: 7462.68
      }
    }
  ]
}));
// result.benchmarks[0].metrics.mean  => { value: 0.000134, unit: "s", direction: "smaller_is_better", range: 0.0000089 }
// result.benchmarks[0].metrics.ops   => { value: 7462.68, unit: "ops/s", direction: "bigger_is_better" }
// result.benchmarks[0].metrics.rounds => { value: 1000, direction: "bigger_is_better" }
```

**Python example** — generate and consume pytest-benchmark output:

```python
# conftest.py / test_perf.py
def test_sort(benchmark):
    benchmark(sorted, range(1000))
```

```bash
pytest --benchmark-json=results.json
```

```ts
import { readFileSync } from "fs";
import { parsePytestBenchmark } from "@benchkit/format";

const result = parsePytestBenchmark(readFileSync("results.json", "utf-8"));
for (const bench of result.benchmarks) {
  console.log(`${bench.name}: ${bench.metrics.mean.value}s (${bench.metrics.ops.value} ops/s)`);
}
```

### `inferDirection(unit)`

Infers whether a unit string represents a "bigger is better" or "smaller is
better" metric. Used internally by all parsers when no explicit `direction` is
provided.

```ts
import { inferDirection } from "@benchkit/format";

inferDirection("ops/sec");   // "bigger_is_better"
inferDirection("MB/s");      // "bigger_is_better"
inferDirection("throughput"); // "bigger_is_better"
inferDirection("ns/op");     // "smaller_is_better"
inferDirection("ms");        // "smaller_is_better"
inferDirection("B/op");      // "smaller_is_better"
```

The heuristic scans the lowercased unit string for substrings:

| Matched substring | Direction | Example units |
|---|---|---|
| `ops/s` | `bigger_is_better` | `ops/sec`, `ops/s` |
| `op/s` | `bigger_is_better` | `op/sec`, `op/s` |
| `/sec` | `bigger_is_better` | `req/sec`, `events/sec` |
| `mb/s` | `bigger_is_better` | `MB/s`, `mb/s` |
| `throughput` | `bigger_is_better` | `throughput` |
| `events` | `bigger_is_better` | `events`, `events/sec` |
| _(no match)_ | `smaller_is_better` | `ns/op`, `ms`, `B/op`, `allocs/op`, `ns/iter`, `bytes` |

## Types

All types mirror the JSON schemas in [`schema/`](../../schema/README.md).

### `BenchmarkResult`

Top-level result returned by every parser.

```ts
interface BenchmarkResult {
  benchmarks: Benchmark[];
  context?: Context;
}
```

### `Benchmark`

A single benchmark with one or more named metrics.

```ts
interface Benchmark {
  name: string;
  tags?: Record<string, string>;
  metrics: Record<string, Metric>;
  samples?: Sample[];
}
```

### `Metric`

A single measured value with optional unit, direction, and variance.

```ts
interface Metric {
  value: number;
  unit?: string;
  direction?: "bigger_is_better" | "smaller_is_better";
  range?: number;
}
```

### `Sample`

A time-series data point within a benchmark run. `t` is seconds since
benchmark start; all other keys are metric values at that instant.

```ts
interface Sample {
  t: number;
  [metricName: string]: number;
}
```

### `Context`

Optional metadata about the environment and commit that produced the results.

```ts
interface Context {
  commit?: string;   // Full commit SHA
  ref?: string;      // Git ref, e.g. "main"
  timestamp?: string; // ISO 8601 datetime, e.g. "2025-01-15T10:30:00Z"
  runner?: string;   // Runner label or machine description
  monitor?: MonitorContext; // Present when monitor output is merged via stash action
}

interface MonitorContext {
  monitor_version: string;  // Version of the monitor action
  poll_interval_ms: number; // Polling interval in milliseconds
  duration_ms: number;      // Total monitoring duration in milliseconds
  runner_os?: string;       // Operating system of the runner
  runner_arch?: string;     // Architecture of the runner
  poll_count?: number;      // Number of polling cycles performed
  kernel?: string;          // Kernel version string
  cpu_model?: string;       // CPU model name
  cpu_count?: number;       // Number of logical CPU cores
  total_memory_mb?: number; // Total system memory in megabytes
}
```

### Series and index types

These types describe the aggregated files on the `bench-data` branch (see
[Data files](#data-files) below):

| Type | Schema | Purpose |
|---|---|---|
| `IndexFile` | [`index.schema.json`](../../schema/index.schema.json) | Run listing with per-run metadata |
| `RunEntry` | (inline in index schema) | Single entry inside `IndexFile.runs` |
| `SeriesFile` | [`series.schema.json`](../../schema/series.schema.json) | Pre-aggregated time-series for one metric |
| `SeriesEntry` | (inline in series schema) | Points array for one benchmark within a series |
| `DataPoint` | (inline in series schema) | Single `{timestamp, value}` point |

## Metric naming conventions

When the Go and benchmark-action parsers normalize metrics they apply these
rules:

| Go unit | Metric name | Rule |
|---|---|---|
| `ns/op` | `ns_per_op` | Replace `/` with `_per_`, lowercase |
| `B/op` | `bytes_per_op` | Known alias |
| `allocs/op` | `allocs_per_op` | Replace `/` with `_per_`, lowercase |
| `MB/s` | `mb_per_s` | Known alias |

General algorithm: replace every `/` with `_per_`, replace spaces with `_`,
then lowercase. Specific aliases (`B/op` → `bytes_per_op`, `MB/s` → `mb_per_s`, `ns/iter` → `ns_per_iter`)
take precedence.

In the native format, metric names are passed through unchanged — the keys of
the `metrics` object become the metric names.

## Direction semantics

Every metric may declare whether higher or lower values represent improvement.

| Direction | Meaning | Examples |
|---|---|---|
| `bigger_is_better` | Higher values are improvements | throughput, ops/sec, MB/s |
| `smaller_is_better` | Lower values are improvements | latency, ns/op, allocations |

When direction is not specified in the input, all parsers call `inferDirection(unit)`
to infer it from the unit string. See the [`inferDirection` section](#inferdirectionunit)
for the full list of recognized unit patterns.

If no unit is provided and no direction is set, consumers should treat the
metric as `smaller_is_better`.

## Data files

The `bench-stash` and `bench-aggregate` actions maintain a set of JSON files
on a dedicated Git branch (default `bench-data`). The branch layout is:

```
data/
├── index.json              # All runs (IndexFile)
├── runs/
│   ├── {runId}.json        # Full results for one run (BenchmarkResult)
│   └── ...
└── series/
    ├── {metricName}.json   # Time-series for one metric (SeriesFile)
    └── ...
```

| File | Schema | Written by |
|---|---|---|
| `data/index.json` | [`index.schema.json`](../../schema/index.schema.json) | `bench-aggregate` |
| `data/runs/{id}.json` | [`benchmark-result.schema.json`](../../schema/benchmark-result.schema.json) | `bench-stash` |
| `data/series/{metric}.json` | [`series.schema.json`](../../schema/series.schema.json) | `bench-aggregate` |

## Validating your own output

To check that a file matches the benchkit native format without reading source,
validate it against `benchmark-result.schema.json`:

```bash
# Using ajv-cli
npx ajv validate -s schema/benchmark-result.schema.json -d my-results.json

# Or in code
import { parseNative } from "@benchkit/format";
parseNative(fs.readFileSync("my-results.json", "utf-8")); // throws on invalid input
```

## License

MIT
