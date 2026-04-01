import * as core from "@actions/core";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  fetchJson,
  fetchPrometheusText,
  parsePrometheusText,
  collectFromJson,
  collectFromPrometheus,
  buildCollectResult,
  type JsonMetricMapping,
  type PrometheusMetricRequest,
} from "./collect.js";

async function run(): Promise<void> {
  const mode = core.getInput("mode", { required: true });
  if (mode !== "json" && mode !== "prometheus") {
    throw new Error(`Unknown mode '${mode}'. Expected 'json' or 'prometheus'.`);
  }

  const url = core.getInput("url");
  const file = core.getInput("file");
  const metricsRaw = core.getInput("metrics", { required: true });
  const benchmarkName = core.getInput("benchmark-name") || "workflow";
  const tagsRaw = core.getInput("tags") || "{}";
  const labelFilterRaw = core.getInput("label-filter") || "{}";
  const outputPath = path.resolve(core.getInput("output") || "collect.json");

  const tags = parseJson<Record<string, string>>(tagsRaw, "tags");
  const labelFilter = parseJson<Record<string, string>>(labelFilterRaw, "label-filter");

  let metrics: Record<string, import("@benchkit/format").Metric>;

  if (mode === "json") {
    const mappings = parseJson<JsonMetricMapping[]>(metricsRaw, "metrics");
    if (!url && !file) {
      throw new Error("Either 'url' or 'file' must be provided for json mode.");
    }

    let data: unknown;
    if (url) {
      core.info(`Fetching JSON from: ${url}`);
      data = await fetchJson(url);
    } else {
      const filePath = path.resolve(file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      core.info(`Reading JSON from file: ${filePath}`);
      data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    }

    metrics = collectFromJson(data, mappings);
    core.info(`Collected ${Object.keys(metrics).length} JSON metric(s)`);
  } else {
    // prometheus mode
    const requests = parseJson<PrometheusMetricRequest[]>(metricsRaw, "metrics");
    if (!url) {
      throw new Error("'url' is required for prometheus mode.");
    }
    core.info(`Scraping Prometheus metrics from: ${url}`);
    const text = await fetchPrometheusText(url);
    const entries = parsePrometheusText(text);
    metrics = collectFromPrometheus(entries, requests, labelFilter);
    core.info(`Collected ${Object.keys(metrics).length} Prometheus metric(s)`);
  }

  const result = buildCollectResult(benchmarkName, metrics, tags);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
  core.info(`Result written to: ${outputPath}`);
  core.setOutput("output-file", outputPath);
}

function parseJson<T>(raw: string, inputName: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON for input '${inputName}': ${raw}`);
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
