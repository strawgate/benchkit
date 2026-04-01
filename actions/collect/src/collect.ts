/**
 * Core collection logic for the benchkit collect action.
 *
 * Supports two modes:
 *   - json:       read a JSON object (from a URL or local file) and map fields to metrics
 *   - prometheus: scrape a Prometheus /metrics endpoint and extract named metrics
 */

import type { BenchmarkResult, Benchmark, Metric } from "@benchkit/format";

// ── Shared types ─────────────────────────────────────────────────────

/**
 * A single metric mapping for json mode.
 * `field` supports dot-notation paths (e.g. "system.rss_mb").
 */
export interface JsonMetricMapping {
  field: string;
  name: string;
  unit?: string;
  direction?: "bigger_is_better" | "smaller_is_better";
}

/**
 * A single metric request for prometheus mode.
 * `labels` provides per-metric label filtering on top of the global filter.
 */
export interface PrometheusMetricRequest {
  metric: string;
  name: string;
  unit?: string;
  direction?: "bigger_is_better" | "smaller_is_better";
  labels?: Record<string, string>;
}

/** A parsed Prometheus metric line. */
export interface PrometheusEntry {
  name: string;
  labels: Record<string, string>;
  value: number;
}

// ── JSON collection ──────────────────────────────────────────────────

/**
 * Fetch JSON from a URL using Node's built-in fetch.
 * Throws on non-2xx responses or network errors.
 */
export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} fetching ${url}`,
    );
  }
  return response.json() as Promise<unknown>;
}

/**
 * Extract a value from a nested object using dot-notation path.
 * Returns undefined when the path does not exist or the leaf is not a number.
 */
export function getNestedValue(obj: unknown, fieldPath: string): number | undefined {
  const parts = fieldPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "number" ? current : undefined;
}

/**
 * Map JSON fields to benchkit metrics.
 * Throws when a mapped field is missing or not a number.
 */
export function collectFromJson(
  data: unknown,
  mappings: JsonMetricMapping[],
): Record<string, Metric> {
  const metrics: Record<string, Metric> = {};
  for (const m of mappings) {
    const value = getNestedValue(data, m.field);
    if (value === undefined) {
      throw new Error(
        `Field '${m.field}' not found in JSON or is not a number`,
      );
    }
    metrics[m.name] = {
      value,
      ...(m.unit ? { unit: m.unit } : {}),
      ...(m.direction ? { direction: m.direction } : {}),
    };
  }
  return metrics;
}

// ── Prometheus collection ────────────────────────────────────────────

/**
 * Fetch plain-text Prometheus metrics from a URL.
 */
export async function fetchPrometheusText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/plain; version=0.0.4" },
  });
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} scraping ${url}`,
    );
  }
  return response.text();
}

/**
 * Parse Prometheus text exposition format into a flat array of entries.
 * Handles labels and the basic line format; ignores HELP/TYPE comment lines.
 */
export function parsePrometheusText(text: string): PrometheusEntry[] {
  const entries: PrometheusEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    // Lines are:  metric_name[{labels}] value [timestamp]
    // Split into tokens by whitespace.
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;

    // When there are three or more tokens and the last looks like a Unix ms
    // timestamp, treat the second-to-last token as the value.
    let nameAndLabels: string;
    let valueStr: string;
    if (
      tokens.length >= 3 &&
      /^\d{10,}$/.test(tokens[tokens.length - 1]) &&
      /^[0-9.e+-]+$/i.test(tokens[tokens.length - 2])
    ) {
      nameAndLabels = tokens.slice(0, tokens.length - 2).join(" ");
      valueStr = tokens[tokens.length - 2];
    } else {
      nameAndLabels = tokens.slice(0, tokens.length - 1).join(" ");
      valueStr = tokens[tokens.length - 1];
    }

    const value = parseFloat(valueStr);
    if (isNaN(value)) continue;

    const braceOpen = nameAndLabels.indexOf("{");
    if (braceOpen === -1) {
      entries.push({ name: nameAndLabels.trim(), labels: {}, value });
    } else {
      const name = nameAndLabels.slice(0, braceOpen).trim();
      const braceClose = nameAndLabels.lastIndexOf("}");
      const labelsStr = braceClose > braceOpen
        ? nameAndLabels.slice(braceOpen + 1, braceClose)
        : "";
      entries.push({ name, labels: parseLabels(labelsStr), value });
    }
  }
  return entries;
}

/**
 * Parse a Prometheus label string (the content between `{` and `}`).
 * Returns an object of label key-value pairs.
 */
export function parseLabels(labelsStr: string): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!labelsStr.trim()) return labels;

  // Match key="value" pairs, allowing escaped quotes inside values
  const re = /(\w+)="((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(labelsStr)) !== null) {
    labels[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return labels;
}

/**
 * Check whether a Prometheus entry's labels satisfy a required filter.
 * All keys in `filter` must be present with matching values in `entryLabels`.
 */
export function labelsMatch(
  entryLabels: Record<string, string>,
  filter: Record<string, string>,
): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (entryLabels[key] !== value) return false;
  }
  return true;
}

/**
 * Extract benchkit metrics from a parsed Prometheus text scrape.
 *
 * For each request the function finds all entries whose name matches and
 * whose labels satisfy both the global `globalFilter` and the per-request
 * `labels` filter.  When multiple entries match (e.g. different label
 * combinations for a counter), their values are summed.
 *
 * Throws when a requested metric cannot be found after filtering.
 */
export function collectFromPrometheus(
  entries: PrometheusEntry[],
  requests: PrometheusMetricRequest[],
  globalFilter: Record<string, string> = {},
): Record<string, Metric> {
  const metrics: Record<string, Metric> = {};
  for (const req of requests) {
    const combined = { ...globalFilter, ...(req.labels ?? {}) };
    const matching = entries.filter(
      (e) => e.name === req.metric && labelsMatch(e.labels, combined),
    );
    if (matching.length === 0) {
      const filterDesc =
        Object.keys(combined).length > 0
          ? ` with labels ${JSON.stringify(combined)}`
          : "";
      throw new Error(
        `Prometheus metric '${req.metric}'${filterDesc} not found in scrape`,
      );
    }
    const value = matching.reduce((sum, e) => sum + e.value, 0);
    metrics[req.name] = {
      value,
      ...(req.unit ? { unit: req.unit } : {}),
      ...(req.direction ? { direction: req.direction } : {}),
    };
  }
  return metrics;
}

// ── Result assembly ──────────────────────────────────────────────────

/** Build a native BenchmarkResult from a collected metrics map. */
export function buildCollectResult(
  benchmarkName: string,
  metrics: Record<string, Metric>,
  tags: Record<string, string>,
): BenchmarkResult {
  const benchmark: Benchmark = {
    name: benchmarkName,
    metrics,
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
  };
  return {
    benchmarks: [benchmark],
    context: {
      timestamp: new Date().toISOString(),
    },
  };
}
