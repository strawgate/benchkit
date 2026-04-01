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
}

export interface ThresholdConfig {
  test: "percentage";
  threshold: number;
}
