# @benchkit/chart

Preact components for rendering [benchkit](../../README.md) benchmark dashboards. Fetches pre-aggregated JSON from a `bench-data` branch and renders interactive trend charts, comparison bars, leaderboards, tag filters, and runner-metrics panels — all client-side with no backend.

## Installation

```bash
npm install @benchkit/chart preact
```

## Quick start

```tsx
import { Dashboard } from "@benchkit/chart";

export function App() {
  return (
    <Dashboard
      source={{
        owner: "your-org",
        repo: "your-repo",
        branch: "bench-data",   // optional, this is the default
      }}
    />
  );
}
```

The `Dashboard` component fetches `data/index.json` and `data/series/*.json` from `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/…` and renders all charts automatically.

---

## Components

### `Dashboard`

The top-level ready-made dashboard. Automatically fetches data, partitions metrics into user benchmarks and `_monitor/` system metrics, detects regressions, and renders all sub-components.

```tsx
import { Dashboard } from "@benchkit/chart";

<Dashboard
  source={{ owner: "your-org", repo: "your-repo" }}
  metricLabelFormatter={(m) => m.replace(/_/g, " ")}
  seriesNameFormatter={(name) => name.replace(/^Benchmark/, "")}
  commitHref={(sha, run) => `https://github.com/your-org/your-repo/commit/${sha}`}
  regressionThreshold={10}
  regressionWindow={5}
/>
```

#### `DashboardProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `DataSource` | — | **Required.** Where to fetch data from. |
| `class` | `string` | — | CSS class applied to the root element. |
| `maxPoints` | `number` | `20` | Max data points per sparkline. |
| `maxRuns` | `number` | `20` | Max rows in the recent-runs table. |
| `metricLabelFormatter` | `(metric: string) => string` | — | Custom metric name renderer. |
| `seriesNameFormatter` | `(name: string, entry: SeriesEntry) => string` | — | Custom series name renderer. |
| `commitHref` | `(commit: string, run: RunEntry) => string \| undefined` | — | Builds a URL for each commit SHA in the run table. |
| `regressionThreshold` | `number` | `10` | Percentage change that triggers a regression warning. |
| `regressionWindow` | `number` | `5` | Number of preceding data points averaged for regression detection. |

---

### `RunDetail`

A first-class reusable surface for inspecting a single benchmark run. Can be embedded inside any dashboard shell — `RunDashboard`, `CompetitiveDashboard`, or a custom metric explorer — without modification.

Renders:

1. **Run metadata** — id, timestamp, commit SHA (optionally linked), Git ref, benchmark count, metric count.
2. **Metric snapshots** — one sparkline + latest-value bar per user metric.
3. **Runner metrics** — `_monitor/` series in a visually separated panel, consistent with the `MonitorSection` used in `Dashboard`.
4. **Baseline comparison** — an optional delta table supplied by a parent view (e.g. `vs main`).

```tsx
import { RunDetail } from "@benchkit/chart";
import type { RunMetricSnapshot, RunComparisonEntry } from "@benchkit/chart";

// Prepare user-metric snapshots (non-monitor)
const userSnapshots: RunMetricSnapshot[] = [
  { metric: "ns_per_op", series: nsPerOpSeriesFile },
  { metric: "allocs_per_op", series: allocsSeriesFile },
];

// Prepare monitor snapshots (optional)
const monitorSnapshots: RunMetricSnapshot[] = [
  { metric: "_monitor/cpu_user_pct", series: cpuSeriesFile },
];

// Prepare baseline comparison (optional — supplied by a parent view)
const comparison: RunComparisonEntry[] = [
  {
    metric: "ns_per_op",
    label: "ns/op",
    current: 1100,
    baseline: 1200,
    unit: "ns/op",
    direction: "smaller_is_better",
  },
];

<RunDetail
  run={selectedRun}
  metricSnapshots={userSnapshots}
  monitorSnapshots={monitorSnapshots}
  comparisonEntries={comparison}
  baselineLabel="main"
  commitHref={(sha, run) => `https://github.com/your-org/your-repo/commit/${sha}`}
  artifactHref={(run) => `https://github.com/your-org/your-repo/actions/runs/${run.id}`}
  metricLabelFormatter={(m) => m.replace(/_/g, " ")}
  seriesNameFormatter={(name) => name.replace(/^Benchmark/, "")}
