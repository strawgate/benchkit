# Agent Handoff

This document is the current high-signal handoff for future agents working on
benchkit.

It supersedes older GitHub issue handoff notes. In particular, issue `#71`
should be treated as historical context rather than the current source of truth.

## Read order

When picking up work, read these files in this order:

1. [`../../AGENTS.md`](../../AGENTS.md)
2. [`../../README.md`](../../README.md)
3. [`../../DEVELOPING.md`](../../DEVELOPING.md)
4. [`../../CODE_STYLE.md`](../../CODE_STYLE.md)
5. [`../vision-and-roadmap.md`](../vision-and-roadmap.md)
6. [`../otlp-aggregation-architecture.md`](../otlp-aggregation-architecture.md)
7. [`../otlp-semantic-conventions.md`](../otlp-semantic-conventions.md)

Then read the package or action you are about to edit.

## Current product direction

The key product principle is:

- **generic core**
- **highly ergonomic first-class workflows**

Benchkit should remain generic in its fundamentals:

- metric model
- run model
- compare pipeline
- stash / aggregate / monitor actions
- chart primitives

But it should make a small number of obvious workflows very easy:

1. custom metric exploration
2. competitive benchmarking
3. PR / run benchmarking

The long-term migration targets are:

- `beats-bench` for run / PR style benchmarking
- `memagent` for competitive benchmarking

## Strategic architecture decisions

### 1. Runs and scenarios are the primary UX surfaces

Metrics are the primitive, but top-level UX should be organized around:

- runs / PRs
- scenarios

not around one monolithic metric-first dashboard.

### 2. Runner diagnostics belong in run detail

Runner / monitor metrics are useful, but not as top-level overview content.
They should appear in run detail and related diagnostics surfaces.

### 3. OTLP is the canonical raw direction

Benchkit is moving toward:

- OTLP JSON as canonical raw metric storage
- semantic conventions on top of OTLP
- view-shaped aggregate artifacts for product surfaces

### 4. No universal benchkit telemetry point model

Do **not** invent a generic benchkit-wide telemetry intermediate that all OTLP
work must normalize into.

Instead:

- keep OTLP as raw canonical storage
- provide typed OTLP parsing / traversal helpers
- provide adapter-specific projections for downstream consumers

Examples:

- compare / summary adapters
- aggregate artifact builders
- chart dataset transforms

### 5. Frontend should not perform cross-file joins

The frontend may:

- reshape one already-fetched dataset
- filter series
- group or aggregate within one dataset

The frontend should **not**:

- fetch hundreds of raw run files
- join across many artifacts
- reconstruct the whole benchmark model in-browser

## What is already shipped on `main`

### Format package

Shipped:

- `compare()`
- `formatComparisonMarkdown()`
- parsers for native, Go bench, Rust bench, Hyperfine, benchmark-action, pytest-benchmark
- native builder helpers: `defineMetric()`, `defineBenchmark()`, `buildNativeResult()`, `stringifyNativeResult()`
- initial OTLP support: parse / traversal helpers, metric kind detection, temporality detection, and one compatibility projection into benchmark-style results

### Stash action

Shipped:

- `save-data-file`
- `summary`
- summary markdown to `GITHUB_STEP_SUMMARY`

### Compare action

Shipped:

- baseline loading from `bench-data`
- markdown summary output
- PR comment update behavior
- optional fail-on-regression

### Aggregate action

Shipped:

- `data/index.json`
- `data/series/*.json`
- `data/index/refs.json`
- `data/index/prs.json`
- `data/index/metrics.json`
- `data/views/runs/{run-id}/detail.json`
- branch-driven aggregate workflow guidance and collision-proof raw run naming

### Monitor action

The current monitor work in this repository is the OTel Collector-based model. It is a single-step action with automatic post cleanup and raw OTLP sidecar storage under `data/telemetry/`.

## Current roadmap / milestones

- `v0.4.0`: `#61`, `#82`, `#83`, `#54`
- `v0.5.0`: `#79`, `#80`, `#81`, `#7`
- `v0.6.0`: `#89`, `#90`, `#93`

Already landed from the OTLP milestone:

- `#91` aggregate view artifacts
- `#92` bench-data push aggregation flow / stash naming guidance

## What prototypes already exist

### Aggregate artifact builders

In `actions/aggregate/src/views.ts` and related tests:

- ref index builder
- PR index builder
- metric index builder
- run detail artifact builder

### Frontend transform prototype

In `packages/chart/src/dataset-transforms.ts`:

- dataset-local filtering
- exclusion filters
- group-by-tag
- `sum`, `avg`, `max`
- sort-by-latest
- limiting visible series

Treat this as scaffolding for the bounded frontend transform layer, not as a
final public product surface.

## What not to do

1. Do not build a giant frontend query system that joins across many files.
2. Do not invent a universal benchkit telemetry intermediate model.
3. Do not re-promote runner metrics as top-level overview content.
4. Do not overfit the product to only Go microbenchmarks.
5. Do not assume old Copilot PR references are still active without checking GitHub.
6. Do not forget that action `dist/` bundles are committed artifacts.
