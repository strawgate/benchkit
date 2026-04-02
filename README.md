# Benchkit

[![CI](https://github.com/strawgate/benchkit/actions/workflows/ci.yml/badge.svg)](https://github.com/strawgate/benchkit/actions/workflows/ci.yml)
[![npm @benchkit/format](https://img.shields.io/npm/v/%40benchkit%2Fformat?label=%40benchkit%2Fformat)](https://www.npmjs.com/package/@benchkit/format)
[![npm @benchkit/chart](https://img.shields.io/npm/v/%40benchkit%2Fchart?label=%40benchkit%2Fchart)](https://www.npmjs.com/package/@benchkit/chart)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Track benchmarks over time with GitHub Actions and static hosting — no servers required.**

Benchkit is a modular toolkit for recording, aggregating, and visualising benchmark results directly inside your GitHub repository. Results are committed to a dedicated `bench-data` branch, pre-aggregated into JSON files, and rendered with lightweight Preact chart components — all powered by GitHub's raw-content CDN so you never need a backend.

## Benchmarks

Benchkit dogfoods itself. View live results at **[strawgate.github.io/benchkit](https://strawgate.github.io/benchkit/)** — powered by the same actions and chart components in this repo.

## Components

| Component | Path | Description |
|-----------|------|-------------|
| **@benchkit/format** | [`packages/format`](packages/format) | TypeScript types and parsers that normalise Go bench, Rust bench, Hyperfine, pytest-benchmark, benchmark-action, OTLP, and native JSON formats into a common `BenchmarkResult` shape. |
| **@benchkit/chart** | [`packages/chart`](packages/chart) | Preact components (`TrendChart`, `ComparisonBar`, `RunTable`, `Leaderboard`, `TagFilter`, `MonitorSection`) that fetch pre-aggregated data and render interactive dashboards. |
| **Benchkit Stash** | [`actions/stash`](actions/stash) | GitHub Action — parses benchmark output and commits the normalized run result to the data branch. |
| **Benchkit Aggregate** | [`actions/aggregate`](actions/aggregate) | GitHub Action — reads every stored run and rebuilds `index.json`, per-metric `series/*.json`, navigation indexes under `data/index/`, and run detail views under `data/views/runs/`. |
| **Benchkit Compare** | [`actions/compare`](actions/compare) | GitHub Action — compares the current run against recent baseline runs, posts a PR comment, and optionally fails CI on regression. |
| **Benchkit Monitor** | [`actions/monitor`](actions/monitor) | GitHub Action — starts an OpenTelemetry Collector, scrapes host metrics, accepts OTLP metrics from benchmark code, and stores raw telemetry sidecars on the data branch in its post step. |
| **Benchkit Emit Metric** | [`actions/emit-metric`](actions/emit-metric) | GitHub Action — sends a one-off OTLP metric to the collector started by `actions/monitor`, so workflows can record custom scores without shipping their own OTLP client logic. |

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐
│  CI job runs  │      │ Stash Action │      │   bench-data branch      │
│  benchmarks   │─────▶│  parse &     │─────▶│                          │
│  (any format) │      │  commit      │      │  data/runs/{id}.json     │
└──────────────┘      └──────────────┘      └────────────┬─────────────┘
                                                         │
                                                         ▼
                                            ┌──────────────────────────┐
                                            │   Aggregate Action       │
                                            │   rebuild index & series │
                                            └────────────┬─────────────┘
                                                         │
                                                         ▼
                                            ┌──────────────────────────┐
                                            │   bench-data branch      │
                                            │                          │
                                            │  data/index.json         │
                                            │  data/index/*.json       │
                                            │  data/series/{metric}.json│
                                            │  data/views/runs/*       │
                                            └────────────┬─────────────┘
                                                         │
                                    fetched via raw.githubusercontent.com
                                                         │
                                                         ▼
                                            ┌──────────────────────────┐
                                            │   @benchkit/chart        │
                                            │   Dashboard (Preact)     │
                                            └──────────────────────────┘
```

### The bench-data branch

All benchmark data lives on a single orphan branch (default `bench-data`). The branch layout is:

```
bench-data
└── data/
    ├── runs/
    │   ├── 12345-1--bench.json  # {run_id}-{attempt}--{job}.json  (raw BenchmarkResult)
    │   └── 12346-1--bench.json
    ├── index.json               # backward-compatible global run index
    ├── index/
    │   ├── refs.json             # runs grouped by ref / branch
    │   ├── prs.json              # runs grouped by pull request
    │   └── metrics.json          # known metrics with latest activity
    ├── series/
    │   ├── ns_per_op.json        # pre-aggregated time-series per metric
    │   └── allocs.json
    ├── telemetry/
    │   └── 12345-1.otlp.jsonl.gz # raw OTLP telemetry sidecar (written by monitor)
    └── views/
        └── runs/
            └── 12345-1--bench/
                └── detail.json   # per-run detail view
```

**Collision-proof run naming:** The stash action's default run identifier is
`{GITHUB_RUN_ID}-{GITHUB_RUN_ATTEMPT}--{GITHUB_JOB}`. Including the job name
ensures that multiple concurrent jobs in the same workflow run each write a
unique file. For matrix jobs, supply a custom `run-id` that incorporates the
matrix key (e.g. `${{ github.run_id }}-${{ matrix.go-version }}`).

**Why pre-aggregate?** The chart package fetches static JSON over GitHub's raw-content CDN. By computing `index.json`, `series/*.json`, navigation indexes, and run detail views during aggregation, the frontend can load a few purpose-built files instead of doing client-side joins across many raw runs.

## Supported input formats

| Format | Description | Example |
|--------|-------------|---------|
| **Go bench** | Standard `go test -bench` text output | `BenchmarkSort-4  5000000  320 ns/op  48 B/op` |
| **Rust bench** | Standard Rust `cargo bench` output (libtest) | `test bench_sort ... bench: 320 ns/iter (+/- 10)` |
| **Hyperfine** | JSON output from the [hyperfine](https://github.com/sharkdp/hyperfine) CLI benchmarking tool | `{"results":[{"command":"...","mean":0.32}]}` |
| **pytest-benchmark** | JSON output from [pytest-benchmark](https://pytest-benchmark.readthedocs.io/) | `{"benchmarks":[{"name":"test_sort","stats":{"mean":0.32}}]}` |
| **benchmark-action** | JSON array used by [`github-action-benchmark`](https://github.com/benchmark-action/github-action-benchmark) | `[{"name":"sort","value":320,"unit":"ns/op"}]` |
| **OTLP** | OpenTelemetry metrics JSON (`resourceMetrics`) | See [OTLP JSON encoding](https://opentelemetry.io/docs/specs/otlp/) |
| **Native** | Benchkit's own JSON schema with full metric, tag, and sample support | See [`schema/benchmark-result.schema.json`](schema/benchmark-result.schema.json) |
| **auto** (default) | Automatically detects the format from file contents | — |

All formats are normalised to the native `BenchmarkResult` type by `@benchkit/format`.

## Quick start

The fastest path is a GitHub Actions workflow that stashes results after every CI run and periodically aggregates them.

### 1. Stash benchmark results

Add a step to your existing CI workflow:

```yaml
- name: Run benchmarks
  run: go test -bench=. -benchmem ./... | tee bench.txt

- name: Stash results
  uses: strawgate/benchkit/actions/stash@main
  with:
    results: bench.txt        # path or glob to result file(s)
    format: auto              # go | rust | hyperfine | pytest-benchmark | benchmark-action | native | auto
```

This parses the output, writes `data/runs/{run-id}.json` to the `bench-data` branch, and exposes `run-id` and `file-path` as step outputs.

The default `run-id` is `{GITHUB_RUN_ID}-{GITHUB_RUN_ATTEMPT}--{GITHUB_JOB}`, which makes concurrent jobs collision-proof without any configuration.

### Optional: Capture system and custom metrics with the monitor action

Start the monitor once at the beginning of the job. It downloads an OTel
Collector, scrapes host metrics, exposes OTLP endpoints for your benchmark code,
and then flushes telemetry automatically in the action post step:

```yaml
- name: Start monitor
  id: monitor
  uses: strawgate/benchkit/actions/monitor@main
  with:
    scrape-interval: 5s
    metric-sets: cpu,memory,load,process

- name: Run benchmarks
  env:
    OTEL_EXPORTER_OTLP_ENDPOINT: ${{ steps.monitor.outputs.otlp-http-endpoint }}
  run: go test -bench=. -benchmem ./... | tee bench.txt

- name: Stash results
  uses: strawgate/benchkit/actions/stash@main
  with:
    results: bench.txt
    format: auto
```

The monitor action stores raw OTLP telemetry at `data/telemetry/{run-id}.otlp.jsonl.gz` on the data branch. Host metrics are scraped automatically, and your benchmark code can optionally send custom OTLP metrics to the collector using the emitted endpoint outputs.

If you just need to record a one-off workflow value, you can pair the monitor with `actions/emit-metric`:

```yaml
- name: Emit score metric
  uses: strawgate/benchkit/actions/emit-metric@main
  with:
    otlp-http-endpoint: ${{ steps.monitor.outputs.otlp-http-endpoint }}
    name: test_score
    value: 74
    unit: points
    scenario: search-relevance
    series: baseline
    direction: bigger_is_better
    attributes: |
      dataset=wiki
      variant=bm25
```

### 2. Aggregate into index, series, and view files

The recommended pattern is a **dedicated aggregate workflow** triggered when
new run files land on `bench-data`. It rebuilds the backward-compatible
`data/index.json`, per-metric `data/series/*.json`, navigation indexes under
`data/index/`, and run detail views under `data/views/runs/`. Scoping the
trigger to `data/runs/**` means the aggregate workflow's own derived-file
writes do **not** retrigger it.

```yaml
# .github/workflows/aggregate.yml
name: Aggregate benchmarks
on:
  push:
    branches:
      - bench-data
    paths:
      - 'data/runs/**'   # only raw-run writes trigger aggregation

permissions:
  contents: write

jobs:
  aggregate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Aggregate
        uses: strawgate/benchkit/actions/aggregate@main
        with:
          max-runs: 0   # 0 = keep all runs
```

Alternatively, you can call the aggregate action directly in your producer
workflow (after the stash step), though the dedicated workflow is preferred
when multiple producers write to the same branch.

### 3. Render a dashboard

Install the chart package:

```bash
npm install @benchkit/chart preact
```

Mount the dashboard in your app:

```tsx
import "@benchkit/chart/css";
import { Dashboard } from "@benchkit/chart";

export function App() {
  return (
    <Dashboard
      source={{
        owner: "your-org",
        repo: "your-repo",
        branch: "bench-data",  // optional, this is the default
      }}
      // Optional customization:
      metricLabelFormatter={(m) => m.replace(/_/g, " ")}  // pretty-print metric names
      seriesNameFormatter={(name) => name.replace(/^Benchmark/, "")}  // trim Go prefix
      commitHref={(sha, run) => `https://github.com/your-org/your-repo/commit/${sha}`}
      regressionThreshold={10}  // flag series that increased/decreased >10% vs rolling average
      regressionWindow={5}       // number of preceding runs to average
    />
  );
}
```

The current `Dashboard` fetches `index.json` and `series/*.json` from `https://raw.githubusercontent.com/{owner}/{repo}/bench-data/data/...` and renders trend charts, comparison bars, and a run table — all client-side with no backend. The aggregate action also emits navigation and run-detail artifacts for newer run/PR-oriented surfaces; see [`docs/artifact-layout.md`](docs/artifact-layout.md).

### Optional: Compare results on pull requests

Use the compare action to automatically post a benchmark comparison comment on PRs and optionally fail CI when a regression is detected:

```yaml
- name: Compare
  if: github.event_name == 'pull_request'
  uses: strawgate/benchkit/actions/compare@main
  with:
    results: bench.txt
    format: auto
    baseline-runs: 5          # average this many recent runs as the baseline
    threshold: 5              # percentage change that counts as a regression
    fail-on-regression: true  # fail the step when a regression is found
    comment-on-pr: true       # post the comparison table as a PR comment
```

### Complete workflow example

Two separate workflow files implement the recommended producer/aggregate split:

```yaml
# .github/workflows/bench.yml  — producer
name: Benchmarks
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: write          # required to push to bench-data
  pull-requests: write     # required for PR comments from compare action

jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run benchmarks
        run: go test -bench=. -benchmem ./... | tee bench.txt

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench.txt
          # run-id defaults to {run_id}-{attempt}--bench (collision-proof)
```

```yaml
# .github/workflows/aggregate.yml  — downstream aggregate
name: Aggregate benchmarks
on:
  push:
    branches:
      - bench-data
    paths:
      - 'data/runs/**'   # derived-file writes do not retrigger this workflow

permissions:
  contents: write

jobs:
  aggregate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Aggregate
        uses: strawgate/benchkit/actions/aggregate@main

      - name: Compare (PR only)
        if: github.event_name == 'pull_request'
        uses: strawgate/benchkit/actions/compare@main
        with:
          results: bench.txt
          fail-on-regression: true
```

See [`docs/workflow-architecture.md`](docs/workflow-architecture.md) for the full
recommended architecture, matrix-job guidance, and migration notes. See
[actions/monitor](actions/monitor) for the full monitor workflow example including
per-process tracking.

## Schemas

The benchkit-native schemas for normalized and derived data files are in the [`schema/`](schema/) directory. Raw OTLP telemetry sidecars written by `actions/monitor` follow the OTLP JSON format rather than a benchkit schema:

| Schema | Describes |
|--------|-----------|
| [`benchmark-result.schema.json`](schema/benchmark-result.schema.json) | Native benchmark result format (input and stored run format) |
| [`index.schema.json`](schema/index.schema.json) | Backward-compatible aggregated index of all runs |
| [`index-refs.schema.json`](schema/index-refs.schema.json) | Navigation index grouped by git ref |
| [`index-prs.schema.json`](schema/index-prs.schema.json) | Navigation index grouped by pull request |
| [`index-metrics.schema.json`](schema/index-metrics.schema.json) | Navigation index of known metrics |
| [`series.schema.json`](schema/series.schema.json) | Pre-aggregated time-series for a single metric |
| [`view-run-detail.schema.json`](schema/view-run-detail.schema.json) | Per-run detail artifact for run-first UI flows |

## Current limitations

- **GitHub-only data storage** — the bench-data branch model relies on GitHub raw-content URLs. Self-hosted Git servers are not supported by the chart package out of the box.
- **Single-repo scope** — each repository maintains its own bench-data branch; there is no cross-repo aggregation.
- **Node 24 runtime** — the GitHub Actions require a Node 24+ runner (GitHub-hosted runners support this by default).
- **Telemetry sidecars are raw OTLP** — `actions/monitor` stores OTLP telemetry sidecars for later aggregation; the default metric dashboard still primarily reads `index.json` and `series/*.json`.

## Development

This is an npm workspaces monorepo. From the root:

```bash
npm install          # install all dependencies
npm run build        # build every package and action
npm run test         # run tests across all workspaces
npm run lint         # type-check all workspaces
```

## Vision and roadmap

See [`docs/vision-and-roadmap.md`](docs/vision-and-roadmap.md) for the current
product direction and open roadmap. For the emitted aggregate file layout, see
[`docs/artifact-layout.md`](docs/artifact-layout.md).

## License

[MIT](LICENSE)
