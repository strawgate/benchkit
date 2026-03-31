import type { BenchmarkResult } from "./types.js";
import { parseGoBench } from "./parse-go.js";
import { parseRustBench } from "./parse-rust.js";
import { parseBenchmarkAction } from "./parse-benchmark-action.js";
import { parseNative } from "./parse-native.js";

export type Format = "native" | "go" | "benchmark-action" | "rust" | "auto";

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
    case "rust":
      return parseRustBench(input);
    case "benchmark-action":
      return parseBenchmarkAction(input);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

/**
 * Auto-detect format from content.
 *
 * - If it parses as JSON with a "benchmarks" key → native
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

  // Check for Rust benchmark lines
  if (/^test\s+\S+\s+\.\.\.\s+bench:/m.test(trimmed)) {
    return "rust";
  }

  throw new Error(
    "Could not auto-detect format. Use the 'format' option to specify one of: native, go, rust, benchmark-action.",
  );
}
