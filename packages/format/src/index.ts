export type {
  BenchmarkResult,
  Benchmark,
  Metric,
  BenchkitRunKind,
  OtlpAggregationTemporality,
  OtlpAttribute,
  OtlpAnyValue,
  OtlpGaugeDataPoint,
  OtlpHistogramDataPoint,
  OtlpGaugeMetric,
  OtlpSumMetric,
  OtlpHistogramMetric,
  OtlpMetric,
  OtlpScopeMetrics,
  OtlpResource,
  OtlpResourceMetrics,
  OtlpMetricsDocument,
  NativeMetricInit,
  NativeBenchmarkInit,
  NativeResultInit,
  Sample,
  Context,
  MonitorContext,
  SeriesFile,
  SeriesEntry,
  DataPoint,
  IndexFile,
  RunEntry,
  ComparisonResult,
  ComparisonEntry,
  ComparisonStatus,
  FormatComparisonMarkdownOptions,
  ThresholdConfig,
  RefIndexEntry,
  PrIndexEntry,
  RunSnapshotMetric,
  RunDetailMetricSnapshot,
  RunDetailView,
  MetricSummaryEntry,
} from "./types.js";

/** Parse benchmark output in any supported format (auto-detect, go, native, benchmark-action). */
export { parse } from "./parse.js";
export type { Format } from "./parse.js";
/** Infer the `direction` ("smaller_is_better" / "bigger_is_better") from a metric unit string. */
export { inferDirection } from "./infer-direction.js";
/** Convert a benchmark unit string to a normalized metric name (e.g. "ns/op" -> "ns_per_op"). */
export { unitToMetricName } from "./parser-utils.js";
/** Parse a native JSON benchmark result (benchkit format). */
export { parseNative } from "./parse-native.js";
/** Parse Go testing/benchmark output text. */
export { parseGoBench } from "./parse-go.js";
/** Parse Rust cargo bench (libtest) output text. */
export { parseRustBench } from "./parse-rust.js";
/** Parse benchmark-action/github-action-benchmark JSON format. */
export { parseBenchmarkAction } from "./parse-benchmark-action.js";
/** Parse Hyperfine JSON format. */
export { parseHyperfine } from "./parse-hyperfine.js";
/** Parse pytest-benchmark JSON format. */
export { parsePytestBenchmark } from "./parse-pytest-benchmark.js";
/** Parse OTLP metrics JSON and project it into benchmark-oriented structures. */
export {
  parseOtlpMetrics,
  otlpAttributesToRecord,
  getOtlpMetricKind,
  getOtlpTemporality,
  projectBenchmarkResultFromOtlp,
} from "./parse-otlp.js";
/** OTLP semantic convention constants — attribute names, valid values, reserved keys. */
export {
  ATTR_RUN_ID,
  ATTR_KIND,
  ATTR_SOURCE_FORMAT,
  ATTR_REF,
  ATTR_COMMIT,
  ATTR_WORKFLOW,
  ATTR_JOB,
  ATTR_RUN_ATTEMPT,
  ATTR_RUNNER,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_SCENARIO,
  ATTR_SERIES,
  ATTR_METRIC_DIRECTION,
  ATTR_METRIC_ROLE,
  ATTR_IMPL,
  ATTR_DATASET,
  ATTR_TRANSPORT,
  ATTR_BATCH_SIZE,
  ATTR_PROCESS,
  ATTR_PIPELINE,
  ATTR_VARIANT,
  REQUIRED_RESOURCE_ATTRIBUTES,
  RESERVED_DATAPOINT_ATTRIBUTES,
  VALID_RUN_KINDS,
  VALID_DIRECTIONS,
  VALID_METRIC_ROLES,
  VALID_SOURCE_FORMATS,
  MONITOR_METRIC_PREFIX,
} from "./otlp-conventions.js";
export type { RunKind, Direction, MetricRole, SourceFormat } from "./otlp-conventions.js";
/** Runtime validators for the benchkit OTLP semantic contract. */
export {
  validateRequiredResourceAttributes,
  validateRequiredDatapointAttributes,
  validateRunKind,
  validateDirection,
  validateMetricRole,
  validateSourceFormat,
  isValidRunKind,
  isValidDirection,
  isValidMetricRole,
  isValidSourceFormat,
  isMonitorMetric,
} from "./otlp-validation.js";
/** Higher-level projection helpers for specific consumer use cases. */
export {
  extractRunMetrics,
  extractScenarioMetrics,
  extractComparisonMetrics,
  extractResourceContext,
  getMetricTemporality,
  getMetricUnits,
} from "./otlp-projections.js";
/** Compare a current benchmark run against baseline runs to detect regressions. */
export { compare } from "./compare.js";
/** Format a ComparisonResult as markdown for job summaries and PR comments. */
export { formatComparisonMarkdown } from "./format-comparison-markdown.js";
/** Helpers for building and serializing native benchmark results. */
export { defineMetric, defineBenchmark, buildNativeResult, stringifyNativeResult } from "./native-builder.js";
