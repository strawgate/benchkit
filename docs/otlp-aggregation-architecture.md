# OTLP Aggregation Architecture

This document describes the OTLP-everywhere architecture for benchkit.

OTLP JSON is the single data format at every layer: input parsing, in-memory
representation, on-disk storage, aggregation, and view generation. There is no
separate "native" or "benchkit" intermediate format.

## Why OTLP everywhere

Previous benchkit architecture used a custom `BenchmarkResult` type as the
internal lingua franca. Parsers converted tool-specific output into
`BenchmarkResult`, which was then projected to OTLP for storage. This created
two parallel type systems and required round-trip conversion logic.

The new direction eliminates the intermediate format entirely:

- **Parsers produce `OtlpMetricsDocument` directly.** Reading Go bench output?
  Produce OTLP. Reading pytest-benchmark JSON? Produce OTLP. Emitting a custom
  metric? Produce OTLP.
- **Actions pass `OtlpMetricsDocument`.** Stash writes OTLP JSON to disk.
  Compare reads OTLP JSON. Aggregate traverses OTLP datapoints.
- **Storage is OTLP JSON.** Already the case on the data branch.
- **Charts consume view-shaped artifacts** derived from OTLP.

Benefits:

- one type system instead of two
- no lossy round-trip conversions
- standards-based format that tools outside benchkit can produce and consume
- `emit-metric` action already follows this model — it serves as the reference
  implementation

## Design goals

1. **OTLP as the only data format**
   Every component — parsers, actions, storage, aggregation — operates on
   `OtlpMetricsDocument`. No intermediate types.

2. **Keep frontend fetches small and purposeful**
   The frontend should not fetch hundreds of raw run files or one giant
   everything blob.

3. **Preserve raw telemetry fidelity**
   Raw telemetry should stay available for later re-aggregation and deep
   diagnostics.

4. **Generate UI-shaped artifacts**
   Aggregation should emit files that directly power product workflows:
   - metric exploration
   - competitive benchmarking
   - PR/run benchmarking

5. **Avoid frontend cross-file joins**
   The frontend may locally reshape one dataset, but it should not perform
   warehouse-style joins across many files.

## Non-goals

- Full PromQL compatibility in the first implementation
- Replacing all benchkit semantics with generic OTLP semantics
- Introducing a mandatory metrics database
- Requiring DuckDB-Wasm for every page load

## High-level architecture

### 1. Canonical raw storage

Raw benchmark and telemetry data should be stored in OTLP JSON.

Recommended layout:

```text
bench-data
└── data/
    ├── runs/
    │   ├── {run-id}/
    │   │   ├── result.otlp.json
    │   │   ├── telemetry.otlp.json
    │   │   └── metadata.json
    │   └── ...
    ├── index/
    ├── views/
    └── telemetry/
```

If nested run directories are too disruptive as a first step, a transitional
layout is acceptable:

```text
data/runs/{run-id}.otlp.json
data/telemetry/{run-id}.otlp.json
```

The key principle is:

- raw files are immutable
- derived files are regenerated

### 2. Aggregation ownership

Benchmark-producing workflows should only append raw run artifacts to
`bench-data`.

Aggregation should become a dedicated workflow triggered by pushes to
`bench-data`, ideally filtered to raw-run paths only. Derived-file writes should
be owned exclusively by the aggregate workflow.

This implies:

- stash/record flows are append-only
- aggregate is the single writer for derived views
- producers do not rebuild `index.json` or `series/*.json`

## Semantic model on top of OTLP

OTLP is the canonical raw format, but benchkit still needs its own semantic
conventions so the aggregator and UI can interpret benchmark data consistently.

The canonical semantic contract now lives in:

- [`docs/otlp-semantic-conventions.md`](otlp-semantic-conventions.md)

### Required benchkit resource attributes

These should be present on metric resources or otherwise derivable:

- `benchkit.run_id`
- `benchkit.ref`
- `benchkit.commit`
- `benchkit.workflow`
- `benchkit.job`
- `benchkit.kind`
  - `code`
  - `workflow`
  - `hybrid`

### Required benchmark attributes

These are benchmark-specific semantic keys:

- `benchkit.scenario`
- `benchkit.series`
- `benchkit.metric.direction`
  - `bigger_is_better`
  - `smaller_is_better`
- optional grouping keys such as:
  - `benchkit.impl`
  - `benchkit.dataset`
  - `benchkit.transport`
  - `benchkit.batch_size`

### Metric naming expectations

Metric names should remain explicit and stable, for example:

- `events_per_sec`
- `p95_latency_ms`
- `service_rss_mb`
- `_monitor.cpu_user_pct`
- `_monitor.wall_clock_ms`

Benchkit should not rely on UI-time string heuristics to infer semantic meaning
that could have been encoded once during normalization.

## Aggregation layers

The aggregator should produce several classes of derived artifacts.

### A. Navigation indexes

Small, cheap files loaded on most page visits:

- `data/index/runs.json`
- `data/index/refs.json`
- `data/index/prs.json`
- `data/index/scenarios.json`
- `data/index/metrics.json`

These answer:

- what runs exist?
- what PRs/refs/scenarios exist?
- what drilldowns are available?

### B. Overview views

Files tailored to top-level product surfaces:

- `data/views/metrics/{metric}/summary.json`
- `data/views/prs/{pr}/summary.json`
- `data/views/refs/{ref}/latest.json`
- `data/views/scenarios/{scenario}/summary.json`
- `data/views/leaderboards/{metric}.json`
- `data/views/regressions/recent.json`

