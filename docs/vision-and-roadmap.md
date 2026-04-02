# Benchkit Vision and Roadmap

This document captures the intended product direction for benchkit and maps the
current issue backlog to the work that is still open on `main`.

## Product vision

Benchkit should become the simplest way to publish, compare, and investigate
benchmark results from GitHub workflows, whether the thing being benchmarked is:

- a microbenchmark (`go test -bench`, Rust bench, Hyperfine, etc.)
- a workflow benchmark (hit an HTTP endpoint, load a page, scrape a metrics
  endpoint, parse a report, ingest a dataset)
- a hybrid benchmark (custom result metrics plus runner/process telemetry from
  `actions/monitor`)

The core design principle is:

- **metrics are the primitive**
- **runs and scenarios are the primary UX surfaces**

Benchkit should power three first-class user journeys:

1. **Custom metric exploration**
   Use benchkit primitives directly to explore arbitrary metrics over time.
2. **Competitive benchmarking**
   Compare one product or implementation against several others across a small
   set of scenarios, track rank, and explain changes.
3. **PR and run benchmarking**
   Compare a PR or a single run against a baseline, identify regressions, and
   inspect the exact run that produced them.

## User-facing outcomes

When benchkit is working well, users should be able to:

- copy a workflow example and publish useful benchmark data without reverse
  engineering the demo repo
- emit arbitrary native metrics like `events_per_sec`, `peak_memory_mb`,
  `p95_latency_ms`, or page-load timings
- attach monitor telemetry without mixing outcome metrics and diagnostics
- open a dashboard optimized for their workflow instead of a one-size-fits-none
  dashboard
- click into a specific run from any top-level view and inspect its stats,
  diagnostics, and artifacts

## Information architecture target

The chart package should evolve toward these high-level surfaces:

- `CustomMetricDashboard`
- `CompetitiveDashboard`
- `RunDashboard`
- `RunDetail`

Supporting primitives remain reusable:

- trend charts
- comparison charts
- leaderboards
- run tables
- tag filters

Runner and monitor metrics should not be overview content by default. They
belong in run detail and diagnostics.

## Current state on `main`

Benchkit has already shipped several pieces that older planning docs still list
as future work:

- release automation for npm packages and GitHub releases (`#38`)
- PR comparison foundations:
  - `compare()`
  - `formatComparisonMarkdown()`
  - `actions/compare`
  - stash job summaries
  - `save-data-file`
- expanded parser support in `@benchkit/format`:
  - Rust bench
  - Hyperfine
  - pytest-benchmark
  - initial OTLP parsing and compatibility projection helpers
- expanded aggregate outputs on the data branch:
  - `data/index.json`
  - `data/series/*.json`
  - `data/index/refs.json`
  - `data/index/prs.json`
  - `data/index/metrics.json`
  - `data/views/runs/{run-id}/detail.json`
- recommended producer/aggregate workflow separation and collision-proof run
  naming

The collector-backed monitor work tracked by PR `#101` is the current monitor
direction for this repository. It starts a single-step OTel Collector, exposes
OTLP endpoints during the job, and stores raw telemetry sidecars under
`data/telemetry/` in its post step.

## Aggregation architecture direction

Benchkit is moving toward a more explicit OTLP-first aggregation model. See:

- [`docs/otlp-aggregation-architecture.md`](otlp-aggregation-architecture.md)
- [`docs/otlp-semantic-conventions.md`](otlp-semantic-conventions.md)
- [`docs/artifact-layout.md`](artifact-layout.md)

The direction is:

- OTLP as canonical raw storage
- benchkit semantic conventions on top of OTLP
- view-shaped derived artifacts for UI flows
- dataset-local frontend transforms

## Issue audit

### Recently shipped foundations

These are done and should not be treated as upcoming roadmap items anymore:

- `#38` — release automation
- `#46` — `actions/compare`
- `#47` — stash job summary support
- `#48` — `save-data-file` in stash
- `#50` — `formatComparisonMarkdown`
- `#91` — aggregate view artifacts (first emitted set landed)
- `#92` — aggregate-on-push / collision-proof raw run flow

### Current critical path

