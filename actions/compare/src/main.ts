import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as glob from "@actions/glob";
import * as github from "@actions/github";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runComparison } from "./compare-action.js";
import type { Format } from "@benchkit/format";

async function run(): Promise<void> {
  const resultsPattern = core.getInput("results", { required: true });
  const format = (core.getInput("format") || "auto") as Format;
  const dataBranch = core.getInput("data-branch") || "bench-data";
  const baselineRuns = parseInt(core.getInput("baseline-runs") || "5", 10);
  const threshold = parseFloat(core.getInput("threshold") || "5");
  const failOnRegression = core.getInput("fail-on-regression") === "true";
  const commentOnPr = core.getInput("comment-on-pr") !== "false";
  const token = core.getInput("github-token", { required: true });

  // Resolve current benchmark files
  const globber = await glob.create(resultsPattern);
  const files = await globber.glob();
  if (files.length === 0) {
    throw new Error(`No files matched pattern: ${resultsPattern}`);
  }
  core.info(`Found ${files.length} result file(s)`);

  // Fetch baseline runs from data branch
  const worktree = await fetchDataBranch(dataBranch, token);
  const runsDir = worktree ? path.join(worktree, "data", "runs") : "";

  if (!worktree) {
    core.warning(`Data branch '${dataBranch}' not found. No baseline available — skipping comparison.`);
    core.setOutput("has-regression", "false");
    core.setOutput("summary", "");
    return;
  }

  core.info(`Using baseline from ${dataBranch} (up to ${baselineRuns} runs)`);

  // Run comparison
  const { markdown, hasRegression } = runComparison({
    files,
    format,
    runsDir,
    baselineRuns,
    threshold,
  });

  // Clean up worktree
  await exec.exec("git", ["worktree", "remove", worktree, "--force"]);

  core.setOutput("has-regression", String(hasRegression));
  core.setOutput("summary", markdown);

  // Write job summary
  await core.summary.addRaw(markdown).write();

  // Post PR comment
  if (commentOnPr && github.context.payload.pull_request) {
    await postPrComment(token, markdown);
  } else if (commentOnPr) {
    core.info("Not a pull request event — skipping PR comment.");
  }

  if (failOnRegression && hasRegression) {
    core.setFailed("Benchmark regression detected. See job summary for details.");
  }
}

async function fetchDataBranch(dataBranch: string, token: string): Promise<string | null> {
  const basicAuth = Buffer.from(`x-access-token:${token}`).toString("base64");
  await exec.exec("git", [
    "config", "--local",
    "http.https://github.com/.extraheader",
    `AUTHORIZATION: basic ${basicAuth}`,
  ]);

  const worktree = path.join(os.tmpdir(), `benchkit-compare-${Date.now()}`);
  const fetchCode = await exec.exec(
    "git", ["fetch", "origin", `${dataBranch}:${dataBranch}`],
    { ignoreReturnCode: true },
  );
  if (fetchCode !== 0) {
    return null;
  }
  await exec.exec("git", ["worktree", "add", worktree, dataBranch]);
  return worktree;
}

async function postPrComment(token: string, body: string): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const pullNumber = github.context.payload.pull_request!.number;

  // Find and update an existing benchkit comment, or create a new one
  const marker = "<!-- benchkit-compare -->";
  const commentBody = `${marker}\n${body}`;

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullNumber,
  });

  const existing = comments.find((c) => c.body?.includes(marker));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: commentBody,
    });
    core.info(`Updated existing PR comment #${existing.id}`);
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: commentBody,
    });
    core.info("Created new PR comment");
  }
}

// Workaround: ncc needs a non-empty dist dir check at startup — keep fs imported
void fs.existsSync;

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