/>
```

#### `RunDetailProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `run` | `RunEntry` | — | **Required.** The run to display. |
| `metricSnapshots` | `RunMetricSnapshot[]` | `[]` | Pre-aggregated series files for user (non-monitor) metrics. |
| `monitorSnapshots` | `RunMetricSnapshot[]` | `[]` | Pre-aggregated series files for `_monitor/` metrics. |
| `comparisonEntries` | `RunComparisonEntry[]` | — | Baseline delta entries supplied by a parent view. |
| `baselineLabel` | `string` | `"baseline"` | Label for the comparison context, e.g. `"main branch"`. |
| `commitHref` | `(commit: string, run: RunEntry) => string \| undefined` | — | Builds a URL for the commit SHA in the metadata card. |
| `artifactHref` | `(run: RunEntry) => string \| undefined` | — | Builds an external artifact link (e.g. CI run URL). |
| `metricLabelFormatter` | `(metric: string) => string` | — | Custom metric label renderer. |
| `seriesNameFormatter` | `(name: string, entry: SeriesEntry) => string` | — | Custom series name renderer. |
| `maxPoints` | `number` | `20` | Max data points per sparkline. |
| `class` | `string` | — | CSS class applied to the root element. |

#### `RunMetricSnapshot`

```ts
interface RunMetricSnapshot {
  metric: string;      // Metric name, e.g. "ns_per_op"
  series: SeriesFile;  // Pre-aggregated series file for this metric
}
```

#### `RunComparisonEntry`

```ts
interface RunComparisonEntry {
  metric: string;                                          // Metric name
  label?: string;                                          // Override display label
  current: number;                                         // Value for the selected run
  baseline: number;                                        // Value for the baseline run
  unit?: string;                                           // Unit string, e.g. "ns/op"
  direction?: "bigger_is_better" | "smaller_is_better";   // Default: smaller_is_better
}
```

---

### `TrendChart`

Renders a time-series line chart for a single metric. Optionally highlights regressed series with a red dot on their latest point.

```tsx
import { TrendChart } from "@benchkit/chart";
import type { SeriesFile } from "@benchkit/format";

<TrendChart
  series={seriesFile}
  title="ns/op"
  height={300}
  maxPoints={20}
  seriesNameFormatter={(name) => name.replace(/^Benchmark/, "")}
  regressions={regressionResults}
/>
```

#### `TrendChartProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `series` | `SeriesFile` | — | **Required.** Pre-aggregated series data. |
| `title` | `string` | — | Chart heading. |
| `height` | `number` | `300` | Canvas height in pixels. |
| `maxPoints` | `number` | — | Truncate each series to the most recent N points. |
| `seriesNameFormatter` | `(name: string, entry: SeriesEntry) => string` | — | Custom legend label renderer. |
| `class` | `string` | — | CSS class applied to the wrapper `<div>`. |
| `regressions` | `RegressionResult[]` | — | Regression results; affected series get a red dot on their last point. |

---

### `ComparisonBar`

Renders a horizontal (or vertical) bar chart comparing the **latest value** of each series within a metric, with optional error bars.

```tsx
import { ComparisonBar } from "@benchkit/chart";

<ComparisonBar
  series={seriesFile}
  title="Latest throughput"
  height={250}
  seriesNameFormatter={(name) => name.replace(/^Benchmark/, "")}
/>
```

#### `ComparisonBarProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `series` | `SeriesFile` | — | **Required.** Pre-aggregated series data. |
| `title` | `string` | — | Chart heading. |
| `height` | `number` | `250` | Canvas height in pixels. |
| `seriesNameFormatter` | `(name: string, entry: SeriesEntry) => string` | — | Custom bar label renderer. |
| `class` | `string` | — | CSS class applied to the wrapper `<div>`. |