The most important open architecture work is now the OTLP transition:

- `#89` — benchkit OTLP semantic conventions
- `#90` — OTLP parser / traversal + projection helpers in `@benchkit/format`
- `#93` — dataset-local transform layer for chart views

These issues define the contract and bounded transform model that later UI work
should build on.

### Workflow benchmark ergonomics

This backlog now exists explicitly and no longer needs to be described as a gap
in issue coverage:

- `#79` — workflow benchmark starter kit
- `#80` — native result emitter helper
- `#81` — JSON and Prometheus collector helpers
- `#7` — integration examples and benchmark recipes

### Dashboard surfaces

The main chart-surface work remains open:

- `#61` — `RunDashboard`
- `#82` — `RunDetail`
- `#83` — `CompetitiveDashboard`
- `#54` — chart refactor after the IA split settles

### Infra follow-up

- `#63` — simplify CI workflow to use the root build command

## Plan

### Phase 1 — Shipped PR and run workflow foundation

Done on `main`:

- compare pipeline and markdown formatting
- PR comment / summary support
- stash support for non-persistent PR runs
- release automation

This phase is now complete enough that docs should describe it as shipped.

### Phase 2 — Stabilize the OTLP contract

Goal:

- make OTLP a safe long-term raw format without introducing a universal
  benchkit telemetry intermediate

Work:

- finalize semantic conventions (`#89`)
- continue typed OTLP parsing and narrowly scoped projections (`#90`)
- keep aggregate and chart work aligned with that contract

Exit criteria:

- producers and parsers can agree on required OTLP semantics
- downstream code can consume OTLP safely through typed helpers and
  purpose-built projections

### Phase 3 — Workflow benchmark ergonomics

Goal:

- let users benchmark arbitrary workflows without hand-rolling too much glue

Work:

- ship the starter kit and helpers (`#79`, `#80`, `#81`)
- strengthen examples and cookbook docs (`#7`)
- keep recipes aligned with the aggregate artifact layout already on `main`

Exit criteria:

- a new user can copy a minimal recipe to benchmark:
  - an HTTP API
  - a service exposing JSON stats
  - a service exposing Prometheus metrics
  - a browser/page-load workflow

### Phase 4 — Split the dashboard into real user journeys

Goal:

- stop treating the metric dashboard as the only top-level UX

Work:

- design and ship `RunDashboard`, `RunDetail`, and `CompetitiveDashboard`
- keep monitor diagnostics in run detail
- build on the emitted aggregate artifacts instead of browser-side cross-file
  joins
- refactor shared chart code after the target IA settles (`#54`)

Exit criteria:

- run / PR style projects feel natural in benchkit
- competitive benchmarking projects feel natural in benchkit

### Phase 5 — Monitor architecture follow-up

Goal:

- land the collector-backed monitor cleanly and keep the OTLP telemetry story
  aligned with the rest of the architecture

Work:

- review PR `#101` together with the OTLP semantic and aggregate-artifact work
- keep monitor examples, telemetry storage docs, and aggregation plans aligned
- avoid reintroducing stash-time monitor conversion now that telemetry is stored
  as raw OTLP sidecars

Exit criteria:

- monitor docs and OTLP storage docs match the action implementation and the
  intended aggregate path

## What we should not optimize for

- strict backward compatibility in the current dashboard API while the product
  direction is still changing
- presenting runner metrics as top-level overview content
- over-fitting the toolkit to only Go microbenchmarks
- inventing a universal benchkit telemetry point model on top of OTLP
- frontend cross-file joins as the default query model

## Near-term recommendation

The next implementation priority should be:

1. finish `#89` and `#90`
2. keep `#93` aligned with emitted aggregate artifacts rather than inventing a
   separate frontend data model
3. ship the workflow benchmark ergonomics layer (`#79`, `#80`, `#81`, `#7`)
4. then reshape the chart package into run-first and scenario-first surfaces
   (`#61`, `#82`, `#83`, `#54`)
5. keep monitor docs aligned with PR `#101` and the raw-OTLP telemetry flow

That sequence keeps the repo accurate today while still moving toward the larger
product vision.
