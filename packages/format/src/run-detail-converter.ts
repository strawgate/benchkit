import type { BenchmarkEntry, BenchmarkResult, RunDetailView } from "./types.js";

/** Stable tag comparison that is not sensitive to object key insertion order. */
function tagsEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k, i) => keysB[i] === k && a[k] === b[k]);
}

/**
 * Convert a `RunDetailView` back into a `BenchmarkResult`.
 *
 * This allows consumers to use `compare()` with runs that were loaded from
 * the data branch as `data/views/runs/{id}/detail.json` files.
 */
export function detailViewToBenchmarkResult(detail: RunDetailView): BenchmarkResult {
  const benchmarks: BenchmarkEntry[] = [];

  for (const snapshot of detail.metricSnapshots) {
    for (const snapshotMetric of snapshot.values) {
      // Find or create the benchmark entry for this series name
      let bench = benchmarks.find(
        (b) =>
          b.name === snapshotMetric.name &&
          tagsEqual(b.tags, snapshotMetric.tags),
      );
      if (!bench) {
        bench = {
          name: snapshotMetric.name,
          tags: snapshotMetric.tags,
          metrics: {},
        };
        benchmarks.push(bench);
      }
      bench.metrics[snapshot.metric] = {
        value: snapshotMetric.value,
        unit: snapshotMetric.unit ?? snapshot.unit,
        direction: snapshotMetric.direction ?? snapshot.direction,
        range: snapshotMetric.range,
      };
    }
  }

  return {
    benchmarks,
    context: {
      commit: detail.run.commit,
      ref: detail.run.ref,
      timestamp: detail.run.timestamp,
      monitor: detail.run.monitor,
    },
  };
}