---

### `Leaderboard`

Renders a ranked table of series sorted by their latest value, direction-aware. Highlights the winner with a ★ badge and colors delta arrows green/red.

```tsx
import { Leaderboard } from "@benchkit/chart";

<Leaderboard
  series={seriesFile}
  seriesNameFormatter={(name) => name.replace(/^Benchmark/, "")}
/>
```

#### `LeaderboardProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `series` | `SeriesFile` | — | **Required.** Pre-aggregated series data. |
| `seriesNameFormatter` | `(name: string, entry: SeriesEntry) => string` | — | Custom name renderer for each row. |
| `class` | `string` | — | CSS class applied to the wrapper `<div>`. |

The component renders `null` when there are no series with data, and a plain text label when only one series is present (no table needed).

---

### `TagFilter`

Renders a row of pill buttons for filtering series by their `tags`. Only rendered when at least one series carries tags; returns `null` otherwise.

```tsx
import { TagFilter, filterSeriesFile } from "@benchkit/chart";
import { useState } from "preact/hooks";

function MyDashboard({ seriesMap }: { seriesMap: Map<string, SeriesFile> }) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  return (
    <>
      <TagFilter
        seriesMap={seriesMap}
        activeFilters={activeFilters}
        onFilterChange={setActiveFilters}
      />
      {/* pass filtered series to charts */}
      {[...seriesMap.entries()].map(([metric, sf]) => (
        <TrendChart key={metric} series={filterSeriesFile(sf, activeFilters)} title={metric} />
      ))}
    </>
  );
}
```

#### `TagFilterProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `seriesMap` | `Map<string, SeriesFile>` | — | **Required.** All series for the current view; tags are extracted from this map. |
| `activeFilters` | `Record<string, string>` | — | **Required.** Currently active `{ tagKey: tagValue }` pairs. |
| `onFilterChange` | `(filters: Record<string, string>) => void` | — | **Required.** Called with a new filter map whenever the user toggles a pill. |

Each tag key is rendered as a group of pill buttons. Clicking an active pill deactivates it; clicking an inactive pill activates it (one active value per key at a time). A **Clear filters** button appears when any filter is active.

---

### `MonitorSection`

Renders the **Runner Metrics** section for `_monitor/` prefixed metrics produced by the [Benchkit Monitor action](../../actions/monitor). Displays a runner-context card (OS, CPU, memory, poll interval) and a grid of sparklines — one per monitor metric.

```tsx
import { MonitorSection } from "@benchkit/chart";

<MonitorSection
  monitorSeriesMap={monitorSeriesMap}
  index={indexFile}
  maxPoints={20}
  metricLabelFormatter={(m) => m.replace(/^_monitor\//, "")}
  seriesNameFormatter={(name) => name}
  onMetricClick={(metric) => setSelected(metric)}
  selectedMetric={selectedMetric}
/>
```

#### `MonitorSectionProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `monitorSeriesMap` | `Map<string, SeriesFile>` | — | **Required.** Map of `_monitor/…` metric names to their series files. |
| `index` | `IndexFile` | — | **Required.** Full index; used to surface the latest runner context card. |
| `maxPoints` | `number` | `20` | Max data points per sparkline. |
| `metricLabelFormatter` | `(metric: string) => string` | — | Custom label renderer; defaults to stripping the `_monitor/` prefix. |
| `seriesNameFormatter` | `(name: string, entry: SeriesEntry) => string` | — | Custom series name renderer. |
| `onMetricClick` | `(metric: string) => void` | — | Called when the user clicks a monitor metric card. |
| `selectedMetric` | `string \| null` | — | Highlights the card with a matching metric name. |

The component renders `null` when `monitorSeriesMap` is empty.

---

### `RunTable`

Renders a paginated table of recent benchmark runs with columns for run ID, timestamp, commit SHA, Git ref, benchmark count, and metrics list.

