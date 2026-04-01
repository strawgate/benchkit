import type { ComparisonResult, ComparisonEntry } from "./types.js";

export interface FormatComparisonMarkdownOptions {
  /** Table title shown as a heading. Default: "Benchmark Comparison" */
  title?: string;
}

const STATUS_ICON: Record<ComparisonEntry["status"], string> = {
  improved:  "✅",
  stable:    "➡️",
  regressed: "❌",
};

/**
 * Render a ComparisonResult as a GitHub-flavored markdown table suitable for
 * PR comments or job summaries.
 *
 * Each row shows benchmark name, metric, baseline value, current value,
 * percentage change, and status icon. A summary line below the table calls
 * out regressions or confirms all benchmarks are stable.
 */
export function formatComparisonMarkdown(
  result: ComparisonResult,
  options: FormatComparisonMarkdownOptions = {},
): string {
  const title = options.title ?? "Benchmark Comparison";

  if (result.entries.length === 0) {
    return `## ${title}\n\nNo comparable benchmarks found (no shared benchmark names between current and baseline).\n`;
  }

  const header = "| Benchmark | Metric | Baseline | Current | Change | Status |";
  const divider = "|-----------|--------|----------|---------|--------|--------|";

  const rows = result.entries.map((entry) => {
    const unit = entry.unit ? ` ${entry.unit}` : "";
    const baseline = formatNumber(entry.baseline) + unit;
    const current = formatNumber(entry.current) + unit;
    const change = formatChange(entry.percentChange);
    const icon = STATUS_ICON[entry.status];
    return `| ${entry.benchmark} | ${entry.metric} | ${baseline} | ${current} | ${change} | ${icon} ${entry.status} |`;
  });

  const regressions = result.entries.filter((e) => e.status === "regressed");
  const improvements = result.entries.filter((e) => e.status === "improved");

  let summary: string;
  if (result.hasRegression) {
    const names = regressions.map((e) => `\`${e.benchmark}/${e.metric}\``).join(", ");
    summary = `> ❌ **${regressions.length} regression(s) detected:** ${names}`;
  } else if (improvements.length > 0) {
    summary = `> ✅ No regressions. ${improvements.length} improvement(s) detected.`;
  } else {
    summary = `> ✅ All benchmarks are stable.`;
  }

  return [
    `## ${title}`,
    "",
    header,
    divider,
    ...rows,
    "",
    summary,
    "",
  ].join("\n");
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + "M";
  }
  if (Math.abs(value) >= 1_000) {
    return (value / 1_000).toFixed(2) + "K";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2);
}

function formatChange(percentChange: number): string {
  const sign = percentChange > 0 ? "+" : "";
  return `${sign}${percentChange.toFixed(2)}%`;
}
