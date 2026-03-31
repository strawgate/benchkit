import * as fs from "node:fs";
import * as path from "node:path";
import { parse, parseNative, type Format, type BenchmarkResult, type Benchmark, type Context, type MonitorContext } from "@benchkit/format";

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
