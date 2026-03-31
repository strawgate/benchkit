# @benchkit/format

Benchmark result types and format parsers for [benchkit](../../README.md). Parses Go bench output, [benchmark-action](https://github.com/benchmark-action/github-action-benchmark) JSON, and the benchkit native format into a single normalized shape.

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

| Detected shape | Format |
|---|---|
| JSON object with a `benchmarks` array | `native` |
| JSON array of `{name, value, unit}` objects | `benchmark-action` |
| Lines matching `Benchmark…  N  value unit` | `go` |

```ts
import { parse } from "@benchkit/format";

// Explicit format
const result = parse(goOutput, "go");

// Auto-detect (default)
const result = parse(unknownInput);
```

If auto-detection fails, `parse` throws with a message listing the supported
formats.

### `parseNative(input)`

Parses the benchkit native JSON format. Validates that the input contains a
`benchmarks` array with valid `name`, `metrics`, and optional `direction`
fields. Returns the object as-is after validation.

```ts
import { parseNative } from "@benchkit/format";

const result = parseNative(JSON.stringify({
  benchmarks: [
    { name: "Throughput", metrics: { eps: { value: 50000, direction: "bigger_is_better" } } }
  ]
}));
```

### `parseGoBench(input)`

Parses Go `testing.B` text output. Each benchmark line produces one
`Benchmark` entry. The `-P` processor suffix is extracted into a `procs` tag.
Multiple value/unit pairs on the same line produce separate metrics.

```ts
import { parseGoBench } from "@benchkit/format";

const result = parseGoBench(
  "BenchmarkFib20-8   30000   41653 ns/op   4096 B/op   12 allocs/op"
);
// result.benchmarks[0].metrics => { ns_per_op, bytes_per_op, allocs_per_op }
```

### `parseBenchmarkAction(input)`

Parses the JSON array format used by
[benchmark-action/github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark).
Each entry becomes a benchmark with a single metric called `value`. The
`range` string (e.g. `"± 300"`) is parsed into a numeric `range` field.

```ts
import { parseBenchmarkAction } from "@benchkit/format";

const result = parseBenchmarkAction(JSON.stringify([
  { name: "My Bench", value: 42000, unit: "ops/sec", range: "± 300" }
]));
```

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
then lowercase. Specific aliases (`B/op` → `bytes_per_op`, `MB/s` → `mb_per_s`)
take precedence.

In the native format, metric names are passed through unchanged — the keys of
the `metrics` object become the metric names.

## Direction semantics

Every metric may declare whether higher or lower values represent improvement.

| Direction | Meaning | Examples |
|---|---|---|
| `bigger_is_better` | Higher values are improvements | throughput, events/sec, MB/s |
| `smaller_is_better` | Lower values are improvements | latency, ns/op, allocations |

When direction is not specified, the parsers infer it from the unit string.
Each parser recognizes a different set of patterns:

**`parseGoBench`** — Go bench units:

| Pattern | Direction |
|---|---|
| `ns/`, `ms/`, `us/`, `s/`, `B/op`, `allocs/` | `smaller_is_better` |
| `ops/`, `MB/s` | `bigger_is_better` |
| anything else | `smaller_is_better` (default) |

**`parseBenchmarkAction`** — benchmark-action units:

| Pattern | Direction |
|---|---|
| `ops/s`, `op/s`, `/sec`, `MB/s`, `throughput`, `events` | `bigger_is_better` |
| anything else | `smaller_is_better` (default) |

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
