/** Core types for the benchkit native format. */

export interface BenchmarkResult {
  benchmarks: Benchmark[];
  context?: Context;
}

export interface Benchmark {
  name: string;
  tags?: Record<string, string>;
  metrics: Record<string, Metric>;
  samples?: Sample[];
}

export interface Metric {
  value: number;
  unit?: string;
  direction?: "bigger_is_better" | "smaller_is_better";
  range?: number;
}

export type BenchkitRunKind = "code" | "workflow" | "hybrid";
export type OtlpAggregationTemporality = "unspecified" | "delta" | "cumulative";

export interface OtlpAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
}

export interface OtlpAttribute {
  key: string;
  value?: OtlpAnyValue;
}

export interface OtlpGaugeDataPoint {
  attributes?: OtlpAttribute[];
  startTimeUnixNano?: string;
  timeUnixNano?: string;
  asDouble?: number;
  asInt?: string;
}

export interface OtlpHistogramDataPoint {
  attributes?: OtlpAttribute[];
  startTimeUnixNano?: string;
  timeUnixNano?: string;
  count?: string | number;
  sum?: number;
}

export interface OtlpGaugeMetric {
  dataPoints?: OtlpGaugeDataPoint[];
}

export interface OtlpSumMetric {
  dataPoints?: OtlpGaugeDataPoint[];
  aggregationTemporality?: number;
  isMonotonic?: boolean;
}

export interface OtlpHistogramMetric {
  dataPoints?: OtlpHistogramDataPoint[];
  aggregationTemporality?: number;
}

export interface OtlpMetric {
  name: string;
  description?: string;
  unit?: string;
  gauge?: OtlpGaugeMetric;
  sum?: OtlpSumMetric;
  histogram?: OtlpHistogramMetric;
}

export interface OtlpScopeMetrics {
  metrics?: OtlpMetric[];
}

export interface OtlpResource {
  attributes?: OtlpAttribute[];
}

export interface OtlpResourceMetrics {
  resource?: OtlpResource;
  scopeMetrics?: OtlpScopeMetrics[];
}

export interface OtlpMetricsDocument {
  resourceMetrics: OtlpResourceMetrics[];
}

export interface Sample {
  t: number;
  [metricName: string]: number;
}

export interface MonitorContext {
  monitor_version: string;
  poll_interval_ms: number;
  duration_ms: number;
  runner_os?: string;
  runner_arch?: string;
  poll_count?: number;
  kernel?: string;
  cpu_model?: string;
  cpu_count?: number;
  total_memory_mb?: number;
}

export interface Context {
  commit?: string;
  ref?: string;
  timestamp?: string;
  runner?: string;
  monitor?: MonitorContext;
}

/** Series format — pre-aggregated data produced by bench-aggregate. */

export interface SeriesFile {
  metric: string;
  unit?: string;
  direction?: "bigger_is_better" | "smaller_is_better";
  series: Record<string, SeriesEntry>;
}

export interface SeriesEntry {
  tags?: Record<string, string>;
  points: DataPoint[];
}

export interface DataPoint {
  timestamp: string;
  value: number;
  commit?: string;
  run_id?: string;
  range?: number;
}

/** Index format — run listing on the data branch. */

export interface IndexFile {
  runs: RunEntry[];
  metrics?: string[];
}

export interface RunEntry {
  id: string;
  timestamp: string;
  commit?: string;
  ref?: string;
  benchmarks?: number;
  metrics?: string[];
  monitor?: MonitorContext;
}

/** Comparison types — produced by compare(). */

export type ComparisonStatus = "improved" | "stable" | "regressed";

export interface ComparisonEntry {
  benchmark: string;
  metric: string;
  unit?: string;
  direction: "bigger_is_better" | "smaller_is_better";
  baseline: number;
  current: number;
  percentChange: number;
  status: ComparisonStatus;
}

export interface ComparisonResult {
  entries: ComparisonEntry[];
  hasRegression: boolean;
  warnings?: string[];
}

export interface FormatComparisonMarkdownOptions {
  title?: string;
  currentLabel?: string;
  baselineLabel?: string;
  currentCommit?: string;
  currentRef?: string;
  maxRegressions?: number;
  includeDetails?: boolean;
  footerHref?: string;
}

export interface ThresholdConfig {
  test: "percentage";
  threshold: number;
}

/** View types — produced by the aggregate action for use by frontends. */

export interface RefIndexEntry {
  ref: string;
  latestRunId: string;
  latestTimestamp: string;
  latestCommit?: string;
  runCount: number;
}

export interface PrIndexEntry {
  prNumber: number;
  ref: string;
  latestRunId: string;
  latestTimestamp: string;
  latestCommit?: string;
  runCount: number;
}

export interface RunSnapshotMetric {
  name: string;
  value: number;
  unit?: string;
  direction?: Metric["direction"];
  range?: number;
  tags?: Record<string, string>;
}

export interface RunDetailMetricSnapshot {
  metric: string;
  unit?: string;
  direction?: Metric["direction"];
  values: RunSnapshotMetric[];
}

export interface RunDetailView {
  run: RunEntry;
  metricSnapshots: RunDetailMetricSnapshot[];
}

export interface MetricSummaryEntry {
  metric: string;
  latestSeriesCount: number;
  latestRunId?: string;
  latestTimestamp?: string;
}
