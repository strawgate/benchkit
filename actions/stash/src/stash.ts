import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseBenchmarks as parse,
  parseOtlp,
  benchmarkResultToOtlp,
  otlpAttributesToRecord,
  ATTR_COMMIT,
  ATTR_REF,
  MONITOR_METRIC_PREFIX,
  type Format,
  type Benchmark,
  type OtlpMetricsDocument,
  type OtlpResourceMetrics,
} from "@benchkit/format";

export interface StashContext {
  commit?: string;
  ref?: string;
  timestamp: string;
  runner?: string;
}

export interface BuildResultOptions {
  benchmarks: Benchmark[];
  monitorDoc?: OtlpMetricsDocument;
  runId: string;
  sourceFormat: string;
  context: StashContext;
}

export interface SummaryOptions {
  runId: string;
}

/** Assemble an OtlpMetricsDocument from parsed benchmarks, optional monitor OTLP, and CI context. */
export function buildResult(opts: BuildResultOptions): OtlpMetricsDocument {
  const benchmarkDoc = benchmarkResultToOtlp(
    {
      benchmarks: opts.benchmarks,
      context: {
        commit: opts.context.commit,
        ref: opts.context.ref,
        timestamp: opts.context.timestamp,
        runner: opts.context.runner || undefined,
      },
    },
    {
      runId: opts.runId,
      sourceFormat: opts.sourceFormat,
    },
  );

  const resourceMetrics: OtlpResourceMetrics[] = [
    ...benchmarkDoc.resourceMetrics,
  ];

  if (opts.monitorDoc) {
    resourceMetrics.push(...opts.monitorDoc.resourceMetrics);
  }

  return { resourceMetrics };
}

/** Parse all benchmark files (synchronous file reads). Throws if the list is empty. */
export function parseBenchmarkFiles(files: string[], format: Format): Benchmark[] {
  if (files.length === 0) {
    throw new Error("No benchmark result files provided");
  }
  const benchmarks: Benchmark[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    benchmarks.push(...parseBenchmarks(content, format, file));
  }
  return benchmarks;
}

export function getEmptyBenchmarksWarning(benchmarks: Benchmark[]): string | undefined {
  if (benchmarks.length !== 0) {
    return undefined;
  }
  return (
    "Parsed 0 benchmarks from the provided file(s). The stash will be saved but contains no benchmark data. " +
    "Check that your benchmark output contains parseable results and that the correct format is specified."
  );
}

/**
 * Parse a single benchmark file's content in the given format.
 * Throws a descriptive error including the filename if parsing fails.
 */