```tsx
import { RunTable } from "@benchkit/chart";

<RunTable
  index={indexFile}
  maxRows={20}
  commitHref={(sha, run) => `https://github.com/your-org/your-repo/commit/${sha}`}
/>
```

#### `RunTableProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `index` | `IndexFile` | — | **Required.** Full index file. |
| `maxRows` | `number` | — | Limit the number of rows shown. |
| `onSelectRun` | `(runId: string) => void` | — | Called when a row is clicked. |
| `commitHref` | `(commit: string, run: RunEntry) => string \| undefined` | — | Builds a URL for each commit SHA. |
| `class` | `string` | — | CSS class applied to the `<table>` element. |

---

## Data fetching

### `DataSource`

Describes where to fetch benchmark data from.

```ts
interface DataSource {
  owner?: string;     // GitHub repository owner
  repo?: string;      // GitHub repository name
  branch?: string;    // Data branch (default: "bench-data")
  baseUrl?: string;   // Absolute URL override — owner/repo/branch are ignored when set
}
```

When `baseUrl` is provided, files are resolved relative to that URL. Otherwise data is fetched from `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/`.

### `fetchIndex(source, signal?)`

Fetches `data/index.json` and returns an `IndexFile`.

```ts
import { fetchIndex } from "@benchkit/chart";

const index = await fetchIndex({ owner: "your-org", repo: "your-repo" });
```

### `fetchSeries(source, metric, signal?)`

Fetches `data/series/{metric}.json` and returns a `SeriesFile`.

```ts
import { fetchSeries } from "@benchkit/chart";

const series = await fetchSeries(
  { owner: "your-org", repo: "your-repo" },
  "ns_per_op",
);
```

### `fetchRun(source, runId, signal?)`

Fetches `data/runs/{runId}.json` and returns a `BenchmarkResult`.

```ts
import { fetchRun } from "@benchkit/chart";

const run = await fetchRun(
  { owner: "your-org", repo: "your-repo" },
  "123456789-1",
);
```

---

## Ranking utilities

### `rankSeries(sf)`

Ranks all series in a `SeriesFile` by latest value, direction-aware. Returns a `RankedEntry[]` sorted by rank ascending (rank 1 = best).

```ts
import { rankSeries } from "@benchkit/chart";

const ranked = rankSeries(seriesFile);
ranked.forEach((r) => {
  console.log(`${r.rank}. ${r.name}: ${r.latestValue} (winner: ${r.isWinner})`);
});
```

#### `RankedEntry`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Series name (key in `SeriesFile.series`). |
| `entry` | `SeriesEntry` | The original series entry. |
| `latestValue` | `number` | Most recent data-point value. |
| `previousValue` | `number \| undefined` | Second-most-recent value, if available. |
| `delta` | `number \| undefined` | `latestValue − previousValue`. |
| `rank` | `number` | 1-based rank. |
| `isWinner` | `boolean` | `true` for the first-ranked entry. |

Ranking direction:

| `SeriesFile.direction` | Rank 1 |
|------------------------|--------|
| `smaller_is_better` | Lowest value |
| `bigger_is_better` | Highest value |
| *(unset)* | Lowest value |

### `getWinner(sf)`

Returns the `name` of the rank-1 series, or `undefined` when there are no series with data points.

```ts
import { getWinner } from "@benchkit/chart";

const winner = getWinner(seriesFile);
if (winner) console.log(`Winner: ${winner}`);
```

---

## Regression detection

### `detectRegressions(series, threshold?, window?)`

Scans each series in a `SeriesFile` for a regression on the most recent data point relative to the rolling mean of the previous `window` points. Returns a `RegressionResult[]` (empty array when there are insufficient data points or no regressions are found).

```ts
import { detectRegressions } from "@benchkit/chart";

const regressions = detectRegressions(
  seriesFile,
  10,  // threshold: flag when change exceeds 10 %
  5,   // window: average the previous 5 data points
);
```

A regression is detected when:

| `SeriesFile.direction` | Condition |
|------------------------|-----------|
| `smaller_is_better` | Latest value **increased** by more than `threshold`% vs the rolling mean |
| `bigger_is_better` | Latest value **decreased** by more than `threshold`% vs the rolling mean |

