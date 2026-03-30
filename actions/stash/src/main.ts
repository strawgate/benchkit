import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as glob from "@actions/glob";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parse, type Format, type BenchmarkResult } from "@benchkit/format";

async function run(): Promise<void> {
  const resultsPattern = core.getInput("results", { required: true });
  const format = (core.getInput("format") || "auto") as Format;
  const dataBranch = core.getInput("data-branch") || "bench-data";
  const token = core.getInput("github-token", { required: true });
  const runId =
    core.getInput("run-id") ||
    `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || "1"}`;

  // Find result files
  const globber = await glob.create(resultsPattern);
  const files = await globber.glob();
  if (files.length === 0) {
    throw new Error(`No files matched pattern: ${resultsPattern}`);
  }
  core.info(`Found ${files.length} result file(s)`);

  // Parse and merge
  const allBenchmarks: BenchmarkResult["benchmarks"] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const result = parse(content, format);
    allBenchmarks.push(...result.benchmarks);
    core.info(
      `  ${path.basename(file)}: ${result.benchmarks.length} benchmark(s)`,
    );
  }

  const result: BenchmarkResult = {
    benchmarks: allBenchmarks,
    context: {
      commit: process.env.GITHUB_SHA,
      ref: process.env.GITHUB_REF,
      timestamp: new Date().toISOString(),
      runner: process.env.RUNNER_OS
        ? `${process.env.RUNNER_OS}/${process.env.RUNNER_ARCH}`
        : undefined,
    },
  };

  // Configure git
  await exec.exec("git", ["config", "user.name", "github-actions[bot]"]);
  await exec.exec("git", [
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com",
  ]);
  const basicAuth = Buffer.from(`x-access-token:${token}`).toString("base64");
  await exec.exec("git", [
    "config",
    "--local",
    "http.https://github.com/.extraheader",
    `AUTHORIZATION: basic ${basicAuth}`,
  ]);

  // Prepare worktree for data branch
  const worktree = path.join(os.tmpdir(), `benchkit-stash-${Date.now()}`);
  const fetchCode = await exec.exec(
    "git",
    ["fetch", "origin", `${dataBranch}:${dataBranch}`],
    { ignoreReturnCode: true },
  );
  if (fetchCode === 0) {
    await exec.exec("git", ["worktree", "add", worktree, dataBranch]);
  } else {
    core.info(
      `Branch '${dataBranch}' does not exist, creating orphan branch`,
    );
    await exec.exec("git", [
      "worktree",
      "add",
      "--orphan",
      "-b",
      dataBranch,
      worktree,
    ]);
  }

  // Write result
  const runsDir = path.join(worktree, "data", "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  const resultPath = path.join(runsDir, `${runId}.json`);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
  core.info(`Wrote ${resultPath}`);

  // Commit and push with retry
  await exec.exec("git", ["-C", worktree, "add", "."]);
  await exec.exec("git", [
    "-C",
    worktree,
    "commit",
    "-m",
    `bench: add run ${runId}`,
  ]);

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const pushCode = await exec.exec(
      "git",
      ["-C", worktree, "push", "origin", `HEAD:${dataBranch}`],
      { ignoreReturnCode: true },
    );
    if (pushCode === 0) {
      core.info(`Pushed to ${dataBranch}`);
      break;
    }
    if (attempt < MAX_RETRIES) {
      core.warning(
        `Push failed (attempt ${attempt}/${MAX_RETRIES}), rebasing and retrying...`,
      );
      await exec.exec("git", [
        "-C",
        worktree,
        "pull",
        "--rebase",
        "origin",
        dataBranch,
      ]);
    } else {
      throw new Error(`Failed to push after ${MAX_RETRIES} attempts`);
    }
  }

  // Clean up
  await exec.exec("git", ["worktree", "remove", worktree, "--force"]);

  // Outputs
  core.setOutput("run-id", runId);
  core.setOutput("file-path", `data/runs/${runId}.json`);
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
