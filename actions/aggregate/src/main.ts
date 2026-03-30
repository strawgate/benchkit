import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type {
  BenchmarkResult,
  IndexFile,
  RunEntry,
  SeriesFile,
  DataPoint,
} from "@benchkit/format";

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
  interface ParsedRun {
    id: string;
    result: BenchmarkResult;
  }
  const runs: ParsedRun[] = [];
  for (const file of runFiles) {
    const content = fs.readFileSync(path.join(runsDir, file), "utf-8");
    const result = JSON.parse(content) as BenchmarkResult;
    runs.push({ id: path.basename(file, ".json"), result });
  }

  // Sort by timestamp (oldest first)
  runs.sort((a, b) => {
    const ta = a.result.context?.timestamp ?? "";
    const tb = b.result.context?.timestamp ?? "";
    return ta.localeCompare(tb);
  });

  // Prune old runs
  if (maxRuns > 0 && runs.length > maxRuns) {
    const toRemove = runs.splice(0, runs.length - maxRuns);
    for (const r of toRemove) {
      fs.unlinkSync(path.join(runsDir, `${r.id}.json`));
      core.info(`Pruned old run: ${r.id}`);
    }
  }

  // Collect metrics and build index
  const allMetrics = new Set<string>();
  const indexRuns: RunEntry[] = runs.map((r) => {
    const metricNames = new Set<string>();
    const benchNames = new Set<string>();
    for (const b of r.result.benchmarks) {
      benchNames.add(b.name);
      for (const m of Object.keys(b.metrics)) {
        metricNames.add(m);
        allMetrics.add(m);
      }
    }
    return {
      id: r.id,
      timestamp: r.result.context?.timestamp ?? new Date().toISOString(),
      commit: r.result.context?.commit,
      ref: r.result.context?.ref,
      benchmarks: benchNames.size,
      metrics: Array.from(metricNames).sort(),
    };
  });

  const index: IndexFile = {
    runs: [...indexRuns].reverse(), // newest first
    metrics: Array.from(allMetrics).sort(),
  };

  // Build series files per metric
  // When a run has multiple benchmarks with the same name (e.g. -count=N),
  // average their values and compute range from the spread.
  const seriesMap = new Map<string, SeriesFile>();
  for (const r of runs) {
    // Group benchmarks by (name + tags) within this run
    const groups = new Map<
      string,
      { name: string; tags?: Record<string, string>; values: Map<string, { sum: number; count: number; min: number; max: number; unit?: string; direction?: "bigger_is_better" | "smaller_is_better" }> }
    >();

    for (const bench of r.result.benchmarks) {
      const tagsStr = bench.tags
        ? Object.entries(bench.tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(",")
        : "";
      const groupKey = tagsStr ? `${bench.name} [${tagsStr}]` : bench.name;

      let group = groups.get(groupKey);
      if (!group) {
        group = { name: bench.name, tags: bench.tags, values: new Map() };
        groups.set(groupKey, group);
      }

      for (const [metricName, metric] of Object.entries(bench.metrics)) {
        let agg = group.values.get(metricName);
        if (!agg) {
          agg = { sum: 0, count: 0, min: Infinity, max: -Infinity, unit: metric.unit, direction: metric.direction };
          group.values.set(metricName, agg);
        }
        agg.sum += metric.value;
        agg.count++;
        agg.min = Math.min(agg.min, metric.value);
        agg.max = Math.max(agg.max, metric.value);
      }
    }

    // Now emit one point per (seriesKey, metric) per run
    for (const [seriesKey, group] of groups) {
      for (const [metricName, agg] of group.values) {
        let series = seriesMap.get(metricName);
        if (!series) {
          series = {
            metric: metricName,
            unit: agg.unit,
            direction: agg.direction,
            series: {},
          };
          seriesMap.set(metricName, series);
        }

        if (!series.series[seriesKey]) {
          series.series[seriesKey] = { tags: group.tags, points: [] };
        }

        const avg = agg.sum / agg.count;
        const range = agg.count > 1 ? agg.max - agg.min : undefined;
        const point: DataPoint = {
          timestamp: r.result.context?.timestamp ?? new Date().toISOString(),
          value: Math.round(avg * 100) / 100,
          commit: r.result.context?.commit,
          run_id: r.id,
          range: range != null ? Math.round(range * 100) / 100 : undefined,
        };
        series.series[seriesKey].points.push(point);
      }
    }
  }

  // Write index
  const dataDir = path.join(worktree, "data");
  fs.writeFileSync(
    path.join(dataDir, "index.json"),
    JSON.stringify(index, null, 2) + "\n",
  );
  core.info(
    `Wrote index.json (${index.runs.length} runs, ${allMetrics.size} metrics)`,
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
  core.setOutput("metrics", Array.from(allMetrics).sort().join(","));
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
