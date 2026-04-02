import * as fs from "node:fs";
import * as path from "node:path";
import type {
  BenchmarkResult,
  IndexFile,
  RunEntry,
  SeriesFile,
  DataPoint,
} from "@benchkit/format";

/** A parsed benchmark run with its identifier. */
export interface ParsedRun {
  id: string;
  result: BenchmarkResult;
}

/**
 * When a benchmark name starts with `_monitor/`, prefix the metric name
 * so Dashboard can partition monitor metrics from user benchmarks.
 */
export function resolveMetricName(benchName: string, metricName: string): string {
  return benchName.startsWith("_monitor/") ? `_monitor/${metricName}` : metricName;
}

/** Sort runs by timestamp (oldest first). */
export function sortRuns(runs: ParsedRun[]): void {
  runs.sort((a, b) => {
    const ta = a.result.context?.timestamp ?? "";
    const tb = b.result.context?.timestamp ?? "";
    return ta.localeCompare(tb);
  });
}

/**
 * Remove the oldest runs so that at most `maxRuns` remain.
 * Returns the IDs of the pruned runs.
 */
export function pruneRuns(runs: ParsedRun[], maxRuns: number): string[] {
  if (maxRuns <= 0 || runs.length <= maxRuns) return [];
  const removed = runs.splice(0, runs.length - maxRuns);
  return removed.map((r) => r.id);
}

/** Build the index file from a set of runs (assumes runs are already sorted oldest-first). */
export function buildIndex(runs: ParsedRun[]): IndexFile {
  const allMetrics = new Set<string>();
  const indexRuns: RunEntry[] = runs.map((r) => {
    const metricNames = new Set<string>();
    const benchNames = new Set<string>();
    for (const b of r.result.benchmarks) {
      benchNames.add(b.name);
      for (const m of Object.keys(b.metrics)) {
        const resolved = resolveMetricName(b.name, m);
        metricNames.add(resolved);
        allMetrics.add(resolved);
      }
    }
    return {
      id: r.id,
      timestamp: r.result.context?.timestamp ?? new Date().toISOString(),
      commit: r.result.context?.commit,
      ref: r.result.context?.ref,
      benchmarks: benchNames.size,
      metrics: Array.from(metricNames).sort(),
      monitor: r.result.context?.monitor,
    };
  });

  return {
    runs: [...indexRuns].reverse(), // newest first
    metrics: Array.from(allMetrics).sort(),
  };
}

/**
 * Build series files from runs. When a run has multiple benchmarks with the
 * same name (e.g. Go `-count=N`), their metric values are averaged and the
 * range is computed from the spread.
 */
export function buildSeries(runs: ParsedRun[]): Map<string, SeriesFile> {
  const seriesMap = new Map<string, SeriesFile>();

  for (const r of runs) {
    // Group benchmarks by (name + tags) within this run
    const groups = new Map<
      string,
      {
        name: string;
        tags?: Record<string, string>;
        values: Map<
          string,
          {
            sum: number;
            count: number;
            min: number;
            max: number;
            unit?: string;
            direction?: "bigger_is_better" | "smaller_is_better";
          }
        >;
      }
    >();

    for (const bench of r.result.benchmarks) {
      const tagsStr = bench.tags
        ? Object.entries(bench.tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(",")
        : "";
      const groupKey = tagsStr ? `${bench.name} [${tagsStr}]` : bench.name;

      let group = groups.get(groupKey);
      if (!group) {
        group = { name: bench.name, tags: bench.tags, values: new Map() };
        groups.set(groupKey, group);
      }

      for (const [metricName, metric] of Object.entries(bench.metrics)) {
        let agg = group.values.get(metricName);
        if (!agg) {
          agg = {
            sum: 0,
            count: 0,
            min: Infinity,
            max: -Infinity,
            unit: metric.unit,
            direction: metric.direction,
          };
          group.values.set(metricName, agg);
        }
        agg.sum += metric.value;
        agg.count++;
        agg.min = Math.min(agg.min, metric.value);
        agg.max = Math.max(agg.max, metric.value);
      }
    }

    // Emit one point per (seriesKey, metric) per run
    for (const [seriesKey, group] of groups) {
      for (const [metricName, agg] of group.values) {
        const resolvedMetric = resolveMetricName(group.name, metricName);
        let series = seriesMap.get(resolvedMetric);
        if (!series) {
          series = {
            metric: resolvedMetric,
            unit: agg.unit,
            direction: agg.direction,
            series: {},
          };
          seriesMap.set(resolvedMetric, series);
        }

        if (!series.series[seriesKey]) {
          series.series[seriesKey] = { tags: group.tags, points: [] };
        }

        const avg = agg.sum / agg.count;
        const range = agg.count > 1 ? agg.max - agg.min : undefined;
        const point: DataPoint = {
          timestamp:
            r.result.context?.timestamp ?? new Date().toISOString(),
          value: Math.round(avg * 100) / 100,
          commit: r.result.context?.commit,
          run_id: r.id,
          range:
            range != null ? Math.round(range * 100) / 100 : undefined,
        };
        series.series[seriesKey].points.push(point);
      }
    }
  }

  return seriesMap;
}

/**
 * Read all run JSON files from `runsDir`.
 * Throws on corrupted (non-parseable) run files so the caller can surface
 * a clear error message including the offending file name.
 */
export function readRuns(runsDir: string): ParsedRun[] {
  if (!fs.existsSync(runsDir)) return [];
  const runFiles = fs.readdirSync(runsDir).filter((f) => f.endsWith(".json")).sort();
  return runFiles.map((file) => {
    const filePath = path.join(runsDir, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (err) {
      throw new Error(
        `Failed to parse run file '${file}': ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(
        `Run file '${file}' must contain a JSON object, got ${parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed}`,
      );
    }
    return { id: path.basename(file, ".json"), result: parsed as BenchmarkResult };
  });
}
