# Benchkit

**Track benchmarks over time with GitHub Actions and static hosting — no servers required.**

Benchkit is a modular toolkit for recording, aggregating, and visualising benchmark results directly inside your GitHub repository. Results are committed to a dedicated `bench-data` branch, pre-aggregated into JSON files, and rendered with lightweight Preact chart components — all powered by GitHub's raw-content CDN so you never need a backend.

## Components

| Component | Path | Description |
|-----------|------|-------------|
| **@benchkit/format** | [`packages/format`](packages/format) | TypeScript types and parsers that normalise Go bench, benchmark-action, and native JSON formats into a common `BenchmarkResult` shape. |
| **@benchkit/chart** | [`packages/chart`](packages/chart) | Preact components (`TrendChart`, `ComparisonBar`, `RunTable`, `Leaderboard`, `TagFilter`, `MonitorSection`) that fetch pre-aggregated data and render interactive dashboards. |
| **Benchkit Stash** | [`actions/stash`](actions/stash) | GitHub Action — parses benchmark output, optionally attaches monitor data, and commits the result to the data branch. |
| **Benchkit Aggregate** | [`actions/aggregate`](actions/aggregate) | GitHub Action — reads every stored run and rebuilds `index.json` plus per-metric `series/*.json` files. |
| **Benchkit Monitor** | [`actions/monitor`](actions/monitor) | GitHub Action — runs a background process that samples system metrics (`cpu`, `mem`, `load`) via `/proc` during your benchmark step and emits them as `_monitor/` benchmarks. |

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
                                            │  data/series/{metric}.json│
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
    ├── index.json               # metadata for every run (built by aggregate)
    └── series/
        ├── ns_per_op.json       # pre-aggregated time-series per metric
        └── allocs.json
```

**Collision-proof run naming:** The stash action's default run identifier is
`{GITHUB_RUN_ID}-{GITHUB_RUN_ATTEMPT}--{GITHUB_JOB}`. Including the job name
ensures that multiple concurrent jobs in the same workflow run each write a
unique file. For matrix jobs, supply a custom `run-id` that incorporates the
matrix key (e.g. `${{ github.run_id }}-${{ matrix.go-version }}`).

**Why pre-aggregate?** The chart package fetches static JSON over GitHub's raw-content CDN. By computing `index.json` and `series/*.json` during aggregation, the dashboard needs only a handful of small fetches — no client-side joins, no server, and no database.

## Supported input formats

| Format | Description | Example |
|--------|-------------|---------|
| **Go bench** | Standard `go test -bench` text output | `BenchmarkSort-4  5000000  320 ns/op  48 B/op` |
| **benchmark-action** | JSON array used by [`github-action-benchmark`](https://github.com/benchmark-action/github-action-benchmark) | `[{"name":"sort","value":320,"unit":"ns/op"}]` |
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
    format: auto              # go | benchmark-action | native | auto
```

This parses the output, writes `data/runs/{run-id}.json` to the `bench-data` branch, and exposes `run-id` and `file-path` as step outputs.

The default `run-id` is `{GITHUB_RUN_ID}-{GITHUB_RUN_ATTEMPT}--{GITHUB_JOB}`, which makes concurrent jobs collision-proof without any configuration.

### Optional: Capture system metrics with the monitor action

Wrap your benchmark step with `monitor` start/stop to record CPU, memory, and load average alongside your results:

```yaml
- name: Start monitor
  uses: strawgate/benchkit/actions/monitor@main
  with:
    mode: start
    poll-interval: 250    # ms between /proc samples (default: 250)
    output: monitor.json

- name: Run benchmarks
  run: go test -bench=. -benchmem ./... | tee bench.txt

- name: Stop monitor
  uses: strawgate/benchkit/actions/monitor@main
  with:
    mode: stop

- name: Stash results
  uses: strawgate/benchkit/actions/stash@main
  with:
    results: bench.txt
    monitor: monitor.json   # attach monitor output
    format: auto
```

Monitor data is stored as `_monitor/system` and `_monitor/process/{name}` benchmarks and rendered in a separate **Runner Metrics** section in the dashboard. The monitor action only works on Linux runners (macOS/Windows are a no-op).

### 2. Aggregate into index and series files

The recommended pattern is a **dedicated aggregate workflow** triggered when
new run files land on `bench-data`. Scoping the trigger to `data/runs/**`
means the aggregate workflow's own derived-file writes do **not** retrigger it.

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

The dashboard fetches `index.json` and `series/*.json` from `https://raw.githubusercontent.com/{owner}/{repo}/bench-data/data/...` and renders trend charts, comparison bars, and a run table — all client-side with no backend.

### Complete workflow example

Two separate workflow files implement the recommended producer/aggregate split:

```yaml
# .github/workflows/bench.yml  — producer
name: Benchmarks
on:
  push:
    branches: [main]

permissions:
  contents: write          # required to push to bench-data

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
```

See [`docs/workflow-architecture.md`](docs/workflow-architecture.md) for the full
recommended architecture, matrix-job guidance, and migration notes. See
[actions/monitor](actions/monitor) for the full monitor workflow example including
per-process tracking.

## Schemas

The full JSON schemas for each data file are in the [`schema/`](schema/) directory:

| Schema | Describes |
|--------|-----------|
| [`benchmark-result.schema.json`](schema/benchmark-result.schema.json) | Native benchmark result format (input and stored run format) |
| [`index.schema.json`](schema/index.schema.json) | Aggregated index of all runs |
| [`series.schema.json`](schema/series.schema.json) | Pre-aggregated time-series for a single metric |

## Current limitations

- **GitHub-only data storage** — the bench-data branch model relies on GitHub raw-content URLs. Self-hosted Git servers are not supported by the chart package out of the box.
- **Regression detection is visual only** — the `regressionThreshold` prop highlights regressions in the dashboard but does not fail CI or send notifications.
- **Single-repo scope** — each repository maintains its own bench-data branch; there is no cross-repo aggregation.
- **Node 24 runtime** — the GitHub Actions require a Node 24+ runner (GitHub-hosted runners support this by default).
- **Monitor requires Linux** — `actions/monitor` reads `/proc` and is a no-op on macOS and Windows runners.

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
product direction, issue audit, and phased plan across PR benchmarking,
workflow benchmarks, and scenario/run-oriented dashboards.

## License

[MIT](LICENSE)