Returns `[]` when any series has fewer than `window + 1` data points (not enough history).

#### `RegressionResult`

| Field | Type | Description |
|-------|------|-------------|
| `seriesName` | `string` | Series name (key in `SeriesFile.series`). |
| `latestValue` | `number` | The most recent data-point value. |
| `previousMean` | `number` | Mean of the previous `window` data points. |
| `percentChange` | `number` | Percentage change from `previousMean` to `latestValue` (positive = increase). |
| `window` | `number` | Actual number of preceding points that were averaged. |

### `regressionTooltip(metric, result, metricLabelFormatter?)`

Builds a human-readable tooltip string for a single `RegressionResult`.

```ts
import { regressionTooltip } from "@benchkit/chart";

const tip = regressionTooltip("ns_per_op", regressionResult);
// e.g. "ns_per_op increased 15.3% vs 5-run average (320 → 368)"
```

---

## Tag filtering utilities

### `extractTags(seriesMap)`

Extracts all unique tag keys and their possible values from a collection of `SeriesFile`s. Returns `Record<string, string[]>` with values sorted alphabetically.

```ts
import { extractTags } from "@benchkit/chart";

const tags = extractTags(seriesMap);
// e.g. { arch: ["arm64", "x86_64"], runtime: ["go1.22", "go1.23"] }
```

### `filterSeriesFile(sf, activeFilters)`

Returns a copy of a `SeriesFile` with only the series entries that match **all** active filters. When `activeFilters` is empty the original object is returned unchanged.

```ts
import { filterSeriesFile } from "@benchkit/chart";

const filtered = filterSeriesFile(seriesFile, { arch: "arm64" });
```

---

## Usage patterns

### Competitive benchmarking

Use this pattern when you want to compare multiple implementations (series) for the same metric. `Leaderboard` and `ComparisonBar` are the primary components here.

```tsx
import { TrendChart, ComparisonBar, Leaderboard, TagFilter, filterSeriesFile } from "@benchkit/chart";
import { useState } from "preact/hooks";

function CompetitiveDashboard({ seriesMap }: { seriesMap: Map<string, SeriesFile> }) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  return (
    <>
      {/* Filter pills — only shown when series carry tags */}
      <TagFilter
        seriesMap={seriesMap}
        activeFilters={activeFilters}
        onFilterChange={setActiveFilters}
      />

      {[...seriesMap.entries()].map(([metric, sf]) => {
        const filtered = filterSeriesFile(sf, activeFilters);
        return (
          <div key={metric} style={{ marginBottom: "32px" }}>
            <h2>{metric}</h2>

            {/* Trend lines for every implementation */}
            <TrendChart series={filtered} title="Over time" />

            {/* Side-by-side latest-value comparison */}
            <ComparisonBar series={filtered} title="Latest comparison" />

            {/* Ranked table with winner badge */}
            <Leaderboard series={filtered} />
          </div>
        );
      })}
    </>
  );
}
```

### Evolution tracking

Use this pattern when you have a single implementation and want to track how it changes over time across commits. `TrendChart` with `regressions` highlighting is the primary component here.

```tsx
import { TrendChart, detectRegressions, regressionTooltip } from "@benchkit/chart";

function EvolutionDashboard({ seriesMap }: { seriesMap: Map<string, SeriesFile> }) {
  return (
    <>
      {[...seriesMap.entries()].map(([metric, sf]) => {
        const regressions = detectRegressions(sf, 10, 5);
        const hasRegression = regressions.length > 0;

        return (
          <div
            key={metric}
            style={{ border: hasRegression ? "1px solid #fca5a5" : "1px solid #e5e7eb" }}
            title={regressions.map((r) => regressionTooltip(metric, r)).join("\n")}
          >
            {hasRegression && <span>⚠ regression detected</span>}
            <TrendChart
              series={sf}
              title={metric}
              regressions={regressions}
            />
          </div>
        );
      })}
    </>
  );
}
```

---

## License

MIT