These are the primary frontend fetch targets for overview pages.

### C. Focused detail views

Medium-sized files loaded after user intent is clear:

- `data/views/runs/{run-id}/detail.json`
- `data/views/prs/{pr}/detail.json`
- `data/views/scenarios/{scenario}/detail.json`
- `data/views/metrics/{metric}/series.json`

These can contain enough data for one detail page without requiring the browser
to fetch hundreds of raw artifacts.

### D. Raw telemetry access

Large files that should only be loaded on demand:

- `data/runs/{run-id}/telemetry.otlp.json`

This preserves fidelity without forcing the default UI path to pay for it.

## Frontend responsibilities

The frontend should not:

- fetch many run files and join them
- query arbitrary raw OTLP across the branch
- reconstruct the entire benchmark model from scratch

The frontend may:

- locally reshape one already-scoped dataset
- hide/show/filter/group series inside a single detail dataset
- aggregate over attributes within one dataset

Examples:

- hide one process from a run-scoped process metrics dataset
- group all process metrics by `process.name`
- collapse several series into one sum/avg/max line

This is a bounded, dataset-local transform layer, not a distributed query
engine.

## Recommended frontend query/rendering model

### Default product path

The default chart package should consume view-shaped artifacts like:

- PR summaries
- run details
- scenario details
- metric series

These should be simple JSON contracts optimized for rendering.

### Optional advanced path

For power users or exploratory analysis, benchkit can later offer an optional
\"analyze\" mode using DuckDB-Wasm plus OTLP input, but this should not be the
default dashboard dependency.

Reasons:

- larger bundle/runtime cost
- higher startup overhead
- more complexity than most product pages need

## Temporality guidance

If OTLP is canonical, temporality must be explicit.

Recommendation:

- prefer **cumulative** temporality for stored benchmark and telemetry data
  unless there is a strong reason to use delta

Why:

- dropped cumulative samples lose resolution, not total value
- cumulative data is easier to re-aggregate later
- cumulative semantics are friendlier for future rate/increase-style transforms

If delta metrics are ingested, benchkit should normalize them during
aggregation or record their temporality clearly in the semantic layer.

## Custom aggregation extension point

After the built-in view artifacts are stable, benchkit should support a custom
post-aggregate extension point so users can generate additional derived views
without changing core benchkit behavior.

Possible forms:

- JS/TS hook
- Python script hook
- DuckDB batch recipe

Custom aggregations should write to a reserved namespace such as:

```text
data/custom/**
```

This keeps core views stable and user-specific views flexible.

## Recommended implementation order

### Phase 1 — Semantic conventions ✅

- define required OTLP resource and metric attributes
- define direction/identity conventions
- document benchmark-kind/resource-attribute expectations

### Phase 2 — OTLP normalization (partial)

- ✅ add OTLP parsing and traversal helpers in `@benchkit/format`
- ✅ add projection helpers for OTLP ↔ legacy conversion
- remaining: remove legacy `BenchmarkResult` conversions entirely

### Phase 3 — OTLP-everywhere parser migration

- add `buildOtlpResult()` helper (modeled on emit-metric's
  `buildOtlpMetricPayload`) to construct `OtlpMetricsDocument` with proper
  resource attributes and benchmark datapoint attributes
- rewrite each parser to produce `OtlpMetricsDocument` directly:
  - `parse-go.ts`
  - `parse-rust.ts`
  - `parse-hyperfine.ts`
  - `parse-pytest-benchmark.ts`
  - `parse-benchmark-action.ts`
- remove `parseNative`, `buildNativeResult`, `stringifyNativeResult`,
  `NativeResultInit`, `NativeBenchmarkInit`, `NativeMetricInit`
- remove `BenchmarkResult`, `Benchmark`, `Metric`, `Sample`, `Context` types
- remove `parse-native.ts`, `native-builder.ts`, `run-detail-converter.ts`
- remove `benchmark-result.schema.json`
- update `parseBenchmarks()` return type to `OtlpMetricsDocument`

### Phase 4 — Action migration

- rewrite stash action to write OTLP JSON (`.otlp.json`) instead of
  `BenchmarkResult` JSON
- rewrite aggregate action to read OTLP JSON and traverse datapoints
- rewrite compare action to accept `OtlpMetricsDocument` inputs
- emit-metric already produces OTLP — no changes needed
- monitor already produces OTLP — no changes needed

### Phase 5 — Aggregated view artifacts

- add navigation indexes
- add run/PR/scenario/metric detail views
- keep raw OTLP sidecars available

### Phase 6 — Frontend transform layer

- dataset-local transforms for one detail dataset
- series hide/show/filter/group/aggregate
- chart-library adapters for benchmark surfaces

### Phase 7 — Optional advanced query mode

- investigate DuckDB-Wasm as an opt-in analysis mode
- evaluate SQL or a constrained PromQL-like query subset on normalized OTLP

## Decision summary

Architecture direction:

- **OTLP JSON is the only format** — no `BenchmarkResult`, no "native" format
- parsers produce `OtlpMetricsDocument` directly
- benchkit defines semantic conventions on top of OTLP
- aggregate produces several view-shaped artifacts for product workflows
- frontend performs only local reshaping within one fetched dataset
- raw telemetry remains available for deep diagnostics
- advanced query engines are optional, not the default path
- `emit-metric` is the reference implementation for OTLP construction
