# Agent Handoff

This document is the current high-signal handoff for future agents working on
benchkit.

It supersedes older GitHub issue handoff notes. In particular, issue `#71`
should be treated as historical context rather than the current source of truth.

## Read order

When picking up work, read these files in this order:

1. `AGENTS.md`
2. `README.md`
3. `DEVELOPING.md`
4. `CODE_STYLE.md`
5. `docs/vision-and-roadmap.md`
6. `docs/otlp-aggregation-architecture.md`
7. `docs/otlp-semantic-conventions.md`

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
- parsers for:
  - native
  - Go bench
  - Rust bench
  - Hyperfine
  - benchmark-action
  - pytest-benchmark
- native builder helpers:
  - `defineMetric()`
  - `defineBenchmark()`
  - `buildNativeResult()`
  - `stringifyNativeResult()`
- initial OTLP support:
  - OTLP parse / traversal helpers
  - metric kind detection
  - temporality detection
  - one compatibility projection into benchmark-style results

### Stash action

Shipped:

- `save-data-file`
- `summary`
- summary markdown to `GITHUB_STEP_SUMMARY`

### Compare action

Shipped:

- `actions/compare`
- baseline loading from `bench-data`
- markdown summary output
- PR comment update behavior
- optional fail-on-regression

### Aggregate action

Shipped:

- classic outputs:
  - `data/index.json`
  - `data/series/*.json`
- additional navigation/detail artifacts:
  - `data/index/refs.json`
  - `data/index/prs.json`
  - `data/index/metrics.json`
  - `data/views/runs/{run-id}/detail.json`
- branch-driven aggregate workflow guidance and collision-proof raw run naming

### Monitor action

The current monitor work in this repository is the OTel Collector-based model
tracked by PR `#101`. It is a single-step action with automatic post cleanup
and raw OTLP sidecar storage under `data/telemetry/`.

## Current roadmap / milestones

### `v0.1.0: First Release`

Open follow-up:

- `#63` CI simplification

Already landed:

- `#38` release automation

### `v0.4.0: Run & Competitive Dashboards`

Main dashboard-surface milestone:

- `#61` RunDashboard
- `#82` RunDetail
- `#83` CompetitiveDashboard
- supporting refactor: `#54`

### `v0.5.0: Workflow Benchmark Ergonomics`

Ergonomics / starter-kit milestone:

- `#79`
- `#80`
- `#81`
- `#7`

### `v0.6.0: OTLP Aggregation Architecture`

Current architecture milestone:

- `#89` semantic conventions
- `#90` OTLP parser / traversal + adapter projections
- `#93` dataset-local frontend transform layer

Already landed from this milestone:

- `#91` aggregate view artifacts (first emitted set)
- `#92` bench-data push aggregation flow / stash naming guidance

## Current open PRs

At the time of this handoff, the only open repository PR is:

- `#101` — collector-backed monitor implementation and raw OTLP telemetry storage

Treat older PR queue notes from stale docs or issue bodies as historical only.

## What prototypes already exist

### Aggregate artifact builders

In `actions/aggregate/src/views.ts` and related tests:

- ref index builder
- PR index builder
- metric index builder
- run detail artifact builder

These are no longer just conceptual prototypes; the aggregate action writes a
first emitted set of these artifacts on `main`.

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

## Practical next steps

The most coherent execution order from here is:

1. keep `#89` as the semantic-contract source of truth
2. continue `#90` with typed OTLP traversal and narrowly scoped,
   adapter-specific projections
3. keep `#93` aligned with the emitted aggregate artifact shapes
4. ship workflow benchmark ergonomics (`#79`, `#80`, `#81`, `#7`)
5. then let `#61`, `#82`, `#83`, and `#54` stabilize against the now-clear
   data contracts
6. only update monitor docs after `#101` lands or is replaced

## Commands and checks

Common useful commands:

```bash
npm ci
npm run build
npm run test
npm run lint
```

Targeted commands that have been useful recently:

```bash
npm run build --workspace=packages/format
npm run test --workspace=packages/format
npm run test --workspace=actions/stash
npm run test --workspace=actions/compare
npm run test --workspace=actions/aggregate
npm run test --workspace=packages/chart
```

## Recommended first questions for a new agent

Before changing code, answer:

1. Am I changing the semantic contract or just consuming it?
2. Is this work raw-format work, aggregate-artifact work, or view/UI work?
3. Does this require updated issue/PR guidance to keep collaborators aligned?
4. Am I accidentally introducing a universal telemetry abstraction we said we
   do not want?
5. Could this work be delayed until after `#90` if it depends on the OTLP
   contract?

If those answers are clear, the rest of the work tends to go well.
