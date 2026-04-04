import type {
  BenchmarkEntry,
  MetricSummaryEntry,
  PrIndexEntry,
  RefIndexEntry,
  RunDetailMetricSnapshot,
  RunDetailView,
  RunEntry,
  RunSnapshotMetric,
  SeriesFile,
} from "@benchkit/format";
import type { ParsedRun } from "./aggregate.js";
import { resolveMetricName } from "./aggregate.js";

export type {
  RefIndexEntry,
  PrIndexEntry,
  RunSnapshotMetric,
  RunDetailMetricSnapshot,
  RunDetailView,
  MetricSummaryEntry,
};

function benchmarkSeriesKey(benchmark: BenchmarkEntry): string {
  const tags = benchmark.tags
    ? Object.entries(benchmark.tags)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join(",")
    : "";
  return tags ? `${benchmark.name} [${tags}]` : benchmark.name;
}

export function extractPrNumber(ref: string | undefined): number | null {
  if (!ref) return null;
  const match = /^refs\/pull\/(\d+)\/merge$/.exec(ref);
  return match ? Number(match[1]) : null;
}

export function buildRefIndex(runs: RunEntry[]): RefIndexEntry[] {
  const grouped = new Map<string, RunEntry[]>();
  for (const run of runs) {
    const ref = run.ref ?? "unknown";
    const existing = grouped.get(ref);
    if (existing) existing.push(run);
    else grouped.set(ref, [run]);
  }

  return [...grouped.entries()]
    .map(([ref, entries]) => {
      const latest = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      return {
        ref,
        latestRunId: latest.id,
        latestTimestamp: latest.timestamp,
        latestCommit: latest.commit,
        runCount: entries.length,
      };
    })
    .sort((a, b) => b.latestTimestamp.localeCompare(a.latestTimestamp));
}

export function buildPrIndex(runs: RunEntry[]): PrIndexEntry[] {
  const prRuns = runs
    .map((run) => ({ run, prNumber: extractPrNumber(run.ref) }))
    .filter((entry): entry is { run: RunEntry; prNumber: number } => entry.prNumber !== null);

  const grouped = new Map<number, RunEntry[]>();
  for (const entry of prRuns) {
    const existing = grouped.get(entry.prNumber);
    if (existing) existing.push(entry.run);
    else grouped.set(entry.prNumber, [entry.run]);
  }

  return [...grouped.entries()]
    .map(([prNumber, entries]) => {
      const latest = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      return {
        prNumber,
        ref: latest.ref ?? `refs/pull/${prNumber}/merge`,
        latestRunId: latest.id,
        latestTimestamp: latest.timestamp,
        latestCommit: latest.commit,
        runCount: entries.length,
      };
    })
    .sort((a, b) => b.latestTimestamp.localeCompare(a.latestTimestamp));
}

export function buildRunDetail(runId: string, runs: ParsedRun[]): RunDetailView | null {
  const match = runs.find((run) => run.id === runId);
  if (!match) return null;

  const runEntry: RunEntry = {
    id: match.id,
    timestamp: match.result.context?.timestamp ?? new Date().toISOString(),
    commit: match.result.context?.commit,
    ref: match.result.context?.ref,
    benchmarks: match.result.benchmarks.length,
    metrics: Array.from(
      new Set(
        match.result.benchmarks.flatMap((benchmark) =>
          Object.keys(benchmark.metrics).map((m) => resolveMetricName(benchmark.name, m)),
        ),
      ),
    ).sort(),
    monitor: match.result.context?.monitor,
  };

  const groupedMetrics = new Map<string, RunDetailMetricSnapshot>();
  for (const benchmark of match.result.benchmarks) {
    const seriesKey = benchmarkSeriesKey(benchmark);
    for (const [rawMetricName, metric] of Object.entries(benchmark.metrics)) {
      const resolvedMetricName = resolveMetricName(benchmark.name, rawMetricName);
      const existing = groupedMetrics.get(resolvedMetricName);
      if (existing) {
        existing.values.push({
          name: seriesKey,
          value: metric.value,
          unit: metric.unit,
          direction: metric.direction,
          range: metric.range,
          tags: benchmark.tags,
        });
      } else {
        groupedMetrics.set(resolvedMetricName, {
          metric: resolvedMetricName,
          unit: metric.unit,
          direction: metric.direction,
          values: [
            {
              name: seriesKey,
              value: metric.value,
              unit: metric.unit,
              direction: metric.direction,
              range: metric.range,
              tags: benchmark.tags,
            },
          ],
        });
      }
    }
  }

  return {
    run: runEntry,
    metricSnapshots: [...groupedMetrics.values()].sort((a, b) => a.metric.localeCompare(b.metric)),
  };
}

export function buildMetricSummaryViews(seriesMap: Map<string, SeriesFile>): MetricSummaryEntry[] {
  return [...seriesMap.entries()]
    .map(([metric, series]) => {
      const latestPoint = Object.values(series.series)
        .flatMap((entry) => entry.points)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      return {
        metric,
        latestSeriesCount: Object.keys(series.series).length,
        latestRunId: latestPoint?.run_id,
        latestTimestamp: latestPoint?.timestamp,
      };
    })
    .sort((a, b) => a.metric.localeCompare(b.metric));
}
