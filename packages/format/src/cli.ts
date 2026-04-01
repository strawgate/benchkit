#!/usr/bin/env node
/**
 * benchkit-native – CLI helper for emitting benchkit native result JSON.
 *
 * Usage:
 *   benchkit-native emit \
 *     --name <benchmark-name> \
 *     [--tag key=value] ... \
 *     --metric name=value[:unit[:direction]] ... \
 *     [--sample t=<secs>[,metricName=value,...]] ... \
 *     [--commit <sha>] [--ref <gitref>] [--timestamp <iso8601>] [--runner <label>] \
 *     [--output <file>] [--append]
 *
 * --metric format:  name=value[:unit[:direction]]
 *   direction is "bigger_is_better" or "smaller_is_better"
 *   Examples:
 *     events_per_sec=13240.5
 *     events_per_sec=13240.5:events/sec
 *     events_per_sec=13240.5:events/sec:bigger_is_better
 *
 * --tag format: key=value
 *
 * --sample format: t=<seconds>[,metricName=value,...]
 *   Example: --sample t=0,events_per_sec=12000 --sample t=1,events_per_sec=13500
 *
 * --append: when --output is given, append the new benchmark entry to an existing file
 *           instead of overwriting it.
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { buildNativeResult } from "./build-native.js";
import { parseNative } from "./parse-native.js";
import type { BenchmarkResult, Metric, Sample } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function die(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

/**
 * Parse a metric specification string.
 * Format: `name=value[:unit[:direction]]`
 */
function parseMetricSpec(spec: string): [string, Metric] {
  const eqIdx = spec.indexOf("=");
  if (eqIdx < 1) {
    die(`--metric must be in the form name=value[:unit[:direction]], got: ${spec}`);
  }
  const name = spec.slice(0, eqIdx);
  const rest = spec.slice(eqIdx + 1);
  const parts = rest.split(":");
  const raw = parts[0];
  const value = Number(raw);
  if (!isFinite(value)) {
    die(`--metric '${name}': value '${raw}' is not a valid number`);
  }

  const metric: Metric = { value };
  if (parts[1]) {
    metric.unit = parts[1];
  }
  if (parts[2]) {
    const dir = parts[2];
    if (dir !== "bigger_is_better" && dir !== "smaller_is_better") {
      die(
        `--metric '${name}': direction must be 'bigger_is_better' or 'smaller_is_better', got '${dir}'`,
      );
    }
    metric.direction = dir;
  }
  return [name, metric];
}

/**
 * Parse a tag specification string.
 * Format: `key=value`
 */
function parseTagSpec(spec: string): [string, string] {
  const eqIdx = spec.indexOf("=");
  if (eqIdx < 1) {
    die(`--tag must be in the form key=value, got: ${spec}`);
  }
  return [spec.slice(0, eqIdx), spec.slice(eqIdx + 1)];
}

/**
 * Parse a sample specification string.
 * Format: `t=<seconds>[,metricName=value,...]`
 */
function parseSampleSpec(spec: string): Sample {
  const raw: Record<string, number> = {};
  const pairs = spec.split(",");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 1) {
      die(`--sample must be in the form t=seconds[,metric=value,...], got pair: ${pair}`);
    }
    const key = pair.slice(0, eqIdx);
    const val = Number(pair.slice(eqIdx + 1));
    if (!isFinite(val)) {
      die(`--sample key '${key}': '${pair.slice(eqIdx + 1)}' is not a valid number`);
    }
    raw[key] = val;
  }
  if (!("t" in raw)) {
    die(`--sample must include a 't' field (seconds since benchmark start), got: ${spec}`);
  }
  return raw as Sample;
}

// ── Subcommand: emit ──────────────────────────────────────────────────────────

