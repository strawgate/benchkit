# benchkit JSON schemas

This directory contains [JSON Schema (2020-12)](https://json-schema.org/draft/2020-12/schema) definitions for the data files produced by benchkit. Every file on the `bench-data` branch conforms to one of these schemas.

## Schemas

### `benchmark-result.schema.json`

Defines the **native benchmark result** format. All input formats (Go bench,
benchmark-action, etc.) are normalized to this shape by the
[`@benchkit/format`](../packages/format/README.md) parsers.

Top-level structure:

```jsonc
{
  "benchmarks": [
    {
      "name": "BenchmarkScanner",
      "tags": { "procs": "8" },            // optional grouping dimensions
      "metrics": {
        "ns_per_op": {
          "value": 41653,
          "unit": "ns/op",
          "direction": "smaller_is_better", // or "bigger_is_better"
          "range": 120                      // optional ± variance
        }
      },
      "samples": [                          // optional time-series
        { "t": 0, "ns_per_op": 42000 },
        { "t": 1, "ns_per_op": 41300 }
      ]
    }
  ],
  "context": {                              // optional run metadata
    "commit": "abc123...",
    "ref": "main",
    "timestamp": "2025-01-15T10:30:00Z",
    "runner": "ubuntu-latest"
  }
}
```

Written to `data/runs/{runId}.json` by `bench-stash`.

### `index.schema.json`

Defines the **run index** maintained on the data branch.

```jsonc
{
  "runs": [
    {
      "id": "12345678-1",                   // unique run identifier
      "timestamp": "2025-01-15T10:30:00Z",
      "commit": "abc123...",
      "ref": "main",
      "benchmarks": 5,                      // number of benchmarks in the run
      "metrics": ["ns_per_op", "bytes_per_op"]
    }
  ],
  "metrics": ["ns_per_op", "bytes_per_op", "allocs_per_op"]  // all known metrics
}
```

Written to `data/index.json` by `bench-aggregate`.

### `series.schema.json`

Defines **pre-aggregated time-series** data for a single metric.

```jsonc
{
  "metric": "ns_per_op",
  "unit": "ns/op",
  "direction": "smaller_is_better",
  "series": {
    "BenchmarkScanner": {
      "tags": { "procs": "8" },
      "points": [
        {
          "timestamp": "2025-01-14T08:00:00Z",
          "value": 42000,
          "commit": "def456...",
          "run_id": "12345678-1",
          "range": 120
        },
        {
          "timestamp": "2025-01-15T10:30:00Z",
          "value": 41653,
          "commit": "abc123...",
          "run_id": "12345679-1"
        }
      ]
    }
  }
}
```

Written to `data/series/{metricName}.json` by `bench-aggregate`.

## Direction field

The `direction` field on metrics and series declares whether higher or lower
values represent improvement:

| Value | Meaning | Typical metrics |
|---|---|---|
| `bigger_is_better` | Higher = improvement | throughput, events/sec, MB/s |
| `smaller_is_better` | Lower = improvement | latency (ns/op), memory (B/op), allocations |

When direction is absent, consumers should default to `smaller_is_better`.

## Validating data

### CLI (with ajv-cli)

```bash
npx ajv validate -s schema/benchmark-result.schema.json -d my-results.json
npx ajv validate -s schema/index.schema.json -d data/index.json
npx ajv validate -s schema/series.schema.json -d data/series/ns_per_op.json
```

### Programmatic (with @benchkit/format)

```ts
import { parseNative } from "@benchkit/format";
import fs from "node:fs";

// Throws with a descriptive message if the file is invalid
const result = parseNative(fs.readFileSync("my-results.json", "utf-8"));
```

## Relationship between files

```
bench-stash                      bench-aggregate
    │                                  │
    ▼                                  ▼
data/runs/{id}.json ───────► data/index.json
  (benchmark-result)           (index)
                               data/series/{metric}.json
                                 (series)
```

1. `bench-stash` parses benchmark output and writes a run file.
2. `bench-aggregate` reads all run files and rebuilds the index and series.
3. `@benchkit/chart` reads the index and series to render dashboards.
