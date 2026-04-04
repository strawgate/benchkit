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

export function parseBenchmarkAction(input: string): BenchmarkResult {
  let entries: unknown;
  try {
    entries = JSON.parse(input);
  } catch (e) {
    throw new Error(`[parse-benchmark-action] Invalid JSON: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }

  if (!Array.isArray(entries)) {
    throw new Error(
      "[parse-benchmark-action] Input must be a JSON array of {name, value, unit} objects.",
    );
  }

  const benchmarks: Benchmark[] = entries.map((entry: unknown, index: number) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(
        `[parse-benchmark-action] Entry at index ${index} must be an object.`,
      );
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string") {
      throw new Error(
        `[parse-benchmark-action] Entry at index ${index} must have a string 'name'.`,
      );
    }
    if (typeof e.value !== "number") {
      throw new Error(
        `[parse-benchmark-action] Entry '${e.name}' must have a numeric 'value'.`,
      );
    }
    if (typeof e.unit !== "string") {
      throw new Error(
        `[parse-benchmark-action] Entry '${e.name}' must have a string 'unit'.`,
      );
    }
    const range = parseRange(e.range as string | undefined);
    const metric: Metric = {
      value: e.value,
      unit: e.unit,
      direction: inferDirection(e.unit),
    };
    if (range !== undefined) metric.range = range;

    return {
      name: e.name,
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


