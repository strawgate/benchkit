import type { BenchmarkResult } from "./types.js";
import { parseGoBench } from "./parse-go.js";
import { parseBenchmarkAction } from "./parse-benchmark-action.js";
import { parseNative } from "./parse-native.js";
import { parseHyperfine } from "./parse-hyperfine.js";

export type Format = "native" | "go" | "benchmark-action" | "hyperfine" | "auto";

/**
 * Detect the input format and parse into the native BenchmarkResult.
 */
export function parse(input: string, format: Format = "auto"): BenchmarkResult {
  if (format === "auto") {
    format = detectFormat(input);
  }

  switch (format) {
    case "native":
      return parseNative(input);
    case "go":
      return parseGoBench(input);
    case "benchmark-action":
      return parseBenchmarkAction(input);
    case "hyperfine":
      return parseHyperfine(input);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

/**
 * Auto-detect format from content.
 *
 * - If it parses as JSON with a "benchmarks" key → native
 * - If it parses as JSON with a "results" key containing objects with "command" → hyperfine
 * - If it parses as a JSON array of objects with "name"/"value"/"unit" → benchmark-action
 * - If it contains lines matching "Benchmark...\s+\d+" → go
 * - Otherwise → error
 */
function detectFormat(input: string): Exclude<Format, "auto"> {
  const trimmed = input.trim();

  // Try JSON first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);

      if (parsed.benchmarks && Array.isArray(parsed.benchmarks)) {
        return "native";
      }

      if (
        parsed.results &&
        Array.isArray(parsed.results) &&
        parsed.results.length > 0 &&
        typeof parsed.results[0].command === "string"
      ) {
        return "hyperfine";
      }

      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        typeof parsed[0].name === "string" &&
        typeof parsed[0].value === "number"
      ) {
        return "benchmark-action";
      }
    } catch {
      // Not valid JSON, fall through
    }
  }

  // Check for Go benchmark lines
  if (/^Benchmark\w.*\s+\d+\s+[\d.]+\s+\w+\/\w+/m.test(trimmed)) {
    return "go";
  }

  throw new Error(
    "Could not auto-detect format. Use the 'format' option to specify one of: native, go, benchmark-action, hyperfine.",
  );
}
