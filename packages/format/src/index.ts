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
} from "./types.js";

/** Parse benchmark output in any supported format (auto-detect, go, native, benchmark-action). */
export { parse } from "./parse.js";
export type { Format } from "./parse.js";
/** Infer the `direction` ("smaller_is_better" / "bigger_is_better") from a metric unit string. */
export { inferDirection } from "./infer-direction.js";
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
/** Compare a current benchmark run against baseline runs to detect regressions. */
export { compare } from "./compare.js";
/** Format a ComparisonResult as markdown for job summaries and PR comments. */
export { formatComparisonMarkdown } from "./format-comparison-markdown.js";
/** Helpers for building and serializing native benchmark results. */
export { defineMetric, defineBenchmark, buildNativeResult, stringifyNativeResult } from "./native-builder.js";
