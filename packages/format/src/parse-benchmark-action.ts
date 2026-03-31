import type { BenchmarkResult, Benchmark, Metric } from "./types.js";
import { inferDirection } from "./infer-direction.js";

/**
 * benchmark-action/github-action-benchmark compatible format.
 *
 * Input: [{ name, value, unit, range?, extra? }]
 *
 * Each entry becomes one benchmark with one metric called "value".
 * Direction is inferred from the unit string.
 */

interface BenchmarkActionEntry {
  name: string;
  value: number;
  unit: string;
  range?: string;
  extra?: string;
}

export function parseBenchmarkAction(input: string): BenchmarkResult {
  const entries: BenchmarkActionEntry[] = JSON.parse(input);

  if (!Array.isArray(entries)) {
    throw new Error(
      "benchmark-action format must be a JSON array of {name, value, unit} objects.",
    );
  }

  const benchmarks: Benchmark[] = entries.map((entry) => {
    const range = parseRange(entry.range);
    const metric: Metric = {
      value: entry.value,
      unit: entry.unit,
      direction: inferDirection(entry.unit),
    };
    if (range !== undefined) metric.range = range;

    return {
      name: entry.name,
      metrics: { value: metric },
    };
  });

  return { benchmarks };
}

function parseRange(range: string | undefined): number | undefined {
  if (!range) return undefined;
  // Formats: "± 300", "+/- 42.5", "±1.12%"
  const m = range.match(/[±]?\s*\+?\/?-?\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : undefined;
}