export function parseBenchmarks(
  content: string,
  format: Format,
  fileName: string,
): Benchmark[] {
  let result;
  try {
    result = parse(content, format);
  } catch (err) {
    throw new Error(
      `Failed to parse '${path.basename(fileName)}': ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  return result.benchmarks;
}

/**
 * Read and parse a monitor OTLP output file.
 *
 * Accepts both single-document OTLP JSON and newline-delimited OTLP JSONL
 * (one document per line). All resourceMetrics are merged into a single
 * OtlpMetricsDocument.
 */
export function readMonitorOutput(monitorPath: string): OtlpMetricsDocument {
  if (!fs.existsSync(monitorPath)) {
    throw new Error(`Monitor file not found: ${monitorPath}`);
  }
  const content = fs.readFileSync(monitorPath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { resourceMetrics: [] };
  }

  const resourceMetrics: OtlpResourceMetrics[] = [];
  for (const line of lines) {
    const doc = parseOtlp(line);
    resourceMetrics.push(...doc.resourceMetrics);
  }
  return { resourceMetrics };
}

/**
 * Build a collision-resistant run identifier.
 *
 * Priority:
 * 1. `customRunId` — use as-is when explicitly provided.
 * 2. `{githubRunId}-{githubRunAttempt}--{sanitized(githubJob)}` — when a job
 *    name is available, append it (separated by `--`) so that multiple jobs
 *    within the same workflow run do not overwrite each other's raw data.
 * 3. `{githubRunId}-{githubRunAttempt}` — fallback when no job name is set.
 *
 * The job segment is lower-cased and any characters outside `[a-z0-9-]` are
 * replaced with `-`, with consecutive dashes collapsed and leading/trailing
 * dashes stripped.
 */
export function buildRunId(options: {
  customRunId?: string;
  githubRunId?: string;
  githubRunAttempt?: string;
  githubJob?: string;
}): string {
  if (options.customRunId) return options.customRunId;
  const base = `${options.githubRunId ?? "local"}-${options.githubRunAttempt ?? "1"}`;
  if (options.githubJob) {
    const sanitized = options.githubJob
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (sanitized) return `${base}--${sanitized}`;
  }
  return base;
}

export function writeResultFile(result: OtlpMetricsDocument, runId: string, outputPath: string): string {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
  return outputPath;
}

export function createTempResultPath(runId: string): string {
  return path.join(os.tmpdir(), `benchkit-run-${runId}.otlp.json`);
}

// ── Summary helpers ─────────────────────────────────────────────────

interface ScenarioMetricInfo {
  name: string;
  value: number;
  unit?: string;
}

function extractContextFromOtlp(doc: OtlpMetricsDocument): { commit?: string; ref?: string } {
  for (const rm of doc.resourceMetrics) {
    const attrs = otlpAttributesToRecord(rm.resource?.attributes);
    const commit = attrs[ATTR_COMMIT] || undefined;
    const ref = attrs[ATTR_REF] || undefined;
    if (commit || ref) {
      return { commit, ref };
    }
  }
  return {};
}

function groupMetricsByScenario(doc: OtlpMetricsDocument): {
  benchmarkScenarios: Map<string, ScenarioMetricInfo[]>;
  monitorScenarios: Map<string, ScenarioMetricInfo[]>;
} {
  const benchmarkScenarios = new Map<string, ScenarioMetricInfo[]>();
  const monitorScenarios = new Map<string, ScenarioMetricInfo[]>();

  for (const rm of doc.resourceMetrics) {
    for (const sm of rm.scopeMetrics ?? []) {
      for (const metric of sm.metrics ?? []) {
        const isMonitor = metric.name.startsWith(MONITOR_METRIC_PREFIX);
        const target = isMonitor ? monitorScenarios : benchmarkScenarios;

        // Process gauge and sum datapoints
        const gaugeOrSumDPs =
          metric.gauge?.dataPoints ?? metric.sum?.dataPoints ?? [];
        for (const dp of gaugeOrSumDPs) {
          const attrs = otlpAttributesToRecord(dp.attributes);
          const scenario =
            attrs["benchkit.scenario"] ?? attrs["benchkit.series"] ?? "unknown";
          const value =
            dp.asDouble ?? (dp.asInt != null ? Number(dp.asInt) : 0);

          let entries = target.get(scenario);
          if (!entries) {
            entries = [];
            target.set(scenario, entries);
          }
          entries.push({ name: metric.name, value, unit: metric.unit });
        }

        // Process histogram datapoints
        if (metric.histogram?.dataPoints) {
          for (const dp of metric.histogram.dataPoints) {
            const attrs = otlpAttributesToRecord(dp.attributes);
            const scenario =
              attrs["benchkit.scenario"] ??
              attrs["benchkit.series"] ??
              "unknown";

            let entries = target.get(scenario);
            if (!entries) {
              entries = [];
              target.set(scenario, entries);
            }
            if (dp.count !== undefined) {
              entries.push({
                name: `${metric.name}.count`,
                value: Number(dp.count),
                unit: metric.unit,
              });
            }
            if (dp.sum !== undefined) {
              entries.push({
                name: `${metric.name}.sum`,
                value: dp.sum,
                unit: metric.unit,
              });
            }
          }
        }
      }
    }
  }

  return { benchmarkScenarios, monitorScenarios };
}

function formatOtlpMetricValue(metric: ScenarioMetricInfo): string {
  const parts = [String(metric.value)];
  if (metric.unit) {
    parts.push(metric.unit);
  }
  return parts.join(" ");
}

export function formatResultSummaryMarkdown(result: OtlpMetricsDocument, options: SummaryOptions): string {
  const context = extractContextFromOtlp(result);
  const { benchmarkScenarios, monitorScenarios } = groupMetricsByScenario(result);

  const lines: string[] = [
    `## Benchkit Stash`,
    "",
    `Run ID: \`${options.runId}\``,
  ];

  if (context.commit || context.ref) {
    const parts = [
      context.commit ? `commit \`${context.commit.slice(0, 8)}\`` : "",
      context.ref ? `ref \`${context.ref}\`` : "",
    ].filter(Boolean);
    lines.push(`Parsed for ${parts.join(" on ")}.`);
  }

  lines.push("");

  if (benchmarkScenarios.size > 0) {
    lines.push("### Benchmarks");
    lines.push("");
    lines.push("| Benchmark | Metrics |");
    lines.push("| --- | --- |");
    for (const [scenario, metrics] of benchmarkScenarios) {
      const metricStr = metrics
        .map((m) => `\`${m.name}\`: ${formatOtlpMetricValue(m)}`)
        .join("<br>");
      lines.push(`| \`${scenario}\` | ${metricStr} |`);
    }
    lines.push("");
  }

  if (monitorScenarios.size > 0) {
    lines.push("<details>");
    lines.push("<summary>Monitor metrics</summary>");
    lines.push("");
    lines.push("| Benchmark | Metrics |");
    lines.push("| --- | --- |");
    for (const [scenario, metrics] of monitorScenarios) {
      const metricStr = metrics
        .map((m) => `\`${m.name}\`: ${formatOtlpMetricValue(m)}`)
        .join("<br>");
      lines.push(`| \`${scenario}\` | ${metricStr} |`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  return lines.join("\n");
}
