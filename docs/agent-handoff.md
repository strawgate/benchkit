# Agent Handoff

This document is the current high-signal handoff for future agents working on
benchkit.

It supersedes the older GitHub issue handoff notes, which are now stale in
multiple places.

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

Benchkit should be ready to power both, while still leaving room for future use
cases.

## Strategic architecture decisions

### 1. Runs and scenarios are the primary UX surfaces

Metrics are the primitive, but top-level UX should be organized around:

- runs / PRs
- scenarios

not around one monolithic metric-first dashboard.

### 2. Runner diagnostics belong in run detail

Runner / monitor metrics are useful, but not as top-level overview content.
They should appear in `RunDetail` and related diagnostics surfaces.

### 3. OTLP is the canonical raw direction

Benchkit is moving toward:

- OTLP JSON as canonical raw metric storage
- semantic conventions on top of OTLP
- view-shaped aggregate artifacts for product surfaces

### 4. No universal benchkit telemetry point model

This is important.

Do **not** invent a generic benchkit-wide telemetry intermediate that all OTLP
data must normalize into.

Instead:

- keep OTLP as raw canonical storage
- provide typed OTLP parsing / traversal helpers
- provide **adapter-specific projections** for downstream consumers

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

Shipped and pushed:

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

Shipped and pushed:

- `save-data-file`
- `summary`
- summary markdown to `GITHUB_STEP_SUMMARY`

### Compare action

Shipped and pushed:

- `actions/compare`
- baseline loading from `bench-data`
- markdown summary output
- PR comment update behavior
- optional fail-on-regression

### Chart package / demo direction

Shipped and pushed:

- substantial chart package cleanup
- density / containment improvements
- straight line segments instead of curves
- thinner default lines with configurable `lineWidth`
- demo app with three modes:
  - `Custom metric`
  - `Competitive`
  - `PR`
- shared run-detail flow in the demo

## Demo repo state

The `benchkit-demo` repo is no longer just a Go microbenchmark demo.

It now includes:

- code benchmark workflow
- workflow benchmark workflow
- hybrid workflow benchmark workflow
- workflow benchmark guide
- native benchmark examples
- mock workflow benchmark scripts
- generic JSON collector helper
- generic Prometheus collector helper

Important demo repo principles now in use:

- PRs compare against baseline
- `main` writes long-term data and aggregates

GitHub validation already run:

- `Workflow Benchmark`: success
- `Hybrid Workflow Benchmark`: success

The one thing still intentionally not fully validated is the real PR comment
path under an actual `pull_request` event.

## Current roadmap / milestones

### `v0.1.0: First Release`

Still open:

- `#38` release automation
- `#63` CI simplification

### `v0.2.0: PR Comparison`

The originally critical PR comparison issues are now implemented:

- `#46` closed
- `#47` closed
- `#48` closed
- `#50` closed

This milestone is effectively the shipped PR comparison foundation.

### `v0.4.0: Run & Competitive Dashboards`

Main dashboard-surface milestone:

- `#61` RunDashboard
- `#82` RunDetail
- `#83` CompetitiveDashboard
- plus chart-support issues like `#59`, `#60`, `#54`

### `v0.5.0: Workflow Benchmark Ergonomics`

Ergonomics / starter-kit milestone:

- `#79`
- `#80`
- `#81`
- `#7`

This milestone is partly fulfilled but still open for productization.

### `v0.6.0: OTLP Aggregation Architecture`

Current core architecture milestone:

- `#89` semantic conventions
- `#90` OTLP parser / traversal + adapter projections
- `#91` aggregate view artifacts
- `#92` bench-data push aggregation flow
- `#93` dataset-local frontend transform layer

## Open PR queue

At the time of this handoff, the remaining open PRs are Copilot drafts that
were marked ready purely so CI can run:

- `#87` RunDetail
- `#88` CompetitiveDashboard
- `#94` aggregate view artifacts
- `#95` aggregate-on-push / stash naming
- `#96` dataset-local transforms
- `#97` ComparisonChart
- `#98` SampleChart

Important:

- `ready for review` does **not** mean approved
- they were flipped out of draft so checks could start
- several are likely to need rebase and direction corrections before merge

Current recommendation:

- keep `#94`, `#95`, `#97`, `#98` as the most plausible near-term merge
  candidates once rebased and green
- be more cautious with `#87`, `#88`, `#96` until the data / OTLP contract
  stabilizes further

## Copilot assignment split

### Best things for Copilot to own in parallel

- `#59` ComparisonChart
- `#60` SampleChart
- `#79` workflow starter kit
- `#80` native emitter ergonomics
- `#81` JSON / Prometheus collectors
- `#82` RunDetail
- `#83` CompetitiveDashboard
- `#91` aggregate view artifacts
- `#92` bench-data push aggregation flow
- `#93` dataset-local transform layer

### Best things to keep local / primary

- `#89` OTLP semantic conventions
- `#90` OTLP parser / traversal + adapter projection work

These are the contract and ingestion layers that too many other tasks depend on.

## What prototypes already exist

### Backend prototypes

In `actions/aggregate/src/prototype-views.ts`:

- by-ref index builder
- by-PR index builder
- run detail artifact shape
- metric summary artifact shape

These are prototypes, not final emitted artifacts yet.

### Frontend prototype

In `packages/chart/src/dataset-transforms.ts`:

- dataset-local filtering
- exclusion filters
- group-by-tag
- `sum`, `avg`, `max`
- sort-by-latest
- limiting visible series

This is the prototype for the bounded frontend transform layer.

### Why they matter

They are useful because they make the architecture concrete.
They are dangerous because it is easy to accidentally harden them into a public
API before the surrounding OTLP/storage plan is settled.

Treat them as scaffolding.

## What not to do

1. Do not build a giant frontend query system that joins across many files.
2. Do not invent a universal benchkit telemetry intermediate model.
3. Do not re-promote runner metrics as top-level overview content.
4. Do not overfit the product to only Go microbenchmarks.
5. Do not assume a Copilot PR being marked ready means it is mergeable.
6. Do not forget that action `dist/` bundles are committed artifacts.

## Practical next steps

The most coherent execution order from here is:

1. finish `#89` semantic conventions in a way parsers and producers can enforce
2. continue `#90` with typed OTLP traversal and narrowly scoped
   adapter-specific projections
3. promote `#91` prototype aggregate artifacts into a real first emitted set
4. align `#92` around append-only raw writes + aggregate-on-branch-push
5. then let `#93`, `#82`, `#83`, and `#61` stabilize against the now-clear
   data contracts

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

For the demo dashboard:

```bash
cd ../benchkit-demo/dashboard
npm run test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

## Recommended first questions for a new agent

Before changing code, answer:

1. Am I changing the semantic contract or just consuming it?
2. Is this work raw-format work, aggregate-artifact work, or view/UI work?
3. Does this require a new issue comment or PR guidance to keep Copilot aligned?
4. Am I accidentally introducing a universal telemetry abstraction we said we
   do not want?
5. Could this work be delayed until after `#90` if it depends on the OTLP
   contract?

If those answers are clear, the rest of the work tends to go well.
