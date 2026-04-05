import type {
  BenchmarkResult,
  ComparisonEntry,
  ComparisonResult,
  OtlpMetricsDocument,
  ThresholdConfig,
} from "./types.js";
import { inferDirection } from "./infer-direction.js";
import { extractComparisonMetrics } from "./otlp-projections.js";

const DEFAULT_THRESHOLD: ThresholdConfig = { test: "percentage", threshold: 5 };

/**
 * Compare a current OTLP metrics document against one or more baseline
 * OTLP documents.
 *
 * Internally projects each `OtlpMetricsDocument` to a `BenchmarkResult`
 * using `extractComparisonMetrics()` (which filters out monitor and
 * diagnostic-role metrics) then delegates to `compareBenchmarkResults()`.
 *
 * @param current - The OTLP metrics document from the current run.
 * @param baseline - One or more baseline `OtlpMetricsDocument` objects to compare against.
 * @param config - Threshold configuration controlling regression sensitivity (default: 5 % percentage).
 * @returns A `ComparisonResult` with per-metric entries and an overall regression flag.
 */
export function compareRuns(
  current: OtlpMetricsDocument,
  baseline: OtlpMetricsDocument[],
  config: ThresholdConfig = DEFAULT_THRESHOLD,
): ComparisonResult {
  const currentResult = extractComparisonMetrics(current);
  const baselineResults = baseline.map((b) => extractComparisonMetrics(b));
  return compareBenchmarkResults(currentResult, baselineResults, config);
}

/**
 * Compare a current benchmark run against one or more baseline runs.
 *
 * Baseline values are averaged across the provided runs. For each
 * benchmark+metric pair in `current`, the function computes a percentage
 * change and applies the threshold test to classify the result as
 * improved, stable, or regressed.
 *
 * Benchmarks present in `current` but absent from every baseline run are
 * excluded from the output — new benchmarks have no history to regress
 * against.
 *
 * @param current - The benchmark result from the current run.
 * @param baseline - One or more baseline `BenchmarkResult` objects to compare against.
 * @param config - Threshold configuration controlling regression sensitivity (default: 5 % percentage).
 * @returns A `ComparisonResult` with per-metric entries and an overall regression flag.
 */
export function compareBenchmarkResults(
  current: BenchmarkResult,
  baseline: BenchmarkResult[],
  config: ThresholdConfig = DEFAULT_THRESHOLD,
): ComparisonResult {
  if (baseline.length === 0) {
    return { entries: [], hasRegression: false };
  }

  // Build a lookup: benchmark name → metric name → values[]
  const baselineMap = new Map<string, Map<string, number[]>>();
  for (const run of baseline) {
    for (const bench of run.benchmarks) {
      let metricMap = baselineMap.get(bench.name);
      if (!metricMap) {
        metricMap = new Map();
        baselineMap.set(bench.name, metricMap);
      }
      for (const [metricName, metric] of Object.entries(bench.metrics)) {
        let values = metricMap.get(metricName);
        if (!values) {
          values = [];
          metricMap.set(metricName, values);
        }
        values.push(metric.value);
      }
    }
  }

  const entries: ComparisonEntry[] = [];
  const warnings: string[] = [];

  for (const bench of current.benchmarks) {
    const baselineMetrics = baselineMap.get(bench.name);
    if (!baselineMetrics) continue; // new benchmark — no baseline to compare

    for (const [metricName, metric] of Object.entries(bench.metrics)) {
      const baselineValues = baselineMetrics.get(metricName);
      if (!baselineValues || baselineValues.length === 0) continue;

      const baselineAvg =
        baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;

      // Avoid division by zero
      if (baselineAvg === 0) {
        warnings.push(
          `Skipped metric '${metricName}' for benchmark '${bench.name}': baseline mean is zero`,
        );
        continue;
      }

      const direction =
        metric.direction ?? inferDirection(metric.unit ?? metricName);

      const rawChange = ((metric.value - baselineAvg) / baselineAvg) * 100;

      // For smaller_is_better: positive change = worse (regressed)
      // For bigger_is_better: negative change = worse (regressed)
      const isWorse =
        direction === "smaller_is_better" ? rawChange > 0 : rawChange < 0;
      const isBetter =
        direction === "smaller_is_better" ? rawChange < 0 : rawChange > 0;

      const absChange = Math.abs(rawChange);
      let status: ComparisonEntry["status"];
      if (absChange <= config.threshold) {
        status = "stable";
      } else if (isWorse) {
        status = "regressed";
      } else if (isBetter) {
        status = "improved";
      } else {
        status = "stable";
      }

      entries.push({
        benchmark: bench.name,
        metric: metricName,
        unit: metric.unit,
        direction,
        baseline: baselineAvg,
        current: metric.value,
        percentChange: Math.round(rawChange * 100) / 100,
        status,
      });
    }
  }

  return {
    entries,
    hasRegression: entries.some((e) => e.status === "regressed"),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
