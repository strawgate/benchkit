import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { BenchmarkResult } from "@benchkit/format";
import {
  type ParsedRun,
  sortRuns,
  pruneRuns,
  buildIndex,
  buildSeries,
} from "./aggregate.js";

async function run(): Promise<void> {
  const dataBranch = core.getInput("data-branch") || "bench-data";
  const token = core.getInput("github-token", { required: true });
  const maxRuns = parseInt(core.getInput("max-runs") || "0", 10);

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

  // Fetch and check out data branch
  const worktree = path.join(os.tmpdir(), `benchkit-agg-${Date.now()}`);
  const fetchCode = await exec.exec(
    "git",
    ["fetch", "origin", `${dataBranch}:${dataBranch}`],
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

  const runFiles = fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  core.info(`Found ${runFiles.length} run file(s)`);

  // Parse all runs
  const runs: ParsedRun[] = [];
  for (const file of runFiles) {
    const content = fs.readFileSync(path.join(runsDir, file), "utf-8");
    const result = JSON.parse(content) as BenchmarkResult;
    runs.push({ id: path.basename(file, ".json"), result });
  }

  // Sort by timestamp (oldest first)
  sortRuns(runs);

  // Prune old runs
  const pruned = pruneRuns(runs, maxRuns);
  for (const id of pruned) {
    fs.unlinkSync(path.join(runsDir, `${id}.json`));
    core.info(`Pruned old run: ${id}`);
  }

  // Build index and series
  const index = buildIndex(runs);
  const allMetrics = index.metrics ?? [];
  const seriesMap = buildSeries(runs);

  // Write index
  const dataDir = path.join(worktree, "data");
  fs.writeFileSync(
    path.join(dataDir, "index.json"),
    JSON.stringify(index, null, 2) + "\n",
  );
  core.info(
    `Wrote index.json (${index.runs.length} runs, ${allMetrics.length} metrics)`,
  );

  // Write series files
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
    fs.writeFileSync(
      path.join(seriesDir, fileName),
      JSON.stringify(series, null, 2) + "\n",
    );
    core.info(`Wrote series/${fileName}`);
  }

  // Commit and push if changed
  await exec.exec("git", ["-C", worktree, "add", "."]);
  const diffCode = await exec.exec(
    "git",
    ["-C", worktree, "diff", "--cached", "--quiet"],
    { ignoreReturnCode: true },
  );

  if (diffCode === 0) {
    core.info("No changes to commit");
  } else {
    await exec.exec("git", [
      "-C",
      worktree,
      "commit",
      "-m",
      `bench: rebuild index and series (${runs.length} runs)`,
    ]);
    await exec.exec("git", [
      "-C",
      worktree,
      "push",
      "origin",
      `HEAD:${dataBranch}`,
    ]);
    core.info(`Pushed aggregated data to ${dataBranch}`);
  }

  // Clean up
  await exec.exec("git", ["worktree", "remove", worktree, "--force"]);

  // Outputs
  core.setOutput("run-count", String(runs.length));
  core.setOutput("metrics", allMetrics.join(","));
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
