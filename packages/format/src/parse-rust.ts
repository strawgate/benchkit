import type { BenchmarkResult, Benchmark, Metric } from "./types.js";
import { unitToMetricName } from "./parser-utils.js";

/**
 * Parse Rust cargo bench (libtest) output into native format.
 *
 * Example:
 *   test sort::bench_sort   ... bench:         320 ns/iter (+/- 42)
 */
export function parseRustBench(input: string): BenchmarkResult {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("[parse-rust] Input must be a non-empty string.");
  }

  try {
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
      if (isNaN(numericValue)) {
        throw new Error(`Invalid numeric value '${value}' for benchmark '${name}'.`);
      }

      const metric: Metric = {
        value: numericValue,
        unit,
        direction: "smaller_is_better",
      };

      if (range) {
        const numericRange = parseFloat(range.replace(/,/g, ""));
        if (isNaN(numericRange)) {
          throw new Error(`Invalid numeric range '${range}' for benchmark '${name}'.`);
        }
        metric.range = numericRange;
      }

      metrics[unitToMetricName(unit)] = metric;

      benchmarks.push({
        name,
        metrics,
      });
    }

    return { benchmarks };
  } catch (err) {
    throw new Error(
      `[parse-rust] Failed to parse Rust benchmark output: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

