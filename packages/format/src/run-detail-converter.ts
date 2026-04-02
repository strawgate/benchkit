import type { Benchmark, BenchmarkResult, RunDetailView } from "./types.js";

/**
 * Convert a `RunDetailView` back into a `BenchmarkResult`.
 *
 * This allows consumers to use `compare()` with runs that were loaded from
 * the data branch as `data/views/runs/{id}/detail.json` files.
 */
export function detailViewToBenchmarkResult(detail: RunDetailView): BenchmarkResult {
  const benchmarks: Benchmark[] = [];

  for (const snapshot of detail.metricSnapshots) {
    for (const snapshotMetric of snapshot.values) {
      // Find or create the benchmark entry for this series name
      let bench = benchmarks.find(
        (b) =>
          b.name === snapshotMetric.name &&
          JSON.stringify(b.tags) === JSON.stringify(snapshotMetric.tags),
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
