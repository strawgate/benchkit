import type { BenchmarkResult, Benchmark, Metric } from "./types.js";
import { inferDirection } from "./infer-direction.js";

/**
 * Parse Go benchmark text output into native format.
 *
 * Handles the standard format:
 *   BenchmarkName-8   N   value unit [value unit ...]
 *
 * Multiple value/unit pairs per line produce multiple metrics per benchmark.
 * The -P suffix is extracted as a "procs" tag.
 */
export function parseGoBench(input: string): BenchmarkResult {
  const benchmarks: Benchmark[] = [];

  const re =
    /^(?<name>Benchmark\w[\w/()$%^&*=|,[\]{}"#]*?)(?:-(?<procs>\d+))?\s+(?<iters>\d+)\s+(?<rest>.+)$/;

  for (const line of input.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m?.groups) continue;

    const { name, procs, iters: _iters, rest } = m.groups;
    const tags: Record<string, string> = {};
    if (procs) tags.procs = procs;

    const pieces = rest.trim().split(/\s+/);
    const metrics: Record<string, Metric> = {};

    // Pieces come in (value, unit) pairs
    for (let i = 0; i + 1 < pieces.length; i += 2) {
      const value = parseFloat(pieces[i]);
      const unit = pieces[i + 1];
      if (isNaN(value)) continue;

      const metricName = unitToMetricName(unit);
      metrics[metricName] = {
        value,
        unit,
        direction: inferDirection(unit),
      };
    }

    if (Object.keys(metrics).length > 0) {
      benchmarks.push({
        name,
        tags: Object.keys(tags).length > 0 ? tags : undefined,
        metrics,
      });
    }
  }

  return { benchmarks };
}

function unitToMetricName(unit: string): string {
  // "ns/op" -> "ns_per_op", "B/op" -> "bytes_per_op", "allocs/op" -> "allocs_per_op"
  const aliases: Record<string, string> = {
    "B/op": "bytes_per_op",
    "MB/s": "mb_per_s",
  };
  if (aliases[unit]) return aliases[unit];
  return unit.replace(/\//g, "_per_").replace(/\s+/g, "_").toLowerCase();
}


