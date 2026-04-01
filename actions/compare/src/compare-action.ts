import * as fs from "node:fs";
import * as path from "node:path";
import {
  parse,
  parseNative,
  compare,
  formatComparisonMarkdown,
  type Format,
  type BenchmarkResult,
} from "@benchkit/format";

/**
 * Read and parse benchmark files matching the given list of paths.
 * All benchmarks are concatenated into a single BenchmarkResult.
 */
export function parseCurrentRun(files: string[], format: Format): BenchmarkResult {
  if (files.length === 0) {
    throw new Error("No benchmark result files provided");
  }
  const allBenchmarks = files.flatMap((file) => {
    const content = fs.readFileSync(file, "utf-8");
    return parse(content, format).benchmarks;
  });
  return { benchmarks: allBenchmarks };
}

/**
 * Read up to `maxRuns` most-recent BenchmarkResult JSON files from a runs directory,
 * sorted newest-first by filename (run IDs embed GITHUB_RUN_ID which is monotonically
 * increasing, so lexicographic sort is a reliable proxy for recency).
 */
export function readBaselineRuns(runsDir: string, maxRuns: number): BenchmarkResult[] {
  if (!fs.existsSync(runsDir)) {
    return [];
  }
  const files = fs.readdirSync(runsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, maxRuns);

  return files.map((file) => {
    const content = fs.readFileSync(path.join(runsDir, file), "utf-8");
    return parseNative(content);
  });
}

export interface CompareOptions {
  files: string[];
  format: Format;
  runsDir: string;
  baselineRuns: number;
  threshold: number;
  title?: string;
}

export interface CompareOutput {
  markdown: string;
  hasRegression: boolean;
}

/** Parse current results, load baseline, run comparison, and format markdown. */
export function runComparison(opts: CompareOptions): CompareOutput {
  const current = parseCurrentRun(opts.files, opts.format);
  const baseline = readBaselineRuns(opts.runsDir, opts.baselineRuns);
  const result = compare(current, baseline, { test: "percentage", threshold: opts.threshold });
  const markdown = formatComparisonMarkdown(result, { title: opts.title ?? "Benchmark Comparison" });
  return { markdown, hasRegression: result.hasRegression };
}
