import { inferDirection } from "./infer-direction.js";
import {
  ATTR_COMMIT,
  ATTR_KIND,
  ATTR_METRIC_DIRECTION,
  ATTR_REF,
  ATTR_RUN_ID,
  ATTR_RUNNER,
  ATTR_SCENARIO,
  ATTR_SERIES,
  ATTR_SERVICE_NAME,
  ATTR_SOURCE_FORMAT,
  MONITOR_METRIC_PREFIX,
  RESERVED_DATAPOINT_ATTRIBUTES,
} from "./otlp-conventions.js";
import { isValidDirection } from "./otlp-validation.js";
import type {
  Benchmark,
  BenchmarkResult,
  Context,
  Metric,
  OtlpAggregationTemporality,
  OtlpAnyValue,
  OtlpAttribute,
  OtlpGaugeDataPoint,
  OtlpHistogramDataPoint,
  OtlpMetric,
  OtlpMetricsDocument,
  Sample,
} from "./types.js";

function anyValueToString(value: OtlpAnyValue | undefined): string {
  if (!value) return "";
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return String(value.boolValue);
  if (value.intValue !== undefined) return String(value.intValue);
  if (value.doubleValue !== undefined) return String(value.doubleValue);
  return "";
}

/**
 * Flatten an OTLP `KeyValue` attribute array into a plain string record.
 *
 * All OTLP value types (string, bool, int, double) are coerced to strings.
 * Attributes with an absent or unrecognised value are stored as empty strings.
 *
 * @param attributes - Optional OTLP attribute array to flatten.
 * @returns A `Record<string, string>` mapping each attribute key to its string value.
 */
export function otlpAttributesToRecord(attributes: OtlpAttribute[] | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  for (const attribute of attributes ?? []) {
    record[attribute.key] = anyValueToString(attribute.value);
  }
  return record;
}

/**
 * Parse and minimally validate an OTLP metrics JSON string.
 *
 * Validates that the top-level object contains a `resourceMetrics` array.
 * Throws if the input is not valid JSON or if `resourceMetrics` is absent/not
 * an array.
 *
 * @param input - Raw OTLP metrics JSON string.
 * @returns The parsed `OtlpMetricsDocument`.
 */
