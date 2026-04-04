import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as glob from "@actions/glob";
import * as path from "node:path";
import * as os from "node:os";
import {
  buildResult,
  buildRunId,
  createTempResultPath,
  formatResultSummaryMarkdown,
  parseBenchmarkFiles,
  readMonitorOutput,
  writeResultFile,
} from "./stash.js";
import type { Format } from "@benchkit/format";
import {
  computeRetryDelayMs,
  DEFAULT_PUSH_RETRY_COUNT,
  sleep,
} from "./retry.js";

async function run(): Promise<void> {
  const resultsPattern = core.getInput("results", { required: true });
  const format = (core.getInput("format") || "auto") as Format;
  const dataBranch = core.getInput("data-branch") || "bench-data";
  const token = core.getInput("github-token", { required: true });
  const monitorPath = core.getInput("monitor") || "";
  const saveDataFile = core.getBooleanInput("save-data-file");
  const writeSummary = core.getBooleanInput("summary");
  const runId = buildRunId({
    customRunId: core.getInput("run-id") || undefined,
    githubRunId: process.env.GITHUB_RUN_ID,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT,
    githubJob: process.env.GITHUB_JOB,
    matrixKey: core.getInput("matrix-key") || undefined,
  });

  // Parse benchmark files
  const globber = await glob.create(resultsPattern);
  const files = await globber.glob();
  if (files.length === 0) {
    throw new Error(`No files matched pattern: ${resultsPattern}`);
  }
  core.info(`Found ${files.length} result file(s)`);
  const benchmarks = parseBenchmarkFiles(files, format);

  // Warn early if nothing was parsed — common mistake (e.g. Go test without -bench flag).
  if (benchmarks.length === 0) {
    core.warning(
      "Parsed 0 benchmarks from the provided file(s). The stash will be saved but contains no benchmark data. " +
      "Check that your benchmark output contains parseable results and that the correct format is specified.",
    );
  }


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

  const tempResultPath = createTempResultPath(runId);
  writeResultFile(result, runId, tempResultPath);
  core.info(`Wrote ${tempResultPath}`);

  if (writeSummary) {
    await core.summary
      .addRaw(formatResultSummaryMarkdown(result, { runId }), true)
      .write();
  }

  let filePathOutput = tempResultPath;

  if (saveDataFile) {
    // Git setup and push
    await configureGit(token);
    const worktree = await checkoutDataBranch(dataBranch);

    const runsDir = path.join(worktree, "data", "runs");
    const resultPath = path.join(runsDir, `${runId}.json`);
    writeResultFile(result, runId, resultPath);
    core.info(`Wrote ${resultPath}`);

    await exec.exec("git", ["-C", worktree, "add", "."]);
    await exec.exec("git", ["-C", worktree, "commit", "-m", `bench: add run ${runId}`]);
    await pushWithRetry(worktree, dataBranch, DEFAULT_PUSH_RETRY_COUNT);
    await exec.exec("git", ["worktree", "remove", worktree, "--force"]);
    filePathOutput = `data/runs/${runId}.json`;
  } else {
    core.info("save-data-file=false; skipping data branch commit");
  }

  core.setOutput("run-id", runId);
  core.setOutput("file-path", filePathOutput);
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
      const delayMs = computeRetryDelayMs(Math.random());
      core.warning(
        `Push failed (attempt ${attempt}/${maxRetries}); waiting ${delayMs}ms before rebasing and retrying...`,
      );
      await sleep(delayMs);
      await exec.exec("git", ["-C", worktree, "pull", "--rebase", "origin", dataBranch]);
    } else {
      throw new Error(`Failed to push after ${maxRetries} attempts`);
    }
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
