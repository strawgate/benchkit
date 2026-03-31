import * as fs from "node:fs";
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

/** Parse all benchmark files matching a glob pattern (synchronous file reads). */
export function parseBenchmarkFiles(files: string[], format: Format): Benchmark[] {
  if (files.length === 0) {
    throw new Error("No benchmark result files provided");
  }
  const benchmarks: Benchmark[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const result = parse(content, format);
    benchmarks.push(...result.benchmarks);
  }
  return benchmarks;
}

/** Read and parse a monitor output file. */
export function readMonitorOutput(monitorPath: string): BenchmarkResult {
  if (!fs.existsSync(monitorPath)) {
    throw new Error(`Monitor file not found: ${monitorPath}`);
  }
  const content = fs.readFileSync(monitorPath, "utf-8");
  return parseNative(content);
}
