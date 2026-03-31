export type {
  BenchmarkResult,
  Benchmark,
  Metric,
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
/** Compare a current benchmark run against baseline runs to detect regressions. */
export { compare } from "./compare.js";
