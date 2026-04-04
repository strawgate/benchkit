import * as fs from "node:fs";
import * as path from "node:path";
import {
  compareRuns,
  formatComparisonMarkdown,
  parseBenchmarks,
  parseNative,
  type BenchmarkResult,
  type Format,
} from "@benchkit/format";

export function parseCurrentRun(files: string[], format: Format): BenchmarkResult {
  if (files.length === 0) {
    throw new Error("No benchmark result files provided");
  }

  const allBenchmarks = files.flatMap((file) => {
    const content = fs.readFileSync(file, "utf-8");
    return parseBenchmarks(content, format).benchmarks;
  });

  return { benchmarks: allBenchmarks };
}

export function readBaselineRuns(runsDir: string, maxRuns: number): BenchmarkResult[] {
  if (!fs.existsSync(runsDir)) {
    return [];
  }

  const files = fs.readdirSync(runsDir)
    .filter((file) => file.endsWith(".json"))
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
  currentCommit?: string;
  currentRef?: string;
}

export interface CompareOutput {
  markdown: string;
  hasRegression: boolean;
}

export function runComparison(options: CompareOptions): CompareOutput {
  const current = parseCurrentRun(options.files, options.format);
  const baseline = readBaselineRuns(options.runsDir, options.baselineRuns);
  const result = compareRuns(current, baseline, {
    test: "percentage",
    threshold: options.threshold,
  });
  const markdown = formatComparisonMarkdown(result, {
    title: options.title ?? "Benchmark Comparison",
    currentCommit: options.currentCommit,
    currentRef: options.currentRef,
  });
  return { markdown, hasRegression: result.hasRegression };
}
