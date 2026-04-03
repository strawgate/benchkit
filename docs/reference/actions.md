# Benchkit action reference

Use this page to choose the right GitHub Action and then jump to the detailed action README.

## Recommended flow

A common end-to-end setup looks like this:

1. Run benchmarks.
2. Use `actions/stash` to store raw run files.
3. Use `actions/aggregate` to rebuild indexes and views.
4. Use `actions/compare` on pull requests.
5. Optionally use `actions/monitor` and `actions/emit-metric` for OTLP telemetry.

## Actions at a glance

| Action | Use it for | Produces | Reference |
|---|---|---|---|
| `actions/stash` | Parse benchmark files and persist one raw run | `data/runs/{run-id}.json` | [`../../actions/stash/README.md`](../../actions/stash/README.md) |
| `actions/aggregate` | Rebuild derived indexes, series, and run views | `data/index.json`, `data/series/*`, `data/index/*`, `data/views/runs/*` | [`../../actions/aggregate/README.md`](../../actions/aggregate/README.md) |
| `actions/compare` | Compare current results to recent baselines | PR comment, step summary, regression status | [`../../actions/compare/README.md`](../../actions/compare/README.md) |
| `actions/monitor` | Collect host and custom OTLP telemetry | `data/telemetry/{run-id}.otlp.jsonl.gz` | [`../../actions/monitor/README.md`](../../actions/monitor/README.md) |
| `actions/emit-metric` | Emit one-off OTLP metrics during a job | OTLP metric into the running collector | [`../../actions/emit-metric/README.md`](../../actions/emit-metric/README.md) |

## Which action should I start with?

### Stash

Start here if you already have benchmark output and want benchkit to store it.

Best for:

- Go, Rust, Hyperfine, pytest-benchmark, benchmark-action, OTLP, or native JSON input
- workflows that already produce a benchmark file
- append-only benchmark history on `bench-data`

### Aggregate

Use this when you want dashboards and drilldown views. It turns raw run files into rendering-friendly artifacts.

Best for:

- dashboards backed by static JSON
- branch and PR navigation views
- run detail pages and metric-series views

### Compare

Use this on pull requests when you want automated regression feedback.

Best for:

- PR comments with benchmark deltas
- failing CI when a threshold is crossed
- summary markdown in GitHub Actions output

### Monitor

Use this when you want runner telemetry or you already emit OpenTelemetry metrics.

Best for:

- CPU, memory, load, and process metrics
- hybrid benchmark runs
- storing raw OTLP sidecars for later aggregation

### Emit Metric

Use this with `actions/monitor` when you need to send one custom metric from a shell step.

Best for:

- simple scores or counters
- workflow metrics without a full OTLP SDK
- glue code in GitHub Actions jobs

## Related docs

- Full setup guide: [`../getting-started.md`](../getting-started.md)
- Workflow split and naming guidance: [`../workflow-architecture.md`](../workflow-architecture.md)
- Data layout: [`../artifact-layout.md`](../artifact-layout.md)
