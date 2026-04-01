# Benchkit Vision and Roadmap

This document captures the intended product direction for benchkit and maps the
current issue backlog to a plan that gets us there.

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

## Benchmark model

Benchkit needs to equally support two kinds of metrics in the same run:

1. **Outcome metrics**
   The metrics users actually care about:
   - `events_per_sec`
   - `docs_indexed_per_sec`
   - `p95_latency_ms`
   - `service_rss_mb`
   - `success_rate_pct`

2. **Diagnostic metrics**
   Metrics captured by `actions/monitor`:
   - `_monitor/wall_clock_ms`
   - `_monitor/cpu_user_pct`
   - `_monitor/peak_rss_kb`
   - `_monitor/io_write_bytes`

The native benchmark format already supports this shape. The missing work is
mostly around authoring ergonomics and productized dashboards.

## Aggregation architecture

Benchkit is also moving toward a more explicit OTLP-first aggregation model.
See [`docs/otlp-aggregation-architecture.md`](otlp-aggregation-architecture.md)
for the current proposal around:

- OTLP as canonical raw storage
- benchkit semantic conventions on top of OTLP
- view-shaped derived artifacts for UI flows
- dataset-local frontend transforms

## Issue audit

### Issues that are directly on the critical path

- **#46 — `actions/compare`**
  This is central to the PR/run workflow.

- **#47 — stash job summary**
  Useful for visibility and adoption, especially before users have a polished
  dashboard.

- **#48 — `save-data-file` option in stash**
  Needed for PR workflows that should compare without polluting long-term data.

- **#50 — `formatComparisonMarkdown`**
  A core building block for compare action output and run/PR summaries.

- **#38 — release automation**
  Required before the package is easy to consume outside the demo repo.

### Issues that are directionally correct but should be reframed

- **#61 — PR-grouped dashboard view**
  The real target is larger than a grouped section. This should evolve into a
  dedicated run/PR-oriented dashboard surface with drilldown into run detail.

- **#54 — refactor `Dashboard.tsx`**
  Refactoring is still valuable, but the current dashboard shape should not be
  treated as the final UX. Refactor after the top-level IA is settled, not
  before.

- **#7 — integration examples**
  Correct and still needed. This should explicitly include workflow/native and
  hybrid benchmark examples, not just hosting guidance.

### Gaps not well represented by current issues

The current backlog does not yet capture several pieces of the vision:

- workflow benchmark starter kit
- native result emitter helper
- JSON / Prometheus metric collection helpers
- competitive dashboard surface
- shared run detail surface across all entry points
- documentation that teaches "measure anything in a workflow"
- demo repo examples covering code, workflow, and hybrid benchmark types

These should become explicit issues or epics.

## Plan

### Phase 1 — Make PR and run workflows real

Goal:

- make benchkit genuinely useful for PR regression detection and run analysis

Work:

- ship `formatComparisonMarkdown` (#50)
- ship `actions/compare` (#46)
- add `save-data-file` to stash (#48)
- add stash job summary support (#47)
- keep compare output useful in PR comments and job summaries

Exit criteria:

- users can benchmark a PR, compare against baseline, and review results
  without opening the dashboard

### Phase 2 — Make workflow benchmarks ergonomic

Goal:

- let users benchmark arbitrary workflows without hand-rolling too much glue

Work:

- add a native result emitter helper
- add example collectors for JSON and Prometheus endpoints
- add cookbook docs for code, workflow, and hybrid benchmark patterns
- strengthen integration examples (#7)

Exit criteria:

- a new user can copy a minimal recipe to benchmark:

  - an HTTP API
  - a service that exposes JSON stats
  - a service with Prometheus metrics
  - a browser/page-load workflow

### Phase 3 — Split the dashboard into real user journeys

Goal:

- stop treating the metric dashboard as the only top-level UX

Work:

- design a `RunDashboard` / PR-oriented surface
- design a `CompetitiveDashboard`
- make `RunDetail` a first-class reusable surface
- keep monitor metrics in run detail
- re-scope #61 toward the new run/PR dashboard model

Exit criteria:

- beats-bench style projects feel natural in benchkit
- competitive benchmarking projects feel natural in benchkit

### Phase 4 — Polish, refactor, and publish

Goal:

- package the system as a polished toolkit ready for wider adoption

Work:

- release automation (#38)
- dashboard/package refactors (#54 and follow-ups)
- additional chart polish and ergonomics
- demo repo switch to published packages

Exit criteria:

- consumers can install published packages and follow documented recipes without
  cloning benchkit internals

## Suggested new epics

These do not yet have clear issue coverage and should be filed:

1. **Workflow benchmark starter kit**
   Provide emitter helpers, collector helpers, and starter workflows.

2. **Run detail as a first-class chart package surface**
   A reusable run inspection component shared by all dashboard entry points.

3. **Competitive dashboard**
   Scenario-first dashboard for ranking and gap analysis.

4. **Run / PR dashboard**
   Baseline vs selected-run workflow with diagnostics and drilldown.

5. **Workflow benchmark cookbook**
   Documentation with copy-paste recipes for measuring arbitrary stats in
   workflows.

## What we should not optimize for

- strict backward compatibility in the current dashboard API while the product
  direction is still changing
- presenting runner metrics as top-level overview content
- over-fitting the toolkit to only Go microbenchmarks

## Near-term recommendation

The next implementation priority should be:

1. finish the PR comparison workflow (#46, #47, #48, #50)
2. add the workflow benchmark ergonomics layer (helpers + cookbook docs)
3. only then reshape the chart package into the scenario/run-oriented surfaces

That sequence gives benchkit immediate user value while still moving toward the
larger product vision.
