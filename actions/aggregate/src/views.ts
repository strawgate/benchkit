import type {
  MetricSummaryEntry,
  PrIndexEntry,
  RefIndexEntry,
  RunEntry,
  SeriesFile,
} from "@metrickit/core";
import type {
  RunDetailMetricSnapshot,
  RunDetailView,
  RunSnapshotMetric,
} from "@benchkit/format";
import { seriesKey as computeSeriesKey } from "@benchkit/format";
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

  const metricNames = new Set<string>();
  const scenarioNames = new Set<string>();
  for (const p of match.batch.points) {
    scenarioNames.add(p.scenario);
    metricNames.add(resolveMetricName(p.scenario, p.metric));
  }

  const runEntry: RunEntry = {
    id: match.id,
    timestamp: match.timestamp,
    commit: match.batch.context.commit,
    ref: match.batch.context.ref,
    benchmarks: scenarioNames.size,
    metrics: Array.from(metricNames).sort(),
    monitor: match.monitor,
  };

  const groupedMetrics = new Map<string, RunDetailMetricSnapshot>();
  for (const p of match.batch.points) {
    const key = computeSeriesKey(p);
    const resolvedMetricName = resolveMetricName(p.scenario, p.metric);
    const tags = Object.keys(p.tags).length > 0 ? (p.tags as Record<string, string>) : undefined;
    const existing = groupedMetrics.get(resolvedMetricName);
    if (existing) {
      existing.values.push({
        name: key,
        value: p.value,
        unit: p.unit || undefined,
        direction: p.direction,
        range: undefined,
        tags,
      });
    } else {
      groupedMetrics.set(resolvedMetricName, {
        metric: resolvedMetricName,
        unit: p.unit || undefined,
        direction: p.direction,
        values: [
          {
            name: key,
            value: p.value,
            unit: p.unit || undefined,
            direction: p.direction,
            range: undefined,
            tags,
          },
        ],
      });
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
