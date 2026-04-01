import { inferDirection } from "./infer-direction.js";
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

const RESERVED_POINT_KEYS = new Set([
  "benchkit.scenario",
  "benchkit.series",
  "benchkit.metric.direction",
  "benchkit.metric.role",
]);

function anyValueToString(value: OtlpAnyValue | undefined): string {
  if (!value) return "";
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return String(value.boolValue);
  if (value.intValue !== undefined) return String(value.intValue);
  if (value.doubleValue !== undefined) return String(value.doubleValue);
  return "";
}

export function otlpAttributesToRecord(attributes: OtlpAttribute[] | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  for (const attribute of attributes ?? []) {
    record[attribute.key] = anyValueToString(attribute.value);
  }
  return record;
}

export function parseOtlpMetrics(input: string): OtlpMetricsDocument {
  const parsed = JSON.parse(input) as Record<string, unknown>;
  if (!Array.isArray(parsed.resourceMetrics)) {
    throw new Error("OTLP metrics JSON must contain a top-level resourceMetrics array.");
  }
  return parsed as unknown as OtlpMetricsDocument;
}

export function getOtlpMetricKind(metric: OtlpMetric): "gauge" | "sum" | "histogram" {
  if (metric.gauge) return "gauge";
  if (metric.sum) return "sum";
  if (metric.histogram) return "histogram";
  throw new Error(`Unsupported OTLP metric kind for metric '${metric.name}'.`);
}

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
    Object.entries(pointAttributes).filter(([key]) => !RESERVED_POINT_KEYS.has(key)),
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
  const explicit = pointAttributes["benchkit.metric.direction"];
  if (explicit === "bigger_is_better" || explicit === "smaller_is_better") {
    return explicit;
  }
  return inferDirection(unit ?? metricName);
}

function projectGaugeLikeMetric(
  groups: Map<string, MutableBenchmarkGroup>,
  metric: OtlpMetric,
  points: OtlpGaugeDataPoint[] | undefined,
  resourceAttributes: Record<string, string>,
): void {
  for (const point of points ?? []) {
    const pointAttributes = otlpAttributesToRecord(point.attributes);
    const benchmarkName = pointAttributes["benchkit.scenario"]
      || (metric.name.startsWith("_monitor.") ? "diagnostic" : "");
    if (!benchmarkName) {
      throw new Error(`Missing required datapoint attribute 'benchkit.scenario' for OTLP metric '${metric.name}'.`);
    }

    const series = pointAttributes["benchkit.series"];
    if (!series) {
      throw new Error(`Missing required datapoint attribute 'benchkit.series' for OTLP metric '${metric.name}'.`);
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
  resourceAttributes: Record<string, string>,
): void {
  for (const point of points ?? []) {
    const pointAttributes = otlpAttributesToRecord(point.attributes);
    const benchmarkName = pointAttributes["benchkit.scenario"]
      || (metric.name.startsWith("_monitor.") ? "diagnostic" : "");
    if (!benchmarkName) {
      throw new Error(`Missing required datapoint attribute 'benchkit.scenario' for OTLP histogram '${metric.name}'.`);
    }

    const series = pointAttributes["benchkit.series"];
    if (!series) {
      throw new Error(`Missing required datapoint attribute 'benchkit.series' for OTLP histogram '${metric.name}'.`);
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

export function projectBenchmarkResultFromOtlp(document: OtlpMetricsDocument): BenchmarkResult {
  const groups = new Map<string, MutableBenchmarkGroup>();
  let latestTimestamp: string | undefined;
  let contextTemplate: Context | undefined;

  for (const resourceMetric of document.resourceMetrics) {
    const resourceAttributes = otlpAttributesToRecord(resourceMetric.resource?.attributes);
    const runId = requiredResourceAttr(resourceAttributes, "benchkit.run_id", "<resource>");
    const kind = requiredResourceAttr(resourceAttributes, "benchkit.kind", "<resource>");
    const sourceFormat = requiredResourceAttr(resourceAttributes, "benchkit.source_format", "<resource>");
    void runId;
    void kind;
    void sourceFormat;

    contextTemplate = {
      commit: resourceAttributes["benchkit.commit"],
      ref: resourceAttributes["benchkit.ref"],
      runner: resourceAttributes["benchkit.runner"] || resourceAttributes["service.name"],
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
