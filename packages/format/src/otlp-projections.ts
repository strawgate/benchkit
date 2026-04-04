/**
 * OTLP Projection Helpers
 *
 * Higher-level functions that extract specific views from an OTLP document.
 * Each consumer (RunDashboard, CompetitiveDashboard, aggregate) gets a
 * purpose-built projection rather than a universal intermediate format.
 */

import {
  ATTR_COMMIT,
  ATTR_METRIC_ROLE,
  ATTR_REF,
  ATTR_RUNNER,
  ATTR_SCENARIO,
  ATTR_SERVICE_NAME,
  MONITOR_METRIC_PREFIX,
} from "./otlp-conventions.js";
import { isMonitorMetric } from "./otlp-validation.js";
import {
  getOtlpMetricKind,
  getOtlpTemporality,
  otlpAttributesToRecord,
  projectBenchmarkResultFromOtlp,
} from "./parse-otlp.js";
import type {
  BenchmarkResult,
  Context,
  OtlpAggregationTemporality,
  OtlpAttribute,
  OtlpMetric,
  OtlpMetricsDocument,
  OtlpResourceMetrics,
} from "./types.js";

// ---------------------------------------------------------------------------
// Run-level projection
// ---------------------------------------------------------------------------

/**
 * Extract all metrics from an OTLP document as a BenchmarkResult.
 *
 * This is the primary entry point for consumers that need a complete
 * picture of a run. Delegates to `projectBenchmarkResultFromOtlp()`.
 */
export function extractRunMetrics(
  doc: OtlpMetricsDocument,
): BenchmarkResult {
  return projectBenchmarkResultFromOtlp(doc);
}

// ---------------------------------------------------------------------------
// Scenario-filtered projection
// ---------------------------------------------------------------------------

/**
 * Extract only the metrics belonging to a specific scenario.
 *
 * Filters the OTLP document to datapoints where `benchkit.scenario`
 * matches the given value, then projects to BenchmarkResult.
 */
export function extractScenarioMetrics(
  doc: OtlpMetricsDocument,
  scenario: string,
): BenchmarkResult {
  const filtered = filterDocumentByScenario(doc, scenario);
  return projectBenchmarkResultFromOtlp(filtered);
}

// ---------------------------------------------------------------------------
// Comparison-filtered projection
// ---------------------------------------------------------------------------

/**
 * Extract metrics suitable for comparison (PR diff, regression detection).
 *
 * Optionally strips `_monitor.*` metrics and diagnostic-role metrics to
 * produce a cleaner comparison set focused on outcome metrics.
 */
export function extractComparisonMetrics(
  doc: OtlpMetricsDocument,
  excludeMonitor = true,
): BenchmarkResult {
  const filtered = filterDocumentForComparison(doc, excludeMonitor);
  return projectBenchmarkResultFromOtlp(filtered);
}

// ---------------------------------------------------------------------------
// Resource context extraction
// ---------------------------------------------------------------------------

/**
 * De-duplicate resource attributes across all ResourceMetrics into a
 * single Context object. Useful for building run metadata views.
 */
export function extractResourceContext(
  resourceMetrics: OtlpResourceMetrics[],
): Context {
  const context: Context = {};

  for (const rm of resourceMetrics) {
    const attrs = otlpAttributesToRecord(rm.resource?.attributes);
    if (attrs[ATTR_COMMIT] && !context.commit) context.commit = attrs[ATTR_COMMIT];
    if (attrs[ATTR_REF] && !context.ref) context.ref = attrs[ATTR_REF];
    if (!context.runner) {
      context.runner = attrs[ATTR_RUNNER] || attrs[ATTR_SERVICE_NAME];
    }
  }

  return context;
}

// ---------------------------------------------------------------------------
// Metric metadata traversal helpers
// ---------------------------------------------------------------------------

/**
 * Build a map of metric name → aggregation temporality.
 * Consumers can use this to know whether each metric is delta or cumulative.
 */
export function getMetricTemporality(
  metrics: OtlpMetric[],
): Map<string, OtlpAggregationTemporality> {
  const result = new Map<string, OtlpAggregationTemporality>();
  for (const metric of metrics) {
    result.set(metric.name, getOtlpTemporality(metric));
  }
  return result;
}

/**
 * Build a map of metric name → unit string.
 * Consumers can use this for display layer formatting.
 */
export function getMetricUnits(
  metrics: OtlpMetric[],
): Map<string, string | undefined> {
  const result = new Map<string, string | undefined>();
  for (const metric of metrics) {
    result.set(metric.name, metric.unit);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Internal filtering helpers
// ---------------------------------------------------------------------------

function effectiveScenario(metricName: string, attrs: Record<string, string>): string {
  return attrs[ATTR_SCENARIO]
    || (metricName.startsWith(MONITOR_METRIC_PREFIX) ? "diagnostic" : "");
}

/** Filter datapoints across all metric kinds using a single predicate. */
function filterMetricDataPoints(
  metric: OtlpMetric,
  predicate: (dp: { attributes?: OtlpAttribute[] }) => boolean,
): OtlpMetric {
  const kind = getOtlpMetricKind(metric);
  if (kind === "gauge") {
    return { ...metric, gauge: { ...metric.gauge, dataPoints: (metric.gauge?.dataPoints ?? []).filter(predicate) } };
  }
  if (kind === "sum") {
    return { ...metric, sum: { ...metric.sum, dataPoints: (metric.sum?.dataPoints ?? []).filter(predicate) } };
  }
  return { ...metric, histogram: { ...metric.histogram, dataPoints: (metric.histogram?.dataPoints ?? []).filter(predicate) } };
}

/** Returns true if the metric has at least one datapoint after filtering. */
function hasDataPoints(metric: OtlpMetric): boolean {
  const kind = getOtlpMetricKind(metric);
  if (kind === "gauge") return (metric.gauge?.dataPoints?.length ?? 0) > 0;
  if (kind === "sum") return (metric.sum?.dataPoints?.length ?? 0) > 0;
  return (metric.histogram?.dataPoints?.length ?? 0) > 0;
}

function filterDocumentByScenario(
  doc: OtlpMetricsDocument,
  scenario: string,
): OtlpMetricsDocument {
  return {
    resourceMetrics: doc.resourceMetrics.map((rm) => ({
      ...rm,
      scopeMetrics: (rm.scopeMetrics ?? []).map((sm) => ({
        ...sm,
        metrics: (sm.metrics ?? [])
          .map((metric) => filterMetricDataPoints(metric, (dp) => {
            const attrs = otlpAttributesToRecord(dp.attributes);
            return effectiveScenario(metric.name, attrs) === scenario;
          }))
          .filter(hasDataPoints),
      })),
    })),
  };
}

function filterDocumentForComparison(
  doc: OtlpMetricsDocument,
  excludeMonitor: boolean,
): OtlpMetricsDocument {
  return {
    resourceMetrics: doc.resourceMetrics.map((rm) => ({
      ...rm,
      scopeMetrics: (rm.scopeMetrics ?? []).map((sm) => ({
        ...sm,
        metrics: (sm.metrics ?? [])
          .filter((metric) => {
            if (excludeMonitor && isMonitorMetric(metric.name)) return false;
            return true;
          })
          .map((metric) => {
            if (!excludeMonitor) return metric;
            return filterMetricDataPoints(metric, (dp) =>
              otlpAttributesToRecord(dp.attributes)[ATTR_METRIC_ROLE] !== "diagnostic",
            );
          })
          .filter(hasDataPoints),
      })),
    })),
  };
}
