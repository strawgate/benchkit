import * as fs from "node:fs";
import * as path from "node:path";
import {
  compareRuns as compare,
  formatComparisonMarkdown,
  parseOtlp,
  type OtlpMetricsDocument,
} from "@benchkit/format";

export function parseCurrentRun(files: string[]): OtlpMetricsDocument {
  if (files.length === 0) {
    throw new Error("No benchmark result files provided");
  }

  const allResourceMetrics = files.flatMap((file) => {
    const content = fs.readFileSync(file, "utf-8");
    return parseOtlp(content).resourceMetrics;
  });

  return { resourceMetrics: allResourceMetrics };
}

export function readBaselineRuns(runsDir: string, maxRuns: number): OtlpMetricsDocument[] {
  if (!fs.existsSync(runsDir)) {
    return [];
  }

  const files = fs.readdirSync(runsDir)
    .filter((file) => file.endsWith(".otlp.json"))
    .sort()
    .reverse()
    .slice(0, maxRuns);

  return files.map((file) => {
    const content = fs.readFileSync(path.join(runsDir, file), "utf-8");
    return parseOtlp(content);
  });
}

export interface CompareOptions {
  files: string[];
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
  const current = parseCurrentRun(options.files);
  const baseline = readBaselineRuns(options.runsDir, options.baselineRuns);
  const result = compare(current, baseline, {
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
