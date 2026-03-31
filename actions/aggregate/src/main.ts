import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  sortRuns,
  pruneRuns,
  buildIndex,
  buildSeries,
  readRuns,
} from "./aggregate.js";

async function run(): Promise<void> {
  const dataBranch = core.getInput("data-branch") || "bench-data";
  const token = core.getInput("github-token", { required: true });
  const maxRuns = parseInt(core.getInput("max-runs") || "0", 10);
  if (maxRuns < 0 || maxRuns > 10_000) {
    throw new Error(`max-runs must be between 0 and 10000, got ${maxRuns}`);
  }

  await configureGit(token);

  // Fetch data branch
  const worktree = path.join(os.tmpdir(), `benchkit-agg-${Date.now()}`);
  const fetchCode = await exec.exec(
    "git", ["fetch", "origin", `${dataBranch}:${dataBranch}`],
    { ignoreReturnCode: true },
  );
  if (fetchCode !== 0) {
    core.warning(`Branch '${dataBranch}' does not exist. Nothing to aggregate.`);
    core.setOutput("run-count", "0");
    core.setOutput("metrics", "");
    return;
  }
  await exec.exec("git", ["worktree", "add", worktree, dataBranch]);

  // Read run files
  const runsDir = path.join(worktree, "data", "runs");
  if (!fs.existsSync(runsDir)) {
    core.warning("No runs directory found. Nothing to aggregate.");
    core.setOutput("run-count", "0");
    core.setOutput("metrics", "");
    await exec.exec("git", ["worktree", "remove", worktree, "--force"]);
    return;
  }

  const runs = readRuns(runsDir);
  core.info(`Found ${runs.length} run file(s)`);

  // Sort, prune, aggregate
  sortRuns(runs);
  const pruned = pruneRuns(runs, maxRuns);
  for (const id of pruned) {
    fs.unlinkSync(path.join(runsDir, `${id}.json`));
    core.info(`Pruned old run: ${id}`);
  }

  const index = buildIndex(runs);
  const allMetrics = index.metrics ?? [];
  const seriesMap = buildSeries(runs);

  // Write output files
  writeAggregatedFiles(worktree, index, seriesMap);
  core.info(`Wrote index.json (${index.runs.length} runs, ${allMetrics.length} metrics)`);

  // Commit and push if changed
  await exec.exec("git", ["-C", worktree, "add", "."]);
  const diffCode = await exec.exec(
    "git", ["-C", worktree, "diff", "--cached", "--quiet"],
    { ignoreReturnCode: true },
  );

  if (diffCode === 0) {
    core.info("No changes to commit");
  } else {
    await exec.exec("git", [
      "-C", worktree, "commit", "-m",
      `bench: rebuild index and series (${runs.length} runs)`,
    ]);
    await exec.exec("git", ["-C", worktree, "push", "origin", `HEAD:${dataBranch}`]);
    core.info(`Pushed aggregated data to ${dataBranch}`);
  }

  await exec.exec("git", ["worktree", "remove", worktree, "--force"]);
  core.setOutput("run-count", String(runs.length));
  core.setOutput("metrics", allMetrics.join(","));
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

function writeAggregatedFiles(
  worktree: string,
  index: ReturnType<typeof buildIndex>,
  seriesMap: ReturnType<typeof buildSeries>,
): void {
  const dataDir = path.join(worktree, "data");
  fs.writeFileSync(path.join(dataDir, "index.json"), JSON.stringify(index, null, 2) + "\n");

  const seriesDir = path.join(dataDir, "series");
  fs.mkdirSync(seriesDir, { recursive: true });

  // Remove stale series files
  if (fs.existsSync(seriesDir)) {
    for (const f of fs.readdirSync(seriesDir)) {
      fs.unlinkSync(path.join(seriesDir, f));
    }
  }

  for (const [metricName, series] of seriesMap) {
    const fileName = `${metricName}.json`;
    fs.writeFileSync(path.join(seriesDir, fileName), JSON.stringify(series, null, 2) + "\n");
    core.info(`Wrote series/${fileName}`);
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
