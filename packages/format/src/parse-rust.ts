import type { BenchmarkResult, Benchmark, Metric } from "./types.js";

/**
 * Parse Rust cargo bench (libtest) output into native format.
 *
 * Example:
 *   test sort::bench_sort   ... bench:         320 ns/iter (+/- 42)
 */
export function parseRustBench(input: string): BenchmarkResult {
  const benchmarks: Benchmark[] = [];

  const re =
    /^test\s+(?<name>\S+)\s+\.\.\.\s+bench:\s+(?<value>[\d,]+)\s+(?<unit>\S+)(?:\s+\(\+\/-\s+(?<range>[\d,]+)\))?/;

  for (const line of input.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    const m = trimmedLine.match(re);
    if (!m?.groups) continue;

    const { name, value, unit, range } = m.groups;

    const metrics: Record<string, Metric> = {};
    const numericValue = parseFloat(value.replace(/,/g, ""));
    const metric: Metric = {
      value: numericValue,
      unit,
      direction: "smaller_is_better",
    };

    if (range) {
      metric.range = parseFloat(range.replace(/,/g, ""));
    }

    metrics[unitToMetricName(unit)] = metric;

    benchmarks.push({
      name,
      metrics,
    });
  }

  return { benchmarks };
}

function unitToMetricName(unit: string): string {
  if (unit === "ns/iter") return "ns_per_iter";
  return unit.replace(/\//g, "_per_").replace(/\s+/g, "_").toLowerCase();
}
