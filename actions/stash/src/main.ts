import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as glob from "@actions/glob";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildResult, parseBenchmarkFiles, readMonitorOutput } from "./stash.js";
import type { BenchmarkResult } from "@benchkit/format";
import type { Format } from "@benchkit/format";

async function run(): Promise<void> {
  const resultsPattern = core.getInput("results", { required: true });
  const format = (core.getInput("format") || "auto") as Format;
  const dataBranch = core.getInput("data-branch") || "bench-data";
  const token = core.getInput("github-token", { required: true });
  const monitorPath = core.getInput("monitor") || "";
  const saveDataFile = core.getInput("save-data-file") === "true";
  const runId =
    core.getInput("run-id") ||
    `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || "1"}`;

  // Parse benchmark files
  const globber = await glob.create(resultsPattern);
  const files = await globber.glob();
  if (files.length === 0) {
    throw new Error(`No files matched pattern: ${resultsPattern}`);
  }
  core.info(`Found ${files.length} result file(s)`);
  const benchmarks = parseBenchmarkFiles(files, format);

  // Merge monitor output if provided
  const monitorResult = monitorPath ? readMonitorOutput(monitorPath) : undefined;

  const result = buildResult({
    benchmarks,
    monitorResult,
    context: {
      commit: process.env.GITHUB_SHA,
      ref: process.env.GITHUB_REF,
      timestamp: new Date().toISOString(),
      runner: process.env.RUNNER_OS
        ? `${process.env.RUNNER_OS}/${process.env.RUNNER_ARCH}`
        : undefined,
    },
  });

  core.info(`Parsed ${benchmarks.length} benchmark(s)${monitorResult ? ` + ${monitorResult.benchmarks.length} monitor benchmark(s)` : ""}`);

  // Git setup and push
  await configureGit(token);
  const worktree = await checkoutDataBranch(dataBranch);

  const runsDir = path.join(worktree, "data", "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  const resultPath = path.join(runsDir, `${runId}.json`);
  const resultJson = JSON.stringify(result, null, 2) + "\n";
  fs.writeFileSync(resultPath, resultJson);
  core.info(`Wrote ${resultPath}`);

  await exec.exec("git", ["-C", worktree, "add", "."]);
  await exec.exec("git", ["-C", worktree, "commit", "-m", `bench: add run ${runId}`]);
  await pushWithRetry(worktree, dataBranch, 3);
  await exec.exec("git", ["worktree", "remove", worktree, "--force"]);

  core.setOutput("run-id", runId);
  core.setOutput("file-path", `data/runs/${runId}.json`);

  // Upload artifact if requested
  if (saveDataFile) {
    const artifactName = `benchkit-result-${runId}`;
    const tmpFile = path.join(os.tmpdir(), `${runId}.json`);
    fs.writeFileSync(tmpFile, resultJson);
    // Dynamic import required: @actions/artifact v6+ is ESM-only
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { DefaultArtifactClient } = await import("@actions/artifact") as any;
    const artifactClient = new DefaultArtifactClient();
    await artifactClient.uploadArtifact(artifactName, [tmpFile], os.tmpdir());
    fs.unlinkSync(tmpFile);
    core.setOutput("artifact-name", artifactName);
    core.info(`Uploaded artifact: ${artifactName}`);
  }

  // Write job summary
  await writeJobSummary(result, runId);
}

async function writeJobSummary(result: BenchmarkResult, runId: string): Promise<void> {
  const userBenchmarks = result.benchmarks.filter((b) => !b.name.startsWith("_monitor/"));

  if (userBenchmarks.length === 0) {
    return;
  }

  // Collect all metric names across benchmarks (excluding monitor)
  const metricNames = [...new Set(
    userBenchmarks.flatMap((b) => Object.keys(b.metrics)),
  )].sort();

  const header = ["Benchmark", ...metricNames];
  const divider = header.map(() => "---");

  const rows = userBenchmarks.map((bench) => {
    const cells = metricNames.map((metric) => {
      const m = bench.metrics[metric];
      if (!m) return "-";
      const unit = m.unit ? ` ${m.unit}` : "";
      return `${m.value}${unit}`;
    });
    return [bench.name, ...cells];
  });

  const tableRows = [header, divider, ...rows];
  await core.summary
    .addHeading(`Benchmark Results — run ${runId}`)
    .addTable(tableRows)
    .write();
}

// ── Helpers ─────────────────────────────────────────────────────────

async function configureGit(token: string): Promise<void> {
  await exec.exec("git", ["config", "user.name", "github-actions[bot]"]);
  await exec.exec("git", [
    "config", "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com",
  ]);
  const basicAuth = Buffer.from(`x-access-token:${token}`).toString("base64");
  await exec.exec("git", [
    "config", "--local",
    "http.https://github.com/.extraheader",
    `AUTHORIZATION: basic ${basicAuth}`,
  ]);
}

async function checkoutDataBranch(dataBranch: string): Promise<string> {
  const worktree = path.join(os.tmpdir(), `benchkit-stash-${Date.now()}`);
  const fetchCode = await exec.exec(
    "git", ["fetch", "origin", `${dataBranch}:${dataBranch}`],
    { ignoreReturnCode: true },
  );
  if (fetchCode === 0) {
    await exec.exec("git", ["worktree", "add", worktree, dataBranch]);
  } else {
    core.info(`Branch '${dataBranch}' does not exist, creating orphan branch`);
    await exec.exec("git", ["worktree", "add", "--orphan", "-b", dataBranch, worktree]);
  }
  return worktree;
}

async function pushWithRetry(worktree: string, dataBranch: string, maxRetries: number): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const pushCode = await exec.exec(
      "git", ["-C", worktree, "push", "origin", `HEAD:${dataBranch}`],
      { ignoreReturnCode: true },
    );
    if (pushCode === 0) {
      core.info(`Pushed to ${dataBranch}`);
      return;
    }
    if (attempt < maxRetries) {
      core.warning(`Push failed (attempt ${attempt}/${maxRetries}), rebasing and retrying...`);
      await exec.exec("git", ["-C", worktree, "pull", "--rebase", "origin", dataBranch]);
    } else {
      throw new Error(`Failed to push after ${maxRetries} attempts`);
    }
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