function cmdEmit(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      name:      { type: "string" },
      metric:    { type: "string", multiple: true },
      tag:       { type: "string", multiple: true },
      sample:    { type: "string", multiple: true },
      commit:    { type: "string" },
      ref:       { type: "string" },
      timestamp: { type: "string" },
      runner:    { type: "string" },
      output:    { type: "string" },
      append:    { type: "boolean", default: false },
      help:      { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(EMIT_HELP);
    process.exit(0);
  }

  if (!values.name) {
    die("--name is required");
  }
  if (!values.metric || values.metric.length === 0) {
    die("at least one --metric is required");
  }

  // Build metrics map
  const metrics: Record<string, Metric> = {};
  for (const spec of values.metric) {
    const [name, metric] = parseMetricSpec(spec);
    metrics[name] = metric;
  }

  // Build tags map
  const tags: Record<string, string> = {};
  for (const spec of values.tag ?? []) {
    const [k, v] = parseTagSpec(spec);
    tags[k] = v;
  }

  // Build samples array
  const samples = (values.sample ?? []).map(parseSampleSpec);

  // Build context
  const context: Record<string, string> = {};
  if (values.commit)    context["commit"] = values.commit;
  if (values.ref)       context["ref"] = values.ref;
  if (values.timestamp) context["timestamp"] = values.timestamp;
  if (values.runner)    context["runner"] = values.runner;

  // Build the result for this benchmark entry
  const newResult = buildNativeResult({
    benchmarks: [{
      name: values.name,
      ...(Object.keys(tags).length > 0 ? { tags } : {}),
      metrics,
      ...(samples.length > 0 ? { samples } : {}),
    }],
    ...(Object.keys(context).length > 0 ? { context } : {}),
  });

  // Handle append mode
  let finalResult: BenchmarkResult = newResult;
  if (values.append && values.output) {
    let existing: BenchmarkResult;
    try {
      existing = parseNative(readFileSync(values.output, "utf-8"));
    } catch (err) {
      die(`--append: could not read existing file '${values.output}': ${(err as Error).message}`);
    }
    // Merge benchmarks; prefer context from the existing file (first write wins)
    finalResult = {
      benchmarks: [...existing.benchmarks, ...newResult.benchmarks],
      ...(existing.context ? { context: existing.context } : newResult.context ? { context: newResult.context } : {}),
    };
  }

  const json = JSON.stringify(finalResult, null, 2) + "\n";

  if (values.output) {
    writeFileSync(values.output, json, "utf-8");
  } else {
    process.stdout.write(json);
  }
}

// ── Help text ─────────────────────────────────────────────────────────────────

const EMIT_HELP = `\
benchkit-native emit — emit a benchkit native result JSON

Usage:
  benchkit-native emit --name <name> --metric <spec> [options]

Required:
  --name <string>          Benchmark name (e.g. mock-http-ingest)
  --metric <spec>          Metric in the form name=value[:unit[:direction]]
                           Repeat for multiple metrics.
                           direction: bigger_is_better | smaller_is_better

Optional:
  --tag <key=value>        Arbitrary tag dimension. Repeat for multiple tags.
  --sample <spec>          Time-series sample: t=<secs>[,metric=value,...]
                           Repeat for multiple samples.
  --commit <sha>           Git commit SHA for context metadata.
  --ref <gitref>           Git ref (branch/tag) for context metadata.
  --timestamp <iso8601>    ISO 8601 timestamp for context metadata.
  --runner <label>         Runner label or machine description.
  --output <file>          Write JSON to file instead of stdout.
  --append                 Append benchmark to an existing output file
                           instead of overwriting it. Requires --output.
  --help                   Show this help message.

Examples:
  # Throughput metric to stdout
  benchkit-native emit --name http-ingest --metric events_per_sec=13240.5:events/sec:bigger_is_better

  # Latency metric to file
  benchkit-native emit --name http-ingest --metric p95_ms=143.2:ms:smaller_is_better --output result.json

  # Memory metric
  benchkit-native emit --name agent-run --metric service_rss_mb=512.3:mb:smaller_is_better

  # Multi-metric with tags and context
  benchkit-native emit \\
    --name mock-http-ingest \\
    --tag scenario=json-ingest \\
    --metric events_per_sec=13240.5:events/sec:bigger_is_better \\
    --metric p95_batch_ms=143.2:ms:smaller_is_better \\
    --commit abc123 --ref main \\
    --output workflow-bench.json

  # Append a second benchmark to an existing file
  benchkit-native emit --name db-query --metric latency_ms=4.2:ms:smaller_is_better \\
    --output workflow-bench.json --append
`;

const MAIN_HELP = `\
benchkit-native — emit benchkit native result JSON

Usage:
  benchkit-native <command> [options]

Commands:
  emit    Emit a benchmark result entry.

Run 'benchkit-native emit --help' for options.
`;

// ── Entry point ───────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(MAIN_HELP);
    process.exit(0);
  }

  if (cmd === "emit") {
    cmdEmit(args.slice(1));
    return;
  }

  die(`unknown command '${cmd}'. Run 'benchkit-native --help' for usage.`);
}

main();
