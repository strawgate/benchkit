import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parse,
  parseNative,
  type Format,
  type BenchmarkResult,
  type Benchmark,
  type Context,
  type MonitorContext,
} from "@benchkit/format";

export interface StashContext {
  commit?: string;
  ref?: string;
  timestamp: string;
  runner?: string;
}

export interface BuildResultOptions {
  benchmarks: Benchmark[];
  monitorResult?: BenchmarkResult;
  context: StashContext;
}

export interface SummaryOptions {
  runId: string;
}

/** Assemble a BenchmarkResult from parsed benchmarks, optional monitor data, and CI context. */
export function buildResult(opts: BuildResultOptions): BenchmarkResult {
  const benchmarks = [...opts.benchmarks];
  let monitor: MonitorContext | undefined;

  if (opts.monitorResult) {
    benchmarks.push(...opts.monitorResult.benchmarks);
    monitor = opts.monitorResult.context?.monitor;
  }

  const context: Context = {
    commit: opts.context.commit,
    ref: opts.context.ref,
    timestamp: opts.context.timestamp,
    runner: opts.context.runner || undefined,
    monitor,
  };

  return { benchmarks, context };
}

/** Parse all benchmark files (synchronous file reads). Throws if the list is empty. */
export function parseBenchmarkFiles(files: string[], format: Format): Benchmark[] {
  if (files.length === 0) {
    throw new Error("No benchmark result files provided");
  }
  const benchmarks: Benchmark[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    benchmarks.push(...parseBenchmarks(content, format, file));
  }
  return benchmarks;
}

export function getEmptyBenchmarksWarning(benchmarks: Benchmark[]): string | undefined {
  if (benchmarks.length !== 0) {
    return undefined;
  }
  return (
    "Parsed 0 benchmarks from the provided file(s). The stash will be saved but contains no benchmark data. " +
    "Check that your benchmark output contains parseable results and that the correct format is specified."
  );
}

/**
 * Parse a single benchmark file's content in the given format.
 * Throws a descriptive error including the filename if parsing fails.
 */
export function parseBenchmarks(
  content: string,
  format: Format,
  fileName: string,
): Benchmark[] {
  let result: BenchmarkResult;
  try {
    result = parse(content, format);
  } catch (err) {
    throw new Error(
      `Failed to parse '${path.basename(fileName)}': ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  return result.benchmarks;
}

/** Read and parse a monitor output file. */
export function readMonitorOutput(monitorPath: string): BenchmarkResult {
  if (!fs.existsSync(monitorPath)) {
    throw new Error(`Monitor file not found: ${monitorPath}`);
  }
  const content = fs.readFileSync(monitorPath, "utf-8");
  return parseNative(content);
}

/**
 * Build a collision-resistant run identifier.
 *
 * Priority:
 * 1. `customRunId` — use as-is when explicitly provided.
 * 2. `{githubRunId}-{githubRunAttempt}--{sanitized(githubJob)}` — when a job
 *    name is available, append it (separated by `--`) so that multiple jobs
 *    within the same workflow run do not overwrite each other's raw data.
 * 3. `{githubRunId}-{githubRunAttempt}` — fallback when no job name is set.
 *
 * The job segment is lower-cased and any characters outside `[a-z0-9-]` are
 * replaced with `-`, with consecutive dashes collapsed and leading/trailing
 * dashes stripped.
 */
export function buildRunId(options: {
  customRunId?: string;
  githubRunId?: string;
  githubRunAttempt?: string;
  githubJob?: string;
}): string {
  if (options.customRunId) return options.customRunId;
  const base = `${options.githubRunId ?? "local"}-${options.githubRunAttempt ?? "1"}`;
  if (options.githubJob) {
    const sanitized = options.githubJob
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (sanitized) return `${base}--${sanitized}`;
  }
  return base;
}

export function writeResultFile(result: BenchmarkResult, runId: string, outputPath: string): string {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
  return outputPath;
}

export function createTempResultPath(runId: string): string {
  return path.join(os.tmpdir(), `benchkit-run-${runId}.json`);
}

function isMonitorBenchmark(benchmark: Benchmark): boolean {
  return benchmark.name.startsWith("_monitor/");
}

function formatMetricValue(metric: Benchmark["metrics"][string]): string {
  const parts = [String(metric.value)];
  if (metric.range !== undefined) {
    parts.push(`±${metric.range}`);
  }
  if (metric.unit) {
    parts.push(metric.unit);
  }
  return parts.join(" ");
}

export function formatResultSummaryMarkdown(result: BenchmarkResult, options: SummaryOptions): string {
  const benchmarkRows = result.benchmarks.filter((benchmark) => !isMonitorBenchmark(benchmark));
  const monitorRows = result.benchmarks.filter((benchmark) => isMonitorBenchmark(benchmark));
  const lines: string[] = [
    `## Benchkit Stash`,
    "",
    `Run ID: \`${options.runId}\``,
  ];

  if (result.context?.commit || result.context?.ref) {
    const parts = [
      result.context.commit ? `commit \`${result.context.commit.slice(0, 8)}\`` : "",
      result.context.ref ? `ref \`${result.context.ref}\`` : "",
    ].filter(Boolean);
    lines.push(`Parsed for ${parts.join(" on ")}.`);
  }

  lines.push("");

  if (benchmarkRows.length > 0) {
    lines.push("### Benchmarks");
    lines.push("");
    lines.push("| Benchmark | Metrics |");
    lines.push("| --- | --- |");
    for (const benchmark of benchmarkRows) {
      const metrics = Object.entries(benchmark.metrics)
        .map(([name, metric]) => `\`${name}\`: ${formatMetricValue(metric)}`)
        .join("<br>");
      lines.push(`| \`${benchmark.name}\` | ${metrics} |`);
    }
    lines.push("");
  }

  if (monitorRows.length > 0) {
    lines.push("<details>");
    lines.push("<summary>Monitor metrics</summary>");
    lines.push("");
    lines.push("| Benchmark | Metrics |");
    lines.push("| --- | --- |");
    for (const benchmark of monitorRows) {
      const metrics = Object.entries(benchmark.metrics)
        .map(([name, metric]) => `\`${name}\`: ${formatMetricValue(metric)}`)
        .join("<br>");
      lines.push(`| \`${benchmark.name}\` | ${metrics} |`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  return lines.join("\n");
}
