import type { BenchmarkResult, Benchmark, Metric } from "./types.js";

/**
 * Parse pytest-benchmark JSON output into BenchmarkResult.
 *
 * Input format (pytest-benchmark --benchmark-json):
 * {
 *   "benchmarks": [
 *     {
 *       "name": "test_sort",
 *       "fullname": "tests/test_perf.py::test_sort",
 *       "stats": {
 *         "min": 0.000123,
 *         "max": 0.000156,
 *         "mean": 0.000134,
 *         "stddev": 0.0000089,
 *         "rounds": 1000,
 *         "median": 0.000132,
 *         "ops": 7462.68
 *       }
 *     }
 *   ]
 * }
 */

interface PytestBenchmarkStats {
  min: number;
  max: number;
  mean: number;
  stddev: number;
  rounds: number;
  median: number;
  ops: number;
}

interface PytestBenchmarkEntry {
  name: string;
  fullname?: string;
  stats: PytestBenchmarkStats;
}

interface PytestBenchmarkOutput {
  benchmarks: PytestBenchmarkEntry[];
}

export function parsePytestBenchmark(input: string): BenchmarkResult {
  const parsed = JSON.parse(input) as PytestBenchmarkOutput;

  if (!parsed.benchmarks || !Array.isArray(parsed.benchmarks)) {
    throw new Error("pytest-benchmark format must have a 'benchmarks' array.");
  }

  const benchmarks: Benchmark[] = parsed.benchmarks.map((entry) => {
    if (typeof entry.name !== "string") {
      throw new Error("Each pytest-benchmark entry must have a 'name' string.");
    }
    if (!entry.stats || typeof entry.stats !== "object") {
      throw new Error(
        `pytest-benchmark entry '${entry.name}' must have a 'stats' object.`,
      );
    }

    const stats = entry.stats;
    const metrics: Record<string, Metric> = {
      mean: {
        value: stats.mean,
        unit: "s",
        direction: "smaller_is_better",
        range: stats.stddev,
      },
      median: {
        value: stats.median,
        unit: "s",
        direction: "smaller_is_better",
      },
      min: {
        value: stats.min,
        unit: "s",
        direction: "smaller_is_better",
      },
      max: {
        value: stats.max,
        unit: "s",
        direction: "smaller_is_better",
      },
      stddev: {
        value: stats.stddev,
        unit: "s",
        direction: "smaller_is_better",
      },
      ops: {
        value: stats.ops,
        unit: "ops/s",
        direction: "bigger_is_better",
      },
      rounds: {
        value: stats.rounds,
        direction: "bigger_is_better",
      },
    };

    return {
      name: entry.name,
      metrics,
    };
  });

  return { benchmarks };
}