export function parseOtlpMetrics(input: string): OtlpMetricsDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    throw new Error(`[parse-otlp] Invalid JSON: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).resourceMetrics)
  ) {
    throw new Error("[parse-otlp] OTLP metrics JSON must contain a top-level resourceMetrics array.");
  }
  return parsed as OtlpMetricsDocument;
}

/**
 * Determine the data kind of an OTLP metric.
 *
 * Supported kinds are `"gauge"`, `"sum"`, and `"histogram"`.
 * Throws an `Error` if none of those fields are present on the metric.
 *
 * @param metric - The OTLP metric to inspect.
 * @returns `"gauge"`, `"sum"`, or `"histogram"`.
 */
export function getOtlpMetricKind(metric: OtlpMetric): "gauge" | "sum" | "histogram" {
  if (metric.gauge) return "gauge";
  if (metric.sum) return "sum";
  if (metric.histogram) return "histogram";
  throw new Error(`Unsupported OTLP metric kind for metric '${metric.name}'.`);
}

/**
 * Resolve the aggregation temporality for an OTLP sum or histogram metric.
 *
 * Maps the raw numeric OTLP enum to a human-readable string:
 * - `1` → `"delta"`
 * - `2` → `"cumulative"`
 * - anything else (including absent) → `"unspecified"`
 *
 * @param metric - The OTLP metric to inspect.
 * @returns The `OtlpAggregationTemporality` string value.
 */
export function getOtlpTemporality(metric: OtlpMetric): OtlpAggregationTemporality {
  const raw = metric.sum?.aggregationTemporality ?? metric.histogram?.aggregationTemporality;
  if (raw === 1) return "delta";
  if (raw === 2) return "cumulative";
  return "unspecified";
}

function nanosToMillis(nanos: string | undefined): number | undefined {
  if (!nanos) return undefined;
  return Number(BigInt(nanos) / 1_000_000n);
}

function nanosToIso(nanos: string | undefined): string | undefined {
  const millis = nanosToMillis(nanos);
  return millis === undefined ? undefined : new Date(millis).toISOString();
}

function datapointNumberValue(point: OtlpGaugeDataPoint): number {
  if (typeof point.asDouble === "number") return point.asDouble;
  if (point.asInt !== undefined) return Number(point.asInt);
  throw new Error("OTLP datapoint is missing both asDouble and asInt numeric values.");
}

function benchmarkTags(pointAttributes: Record<string, string>): Record<string, string> | undefined {
  const tags = Object.fromEntries(
    Object.entries(pointAttributes).filter(([key]) => !RESERVED_DATAPOINT_ATTRIBUTES.has(key)),
  );
  return Object.keys(tags).length > 0 ? tags : undefined;
}

function buildBenchmarkKey(name: string, series: string): string {
  return `${name}|${series}`;
}

function pushSample(
  samplesByMillis: Map<number, Sample>,
  millis: number,
  baselineMillis: number,
  metricName: string,
  value: number,
): void {
  let sample = samplesByMillis.get(millis);
  if (!sample) {
    sample = { t: (millis - baselineMillis) / 1000 };
    samplesByMillis.set(millis, sample);
  }
  sample[metricName] = value;
}

type MutableBenchmarkGroup = {
  benchmark: Benchmark;
  samplesByMillis: Map<number, Sample>;
  sampleBaselineMillis?: number;
  metricTimestamps: Map<string, number>;
};

function ensureGroup(
  groups: Map<string, MutableBenchmarkGroup>,
  benchmarkName: string,
  series: string,
  tags: Record<string, string> | undefined,
): MutableBenchmarkGroup {
  const groupKey = buildBenchmarkKey(benchmarkName, series);
  const existing = groups.get(groupKey);
  if (existing) {
    if (tags) {
      existing.benchmark.tags = { ...(existing.benchmark.tags ?? {}), ...tags };
    }
    return existing;
  }
  const created: MutableBenchmarkGroup = {
    benchmark: {
      name: benchmarkName,
      tags,
      metrics: {},
    },
    samplesByMillis: new Map(),
    metricTimestamps: new Map(),
  };
  groups.set(groupKey, created);
  return created;
}

function upsertMetric(
  group: MutableBenchmarkGroup,
  metricName: string,
  metric: Metric,
  pointTimestampMillis: number | undefined,
): void {
  const previousTimestamp = group.metricTimestamps.get(metricName);
  const nextTimestamp = pointTimestampMillis ?? Number.POSITIVE_INFINITY;
  if (previousTimestamp === undefined || nextTimestamp >= previousTimestamp) {
    group.benchmark.metrics[metricName] = metric;
    group.metricTimestamps.set(metricName, nextTimestamp);
  }
}

function requiredResourceAttr(attributes: Record<string, string>, key: string, metricName: string): string {
  const value = attributes[key];
  if (!value) {
    throw new Error(`Missing required resource attribute '${key}' for OTLP metric '${metricName}'.`);
  }
  return value;
}

function resolveDirection(metricName: string, unit: string | undefined, pointAttributes: Record<string, string>): Metric["direction"] {
  const explicit = pointAttributes[ATTR_METRIC_DIRECTION];
  if (explicit) {
    if (!isValidDirection(explicit)) {
      throw new Error(
        `Invalid '${ATTR_METRIC_DIRECTION}' value '${explicit}' on metric '${metricName}'. ` +
          `Expected 'bigger_is_better' or 'smaller_is_better'.`,
      );
    }
    return explicit;
  }
  return inferDirection(unit ?? metricName);
}

function projectGaugeLikeMetric(
  groups: Map<string, MutableBenchmarkGroup>,
  metric: OtlpMetric,
  points: OtlpGaugeDataPoint[] | undefined,
  _resourceAttributes: Record<string, string>,
): void {
  for (const point of points ?? []) {
    const pointAttributes = otlpAttributesToRecord(point.attributes);
    const benchmarkName = pointAttributes[ATTR_SCENARIO]
      || (metric.name.startsWith(MONITOR_METRIC_PREFIX) ? "diagnostic" : "");
    if (!benchmarkName) {
      throw new Error(`Missing required datapoint attribute '${ATTR_SCENARIO}' for OTLP metric '${metric.name}'.`);
    }

    const series = pointAttributes[ATTR_SERIES];
    if (!series) {
      throw new Error(`Missing required datapoint attribute '${ATTR_SERIES}' for OTLP metric '${metric.name}'.`);
    }

    const group = ensureGroup(groups, benchmarkName, series, {
      series,
      ...(benchmarkTags(pointAttributes) ?? {}),
    });
    const timestampMillis = nanosToMillis(point.timeUnixNano);
    const timestampIso = nanosToIso(point.timeUnixNano);
    const metricValue = datapointNumberValue(point);
    const direction = resolveDirection(metric.name, metric.unit, pointAttributes);
    const metricRecord: Metric = {
      value: metricValue,
      unit: metric.unit,
      direction,
    };

    upsertMetric(group, metric.name, metricRecord, timestampMillis);
    if (timestampMillis !== undefined) {
      if (group.sampleBaselineMillis === undefined || timestampMillis < group.sampleBaselineMillis) {
        group.sampleBaselineMillis = timestampMillis;
      }
      pushSample(
        group.samplesByMillis,
        timestampMillis,
        group.sampleBaselineMillis,
        metric.name,
        metricValue,
      );
    } else if (timestampIso === undefined) {
      // no-op, metric still captured as latest snapshot
    }
  }
}

function projectHistogramMetric(
  groups: Map<string, MutableBenchmarkGroup>,
  metric: OtlpMetric,
  points: OtlpHistogramDataPoint[] | undefined,
  _resourceAttributes: Record<string, string>,
): void {
  for (const point of points ?? []) {
    const pointAttributes = otlpAttributesToRecord(point.attributes);
    const benchmarkName = pointAttributes[ATTR_SCENARIO]
      || (metric.name.startsWith(MONITOR_METRIC_PREFIX) ? "diagnostic" : "");
    if (!benchmarkName) {
      throw new Error(`Missing required datapoint attribute '${ATTR_SCENARIO}' for OTLP histogram '${metric.name}'.`);
    }

    const series = pointAttributes[ATTR_SERIES];
    if (!series) {
      throw new Error(`Missing required datapoint attribute '${ATTR_SERIES}' for OTLP histogram '${metric.name}'.`);
    }

    const group = ensureGroup(groups, benchmarkName, series, {
      series,
      ...(benchmarkTags(pointAttributes) ?? {}),
    });
    const timestampMillis = nanosToMillis(point.timeUnixNano);
    const direction = resolveDirection(metric.name, metric.unit, pointAttributes);
    const count = point.count !== undefined ? Number(point.count) : undefined;
    const sum = point.sum;

    if (count !== undefined) {
      upsertMetric(group, `${metric.name}.count`, {
        value: count,
        unit: "count",
        direction: "bigger_is_better",
      }, timestampMillis);
    }
    if (typeof sum === "number") {
      upsertMetric(group, `${metric.name}.sum`, {
        value: sum,
        unit: metric.unit,
        direction,
      }, timestampMillis);
    }

    if (timestampMillis !== undefined) {
      if (group.sampleBaselineMillis === undefined || timestampMillis < group.sampleBaselineMillis) {
        group.sampleBaselineMillis = timestampMillis;
      }
      if (count !== undefined) {
        pushSample(group.samplesByMillis, timestampMillis, group.sampleBaselineMillis, `${metric.name}.count`, count);
      }
      if (typeof sum === "number") {
        pushSample(group.samplesByMillis, timestampMillis, group.sampleBaselineMillis, `${metric.name}.sum`, sum);
      }
    }
  }
}

/**
 * Project an `OtlpMetricsDocument` into a benchkit `BenchmarkResult`.
 *
 * The projection runs in three phases:
 * 1. **Resource collection** — required resource attributes (`benchkit.run_id`,
 *    `benchkit.kind`, `benchkit.source_format`) are validated and context
 *    metadata (commit, ref, runner) is extracted.
 * 2. **Datapoint traversal** — each metric datapoint is mapped to a benchmark
 *    group keyed by `benchkit.scenario` + `benchkit.series`. Gauge and sum
 *    metrics are treated identically; histograms are split into `.count` and
 *    `.sum` child metrics. The latest datapoint (by timestamp) wins for each
 *    metric within a group.
 * 3. **Time-series building** — per-group datapoints are sorted by timestamp
 *    and attached as `samples` when more than one datapoint exists.
 *
 * @param document - A parsed `OtlpMetricsDocument` (e.g. from `parseOtlpMetrics`).
 * @returns A `BenchmarkResult` containing all projected benchmarks and context.
 */
export function projectBenchmarkResultFromOtlp(document: OtlpMetricsDocument): BenchmarkResult {
  // Phase 1: Initialize groups and context
  const groups = new Map<string, MutableBenchmarkGroup>();
  let latestTimestamp: string | undefined;
  let contextTemplate: Context | undefined;

  // Phase 2: Traverse resourceMetrics → scopeMetrics → metrics → datapoints
  for (const resourceMetric of document.resourceMetrics) {
    const resourceAttributes = otlpAttributesToRecord(resourceMetric.resource?.attributes);
    requiredResourceAttr(resourceAttributes, ATTR_RUN_ID, "<resource>");
    requiredResourceAttr(resourceAttributes, ATTR_KIND, "<resource>");
    requiredResourceAttr(resourceAttributes, ATTR_SOURCE_FORMAT, "<resource>");

    contextTemplate = {
      commit: contextTemplate?.commit || resourceAttributes[ATTR_COMMIT],
      ref: contextTemplate?.ref || resourceAttributes[ATTR_REF],
      runner: contextTemplate?.runner || resourceAttributes[ATTR_RUNNER] || resourceAttributes[ATTR_SERVICE_NAME],
      timestamp: contextTemplate?.timestamp,
    };

    for (const scopeMetric of resourceMetric.scopeMetrics ?? []) {
      for (const metric of scopeMetric.metrics ?? []) {
        const metricKind = getOtlpMetricKind(metric);
        if (metricKind === "gauge" || metricKind === "sum") {
          const points = metricKind === "gauge" ? metric.gauge?.dataPoints : metric.sum?.dataPoints;
          projectGaugeLikeMetric(groups, metric, points, resourceAttributes);
          for (const point of points ?? []) {
            const iso = nanosToIso(point.timeUnixNano);
            if (iso && (!latestTimestamp || iso > latestTimestamp)) {
              latestTimestamp = iso;
            }
          }
        } else if (metricKind === "histogram") {
          const points = metric.histogram?.dataPoints;
          projectHistogramMetric(groups, metric, points, resourceAttributes);
          for (const point of points ?? []) {
            const iso = nanosToIso(point.timeUnixNano);
            if (iso && (!latestTimestamp || iso > latestTimestamp)) {
              latestTimestamp = iso;
            }
          }
        }
      }
    }
  }

  // Phase 3: Finalize benchmarks — sort samples and build result
  const benchmarks = [...groups.values()].map((group) => {
    const samples = [...group.samplesByMillis.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([, sample]) => sample);
    return {
      ...group.benchmark,
      samples: samples.length > 1 ? samples : undefined,
    };
  });

  return {
    benchmarks,
    context: contextTemplate ? {
      ...contextTemplate,
      timestamp: latestTimestamp ?? contextTemplate.timestamp,
    } : latestTimestamp ? { timestamp: latestTimestamp } : undefined,
  };
}
