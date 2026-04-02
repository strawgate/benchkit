/**
 * OTel Collector start logic.
 *
 * Downloads otelcol-contrib, generates config, spawns the collector
 * as a detached background process, and writes state for the post step.
 */

import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import {
  generateCollectorConfig,
  validateMetricSets,
} from "./otel-config.js";
import type { OtelState } from "./types.js";

const STATE_NAME = ".benchkit-otel.state.json";

function runnerTemp(): string {
  return process.env.RUNNER_TEMP || "/tmp";
}

export function platformArch(): { os: string; arch: string; ext: string } {
  const platform = process.platform;
  const arch = process.arch;

  let os: string;
  if (platform === "linux") os = "linux";
  else if (platform === "darwin") os = "darwin";
  else if (platform === "win32") os = "windows";
  else throw new Error(`Unsupported platform: ${platform}`);

  let otelArch: string;
  if (arch === "x64") otelArch = "amd64";
  else if (arch === "arm64") otelArch = "arm64";
  else throw new Error(`Unsupported architecture: ${arch}`);

  const ext = platform === "win32" ? "zip" : "tar.gz";
  return { os, arch: otelArch, ext };
}

export function downloadUrl(version: string, os: string, arch: string, ext: string): string {
  return (
    `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/` +
    `v${version}/otelcol-contrib_${version}_${os}_${arch}.${ext}`
  );
}

async function ensureCollectorBinary(version: string): Promise<string> {
  const { os, arch, ext } = platformArch();
  const toolName = "otelcol-contrib";

  // Check cache first
  let toolDir = tc.find(toolName, version, arch);
  if (!toolDir) {
    const url = downloadUrl(version, os, arch, ext);
    core.info(`Downloading OTel Collector v${version} from ${url}`);
    const archive = await tc.downloadTool(url);
    const extracted =
      ext === "zip"
        ? await tc.extractZip(archive)
        : await tc.extractTar(archive);
    toolDir = await tc.cacheDir(extracted, toolName, version, arch);
  } else {
    core.info(`OTel Collector v${version} found in tool cache`);
  }

  const binaryName = process.platform === "win32" ? "otelcol-contrib.exe" : "otelcol-contrib";
  const binaryPath = path.join(toolDir, binaryName);
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Collector binary not found at ${binaryPath}`);
  }
  return binaryPath;
}

function resolveRunId(): string {
  const explicit = core.getInput("run-id");
  if (explicit) return explicit;
  const runId = process.env.GITHUB_RUN_ID;
  const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
  if (runId) return `${runId}-${attempt}`;
  return `local-${Date.now()}`;
}

export async function startOtelCollector(): Promise<void> {
  const version = core.getInput("collector-version") || "0.102.0";
  const scrapeInterval = core.getInput("scrape-interval") || "1s";
  const metricSetsRaw = (core.getInput("metric-sets") || "cpu,memory,load,process")
    .split(",");
  const otlpGrpcPort = parseInt(core.getInput("otlp-grpc-port") || "4317", 10);
  const otlpHttpPort = parseInt(core.getInput("otlp-http-port") || "4318", 10);
  const dataBranch = core.getInput("data-branch") || "bench-data";
  const runId = resolveRunId();

  const metricSets = validateMetricSets(metricSetsRaw);

  // Record the runner worker PID (our parent) so the post step can
  // filter process metrics to only runner descendants. This works
  // cross-platform — no /proc required.
  const runnerPpid = metricSets.includes("process")
    ? process.ppid
    : undefined;

  const outputPath = path.join(runnerTemp(), "benchkit-telemetry.otlp.jsonl");
  const configPath = path.join(runnerTemp(), "otelcol-config.yaml");

  // Generate collector config
  const configYaml = generateCollectorConfig({
    scrapeInterval,
    metricSets,
    otlpGrpcPort,
    otlpHttpPort,
    outputPath,
    runId,
    ref: process.env.GITHUB_REF,
    commit: process.env.GITHUB_SHA,
  });
  fs.writeFileSync(configPath, configYaml);
  core.info(`Collector config written to ${configPath}`);

  // Download collector binary
  const binary = await ensureCollectorBinary(version);

  // Spawn collector as detached background process
  const child = spawn(binary, ["--config", configPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  if (!child.pid) {
    throw new Error("Failed to spawn OTel Collector process");
  }

  // Write state for the post step
  const state: OtelState = {
    pid: child.pid,
    configPath,
    outputPath,
    startTime: Date.now(),
    runId,
    dataBranch,
    runnerPpid,
  };
  const statePath = path.join(runnerTemp(), STATE_NAME);
  fs.writeFileSync(statePath, JSON.stringify(state));

  // Save state path for the post step via action state
  core.saveState("otel-state-path", statePath);

  // Set outputs
  if (otlpGrpcPort > 0) {
    core.setOutput("otlp-grpc-endpoint", `localhost:${otlpGrpcPort}`);
  }
  if (otlpHttpPort > 0) {
    core.setOutput("otlp-http-endpoint", `http://localhost:${otlpHttpPort}`);
  }

  core.info(
    `OTel Collector started (PID ${child.pid}, scrape interval ${scrapeInterval})`,
  );
  if (otlpGrpcPort > 0) core.info(`OTLP gRPC endpoint: localhost:${otlpGrpcPort}`);
  if (otlpHttpPort > 0) core.info(`OTLP HTTP endpoint: http://localhost:${otlpHttpPort}`);
}
