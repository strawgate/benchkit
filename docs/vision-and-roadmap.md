# Benchkit Vision and Roadmap

This document captures the intended product direction for benchkit and is the
source of truth for shipped/open roadmap status on `main`.

Short-lived next-agent sequencing belongs in
[`docs/internal/agent-handoff.md`](internal/agent-handoff.md), not here.

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
- emit arbitrary metrics like `events_per_sec`, `peak_memory_mb`,
  `p95_latency_ms`, or page-load timings — all as OTLP metrics
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

## OTLP-everywhere architecture direction

**OTLP JSON is the only data format in benchkit.** There is no separate
"native" or "benchkit" intermediate format. Every component — parsers, actions,
storage, aggregation, charts — operates on `OtlpMetricsDocument`.

See:

- [`docs/otlp-aggregation-architecture.md`](otlp-aggregation-architecture.md)
- [`docs/otlp-semantic-conventions.md`](otlp-semantic-conventions.md)
- [`docs/artifact-layout.md`](artifact-layout.md)

The principles are:

- **OTLP in, OTLP through, OTLP out** — parsers produce `OtlpMetricsDocument`,
  actions pass `OtlpMetricsDocument`, storage writes OTLP JSON
- benchkit semantic conventions on top of OTLP resource and datapoint attributes
- view-shaped derived artifacts for UI flows
- dataset-local frontend transforms

The legacy `BenchmarkResult` / "native" format is being removed. All parsers
(Go, Rust, Hyperfine, pytest-benchmark, etc.) will produce `OtlpMetricsDocument`
directly. The `emit-metric` action already follows this model and serves as the
reference implementation.

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

The most important active cleanup/product-clarity work is:

- `#159` — define current-truth docs and deprecation policy
- `#160` — clarify the role of `packages/dashboard`
- `#161` — add migration-readiness and example coverage matrix
- `#162` — fix public dashboard accessibility and semantics
- `#163` — align chart docs with shipped surfaces

These issues make the public docs, dashboard positioning, and current-truth path
match the repository as it exists today.

### Open architecture and product work

The main remaining open implementation work after the current docs/product
cleanup is:

- `#93` — dataset-local transform layer for chart views
- `#83` — `CompetitiveDashboard`
- `#79` — workflow benchmark starter kit
- `#81` — JSON and Prometheus collector helpers
- `#7` — integration examples and workflow benchmark recipes
- `#63` — simplify CI workflow to use the root build command

Some foundations that those issues depend on are already shipped on `main`,
including OTLP semantic conventions (`#89`), OTLP parser/projection support
(`#90`), `RunDashboard` (`#61`), `RunDetail` (`#82`), and the initial chart IA
refactor (`#54`).

### Workflow benchmark ergonomics

This backlog now exists explicitly and no longer needs to be described as a gap
in issue coverage:

- `#79` — workflow benchmark starter kit
- `#81` — JSON and Prometheus collector helpers
- `#7` — integration examples and benchmark recipes

The native-result emitter helper (`#80`) is already shipped through the builder
APIs in `@benchkit/format`.

### Dashboard surfaces

The main chart-surface work remains open:

- `#83` — `CompetitiveDashboard`

`RunDashboard` and `RunDetail` are already shipped. Current dashboard-facing
cleanup is tracked in `#160`, `#162`, and `#163`.

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

### Phase 2 — Stabilize the shipped docs and product story

Goal:

- make the active docs and public surfaces describe the repository truthfully

Work:

- land `#159`, `#160`, `#161`, `#162`, and `#163`
- keep the docs hub, roadmap, and handoff docs from drifting into duplicate
  status owners

Exit criteria:

- there is one active owner for roadmap/shipped status
- users can tell what is shipped, what is demo-only, and what is still future
  work

### Phase 3 — Workflow benchmark ergonomics and bounded transforms

Goal:

- continue the remaining implementation work on top of the already-shipped OTLP
  and run-detail foundations without reopening docs-ownership confusion

Work:

- continue the bounded dataset-local transform work (`#93`)
- ship the remaining workflow benchmark ergonomics work (`#79`, `#81`, `#7`)

Exit criteria:

- a new user can copy a minimal recipe to benchmark:
  - an HTTP API
  - a service exposing JSON stats
  - a service exposing Prometheus metrics
  - a browser/page-load workflow
- dataset-local transforms are available for shipped chart surfaces without
  requiring browser-side cross-file joins

### Phase 4 — Split the dashboard into real user journeys

Goal:

- stop treating the metric dashboard as the only top-level UX

Work:

- continue from the shipped `RunDashboard`/`RunDetail` surfaces and design the
  remaining scenario-first experience
- keep monitor diagnostics in run detail
- build on the emitted aggregate artifacts instead of browser-side cross-file
  joins

Exit criteria:

- run / PR style projects feel natural in benchkit
- competitive benchmarking projects feel natural in benchkit

### Phase 5 — Infra and monitor follow-up

Goal:

- keep the collector-backed monitor and repo tooling aligned with the rest of
  the architecture

Work:

- simplify CI usage of the root build command (`#63`)
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
