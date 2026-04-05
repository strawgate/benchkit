/**
 * Convert a BenchmarkResult into an OtlpMetricsDocument.
 *
 * This is the reverse of `projectBenchmarkResultFromOtlp` — it takes
 * benchkit-native data and wraps it in the OTLP metrics JSON structure
 * with the standard benchkit resource and datapoint attributes.
 */

import {
  ATTR_COMMIT,
  ATTR_KIND,
  ATTR_METRIC_DIRECTION,
  ATTR_REF,
  ATTR_RUN_ID,
  ATTR_RUNNER,
  ATTR_SCENARIO,
  ATTR_SERIES,
  ATTR_SOURCE_FORMAT,
} from "./otlp-conventions.js";
import type {
  BenchmarkResult,
  OtlpAttribute,
  OtlpGaugeDataPoint,
  OtlpMetric,
  OtlpMetricsDocument,
  OtlpResourceMetrics,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ToOtlpOptions {
  /** Unique run identifier stored as `benchkit.run_id`. */
  runId: string;
  /** Parser / origin format stored as `benchkit.source_format`. */
  sourceFormat: string;
  /** Benchmark kind (code | workflow | hybrid). Defaults to `"code"`. */
  kind?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStringAttribute(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

function isoToNanos(iso: string): string {
  return String(BigInt(new Date(iso).getTime()) * 1_000_000n);
}

// ---------------------------------------------------------------------------
// Main conversion
// ---------------------------------------------------------------------------

/**
 * Convert a `BenchmarkResult` into an `OtlpMetricsDocument`.
 *
 * Resource attributes are populated from `result.context` and the supplied
 * `options`. Each benchmark's metrics become gauge datapoints keyed by
 * `benchkit.scenario` (the benchmark name).
 */
export function benchmarkResultToOtlp(
  result: BenchmarkResult,
  options: ToOtlpOptions,
): OtlpMetricsDocument {
  // ── Resource attributes ──────────────────────────────────────────
  const resourceAttrs: OtlpAttribute[] = [
    makeStringAttribute(ATTR_RUN_ID, options.runId),
    makeStringAttribute(ATTR_KIND, options.kind ?? "code"),
    makeStringAttribute(ATTR_SOURCE_FORMAT, options.sourceFormat),
  ];

  if (result.context?.commit) {
    resourceAttrs.push(makeStringAttribute(ATTR_COMMIT, result.context.commit));
  }
  if (result.context?.ref) {
    resourceAttrs.push(makeStringAttribute(ATTR_REF, result.context.ref));
  }
  if (result.context?.runner) {
    resourceAttrs.push(makeStringAttribute(ATTR_RUNNER, result.context.runner));
  }

  // ── Determine timestamp ──────────────────────────────────────────
  const timestampNanos = isoToNanos(
    result.context?.timestamp ?? new Date().toISOString(),
  );

  // ── Group datapoints by metric name ──────────────────────────────
  const metricsByName = new Map<
    string,
    { unit?: string; dataPoints: OtlpGaugeDataPoint[] }
  >();

  for (const benchmark of result.benchmarks) {
    for (const [metricName, metric] of Object.entries(benchmark.metrics)) {
      const dpAttrs: OtlpAttribute[] = [
        makeStringAttribute(ATTR_SCENARIO, benchmark.name),
        makeStringAttribute(ATTR_SERIES, benchmark.name),
      ];

      if (metric.direction) {
        dpAttrs.push(
          makeStringAttribute(ATTR_METRIC_DIRECTION, metric.direction),
        );
      }

      if (benchmark.tags) {
        for (const [tagKey, tagValue] of Object.entries(benchmark.tags)) {
          dpAttrs.push(makeStringAttribute(tagKey, tagValue));
        }
      }

      const dataPoint: OtlpGaugeDataPoint = {
        timeUnixNano: timestampNanos,
        asDouble: metric.value,
        attributes: dpAttrs,
      };

      let entry = metricsByName.get(metricName);
      if (!entry) {
        entry = { unit: metric.unit, dataPoints: [] };
        metricsByName.set(metricName, entry);
      }
      entry.dataPoints.push(dataPoint);
    }
  }

  // ── Build OTLP metrics ──────────────────────────────────────────
  const metrics: OtlpMetric[] = [];
  for (const [name, { unit, dataPoints }] of metricsByName) {
    const metric: OtlpMetric = { name, gauge: { dataPoints } };
    if (unit) {
      metric.unit = unit;
    }
    metrics.push(metric);
  }

  const resourceMetrics: OtlpResourceMetrics = {
    resource: { attributes: resourceAttrs },
    scopeMetrics: [{ metrics }],
  };

  return { resourceMetrics: [resourceMetrics] };
}
