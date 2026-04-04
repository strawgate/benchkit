# Getting started with benchkit

This guide walks through the most common benchkit setup:

1. run benchmarks in CI
2. stash raw results to `bench-data`
3. aggregate derived files
4. optionally compare PRs and collect OTLP telemetry
5. render a dashboard from static JSON

## 1. Stash benchmark results

Add a benchmark step and a stash step to your workflow:

```yaml
- name: Run benchmarks
  run: go test -bench=. -benchmem ./... | tee bench.txt

- name: Stash results
  uses: strawgate/benchkit/actions/stash@main-dist
  with:
    results: bench.txt
    format: auto
```

`actions/stash` parses the input, writes `data/runs/{run-id}.json` to the `bench-data` branch, and exposes `run-id` and `file-path` as outputs.

The default run identifier is:

```text
{GITHUB_RUN_ID}-{GITHUB_RUN_ATTEMPT}--{GITHUB_JOB}
```

That makes concurrent jobs collision-proof without extra configuration. For matrix builds, provide a custom `run-id` that includes the matrix key.

## 2. Aggregate indexes and views

The recommended setup is a dedicated aggregate workflow triggered by raw run writes on `bench-data`:

```yaml
# .github/workflows/aggregate.yml
name: Aggregate benchmarks
on:
  push:
    branches:
      - bench-data
    paths:
      - 'data/runs/**'
  workflow_dispatch:  # allow manual triggering as a fallback

permissions:
  contents: write

jobs:
  aggregate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Aggregate
        uses: strawgate/benchkit/actions/aggregate@main-dist
        with:
          max-runs: 0
```

> **Note on the `push` trigger**: The `push` trigger only fires when `bench-data` is updated
> using a token with sufficient scope (a PAT or GitHub App token). Pushes made by the
> default `GITHUB_TOKEN` — which is what `actions/stash` uses by default — do **not** trigger
> other workflows in the same repository, per GitHub's security model. As a workaround, add
> the following step at the end of each bench workflow to dispatch aggregate explicitly:
>
> ```yaml
> permissions:
>   contents: write
>   actions: write   # required to dispatch another workflow
>
> # At the end of the stash job:
> - name: Trigger aggregate
>   env:
>     GH_TOKEN: ${{ github.token }}
>   run: gh workflow run aggregate.yml --repo ${{ github.repository }}
> ```
>
> Including `workflow_dispatch:` in `aggregate.yml` also lets you trigger it manually
> from the Actions tab or `gh workflow run` at any time.

This rebuilds:

- `data/index.json`
- `data/series/*.json`
- `data/index/refs.json`
- `data/index/prs.json`
- `data/index/metrics.json`
- `data/views/runs/{id}/detail.json`

For more on this workflow split, see [`workflow-architecture.md`](workflow-architecture.md).

## 3. Compare pull requests

Use `actions/compare` to compare current results to recent baselines and optionally fail on regressions:

```yaml
- name: Compare
  if: github.event_name == 'pull_request'
  uses: strawgate/benchkit/actions/compare@main-dist
  with:
    results: bench.txt
    format: auto
    baseline-runs: 5
    threshold: 5
    fail-on-regression: true
    comment-on-pr: true
```

This action writes a Markdown summary, can post or update a PR comment, and can fail the workflow when regressions are found.

## 4. Add telemetry with monitor and emit-metric

If you want host metrics or custom OTLP metrics, start the monitor once near the top of the job:

```yaml
- name: Start monitor
  id: monitor
  uses: strawgate/benchkit/actions/monitor@main-dist
  with:
    scrape-interval: 5s
    metric-sets: cpu,memory,load,process
```

Then point benchmark code at the OTLP endpoint:

```yaml
- name: Run benchmarks
  env:
    OTEL_EXPORTER_OTLP_ENDPOINT: ${{ steps.monitor.outputs.otlp-http-endpoint }}
  run: go test -bench=. -benchmem ./... | tee bench.txt
```

To record a one-off workflow metric without wiring up a full OTLP SDK:

```yaml
- name: Emit score metric
  uses: strawgate/benchkit/actions/emit-metric@main-dist
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

The monitor action stores raw OTLP telemetry at `data/telemetry/{run-id}.otlp.jsonl.gz`.

## 5. Render a dashboard

Install the chart package:

```bash
npm install @benchkit/chart preact
```

Mount the default dashboard:

```tsx
import "@benchkit/chart/css";
import { Dashboard } from "@benchkit/chart";

export function App() {
  return (
    <Dashboard
      source={{
        owner: "your-org",
        repo: "your-repo",
        branch: "bench-data",
      }}
      metricLabelFormatter={(metric) => metric.replace(/_/g, " ")}
      seriesNameFormatter={(name) => name.replace(/^Benchmark/, "")}
      commitHref={(sha) => `https://github.com/your-org/your-repo/commit/${sha}`}
      regressionThreshold={10}
      regressionWindow={5}
    />
  );
}
```

For the component surfaces and data-fetch helpers, see [`reference/react-components.md`](reference/react-components.md) and [`../packages/chart/README.md`](../packages/chart/README.md).

## Where to go next

- Action-by-action reference: [`reference/actions.md`](reference/actions.md)
- Data contracts and schemas: [`../schema/README.md`](../schema/README.md)
- Format APIs and parsers: [`../packages/format/README.md`](../packages/format/README.md)
- Workflow architecture guidance: [`workflow-architecture.md`](workflow-architecture.md)
