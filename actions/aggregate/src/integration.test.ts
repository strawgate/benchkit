/**
 * Local integration test: aggregate pipeline.
 *
 * Exercises the aggregate data flow without GitHub or git push:
 * 1. Create BenchmarkResult run files (Go bench, custom, monitor)
 * 2. Aggregate: build index + series
 * 3. Validate all output against JSON schemas
 *
 * Stash logic is tested separately in actions/stash/src/stash.test.ts.
 * The aggregate migration to OTLP input is tracked in issue #252.
 *
 * Run: node --test actions/aggregate/lib/integration.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  type ParsedRun,
  sortRuns,
  buildIndex,
  buildSeries,
} from "./aggregate.js";
import {
  buildRefIndex,
  buildPrIndex,
  buildRunDetail,
  buildMetricSummaryViews,
} from "./views.js";
import type { BenchmarkResult, IndexFile, SeriesFile } from "@benchkit/format";

// ── Schema validation ───────────────────────────────────────────────

const schemaDir = path.resolve(__dirname, "../../../schema");
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validateResult = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(schemaDir, "benchmark-result.schema.json"), "utf-8")),
);
const validateIndex = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(schemaDir, "index.schema.json"), "utf-8")),
);
const validateSeries = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(schemaDir, "series.schema.json"), "utf-8")),
);
const validateRefsIndex = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(schemaDir, "index-refs.schema.json"), "utf-8")),
);
const validatePrsIndex = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(schemaDir, "index-prs.schema.json"), "utf-8")),
);
const validateMetricsIndex = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(schemaDir, "index-metrics.schema.json"), "utf-8")),
);
const validateRunDetail = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(schemaDir, "view-run-detail.schema.json"), "utf-8")),
);

// ── Test fixtures (BenchmarkResult format — aggregate still reads this) ──

const RUN_1_RESULT: BenchmarkResult = {
  benchmarks: [
    {
      name: "BenchmarkSort",
      metrics: {
        ns_per_op: { value: 320, unit: "ns/op", direction: "smaller_is_better" },
        bytes_per_op: { value: 48, unit: "B/op", direction: "smaller_is_better" },
        allocs_per_op: { value: 2, unit: "allocs/op", direction: "smaller_is_better" },
      },
    },
    {
      name: "BenchmarkSearch",
      metrics: {
        ns_per_op: { value: 120, unit: "ns/op", direction: "smaller_is_better" },
        bytes_per_op: { value: 0, unit: "B/op", direction: "smaller_is_better" },
        allocs_per_op: { value: 0, unit: "allocs/op", direction: "smaller_is_better" },
      },
    },
    {
      name: "_monitor/process/go",
      metrics: {
        peak_rss_kb: { value: 52480, unit: "KB", direction: "smaller_is_better" },
        cpu_user_ms: { value: 1200, unit: "ms", direction: "smaller_is_better" },
        wall_clock_ms: { value: 8500, unit: "ms", direction: "smaller_is_better" },
      },
    },
    {
      name: "_monitor/system",
      metrics: {
        cpu_user_pct: { value: 42.5, unit: "%", direction: "smaller_is_better" },
        mem_available_min_mb: { value: 6120, unit: "MB", direction: "bigger_is_better" },
      },
    },
  ],
  context: {
    commit: "aaa1111",
    ref: "refs/heads/main",
    timestamp: "2026-03-30T10:00:00Z",
    runner: "Linux/X64",
    monitor: {
      monitor_version: "0.1.0",
      poll_interval_ms: 250,
      duration_ms: 8500,
      runner_os: "Linux",
      runner_arch: "X64",
      poll_count: 34,
      cpu_model: "AMD EPYC 7763",
      cpu_count: 4,
      total_memory_mb: 16384,
    },
  },
};

const RUN_2_RESULT: BenchmarkResult = {
  benchmarks: [
    {
      name: "BenchmarkSort",
      metrics: {
        ns_per_op: { value: 310, unit: "ns/op", direction: "smaller_is_better" },
        bytes_per_op: { value: 48, unit: "B/op", direction: "smaller_is_better" },
        allocs_per_op: { value: 2, unit: "allocs/op", direction: "smaller_is_better" },
      },
    },
    {
      name: "BenchmarkSearch",
      metrics: {
        ns_per_op: { value: 115, unit: "ns/op", direction: "smaller_is_better" },
        bytes_per_op: { value: 0, unit: "B/op", direction: "smaller_is_better" },
        allocs_per_op: { value: 0, unit: "allocs/op", direction: "smaller_is_better" },
      },
    },
  ],
  context: {
    commit: "bbb2222",
    ref: "refs/heads/main",
    timestamp: "2026-03-31T10:00:00Z",
    runner: "Linux/X64",
  },
};

const RUN_3_RESULT: BenchmarkResult = {
  benchmarks: [
    {
      name: "http-throughput",
      tags: { env: "staging" },
      metrics: {
        requests_per_sec: { value: 15230, unit: "req/s", direction: "bigger_is_better" },
        p99_latency_ms: { value: 12.4, unit: "ms", direction: "smaller_is_better" },
      },
    },
  ],
  context: {
    commit: "ccc3333",
    ref: "refs/heads/main",
    timestamp: "2026-03-31T12:00:00Z",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "benchkit-e2e-"));
}

/**
 * Simulate the aggregate pipeline locally:
 * 1. Write pre-built BenchmarkResult run files to a temp directory
 * 2. Read them back as ParsedRuns
 * 3. Aggregate into index + series
 */
function simulatePipeline(tmpDir: string): {
  runs: ParsedRun[];
  index: IndexFile;
  seriesMap: Map<string, SeriesFile>;
  runsDir: string;
} {
  const runsDir = path.join(tmpDir, "data", "runs");
  fs.mkdirSync(runsDir, { recursive: true });

  // Write run files
  fs.writeFileSync(
    path.join(runsDir, "run-001.json"),
    JSON.stringify(RUN_1_RESULT, null, 2),
  );
  fs.writeFileSync(
    path.join(runsDir, "run-002.json"),
    JSON.stringify(RUN_2_RESULT, null, 2),
  );
  fs.writeFileSync(
    path.join(runsDir, "run-003.json"),
    JSON.stringify(RUN_3_RESULT, null, 2),
  );

  // --- Aggregate ---
  const runFiles = fs.readdirSync(runsDir).filter((f) => f.endsWith(".json")).sort();
  const runs: ParsedRun[] = runFiles.map((file) => ({
    id: path.basename(file, ".json"),
    result: JSON.parse(fs.readFileSync(path.join(runsDir, file), "utf-8")),
  }));
  sortRuns(runs);

  const index = buildIndex(runs);
  const seriesMap = buildSeries(runs);

  return { runs, index, seriesMap, runsDir };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("integration: aggregate pipeline", () => {
  let tmpDir: string;
  let pipeline: ReturnType<typeof simulatePipeline>;

  // Run the pipeline once, reuse across tests
  it("setup: create temp dir and run pipeline", () => {
    tmpDir = createTmpDir();
    pipeline = simulatePipeline(tmpDir);
  });

  // ── Run files ─────────────────────────────────────────────────────

  it("creates 3 run files", () => {
    const files = fs.readdirSync(pipeline.runsDir).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 3);
  });

  it("each run file conforms to benchmark-result schema", () => {
    const files = fs.readdirSync(pipeline.runsDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const content = JSON.parse(
        fs.readFileSync(path.join(pipeline.runsDir, file), "utf-8"),
      );
      const valid = validateResult(content);
      assert.ok(valid, `${file}: ${JSON.stringify(validateResult.errors)}`);
    }
  });

  it("run-001 includes monitor benchmarks", () => {
    const r1 = JSON.parse(
      fs.readFileSync(path.join(pipeline.runsDir, "run-001.json"), "utf-8"),
    ) as BenchmarkResult;
    const monitorBenches = r1.benchmarks.filter((b) => b.name.startsWith("_monitor/"));
    assert.equal(monitorBenches.length, 2, "should have 2 monitor benchmarks");
    assert.ok(r1.context?.monitor, "should have monitor context");
    assert.equal(r1.context?.monitor?.poll_interval_ms, 250);
  });

  it("run-002 has no monitor data", () => {
    const r2 = JSON.parse(
      fs.readFileSync(path.join(pipeline.runsDir, "run-002.json"), "utf-8"),
    ) as BenchmarkResult;
    const monitorBenches = r2.benchmarks.filter((b) => b.name.startsWith("_monitor/"));
    assert.equal(monitorBenches.length, 0);
    assert.equal(r2.context?.monitor, undefined);
  });

  // ── Index ─────────────────────────────────────────────────────────

  it("index contains all 3 runs", () => {
    assert.equal(pipeline.index.runs.length, 3);
  });

  it("index is newest-first", () => {
    const timestamps = pipeline.index.runs.map((r) => r.timestamp);
    assert.ok(timestamps[0] > timestamps[1], "first should be newest");
    assert.ok(timestamps[1] > timestamps[2], "second should be older than first");
  });

  it("index conforms to schema", () => {
    const valid = validateIndex(pipeline.index);
    assert.ok(valid, `index: ${JSON.stringify(validateIndex.errors)}`);
  });

  it("index lists all metrics", () => {
    const metrics = pipeline.index.metrics ?? [];
    assert.ok(metrics.includes("ns_per_op"), "should include ns_per_op");
    assert.ok(metrics.includes("bytes_per_op"), "should include bytes_per_op");
    assert.ok(metrics.includes("allocs_per_op"), "should include allocs_per_op");
    assert.ok(metrics.includes("_monitor/peak_rss_kb"), "should include _monitor/peak_rss_kb from monitor");
    assert.ok(metrics.includes("requests_per_sec"), "should include requests_per_sec from native");
  });

  // ── Series ────────────────────────────────────────────────────────

  it("creates series files for all metrics", () => {
    const metrics = pipeline.index.metrics ?? [];
    for (const metric of metrics) {
      assert.ok(pipeline.seriesMap.has(metric), `missing series for ${metric}`);
    }
  });

  it("all series conform to schema", () => {
    for (const [metric, sf] of pipeline.seriesMap) {
      const valid = validateSeries(sf);
      assert.ok(valid, `series ${metric}: ${JSON.stringify(validateSeries.errors)}`);
    }
  });

  it("ns_per_op series has 2 data points per benchmark (from 2 Go runs)", () => {
    const nsPerOp = pipeline.seriesMap.get("ns_per_op")!;
    assert.equal(nsPerOp.metric, "ns_per_op");
    // BenchmarkSort and BenchmarkSearch from 2 Go runs
    for (const [name, entry] of Object.entries(nsPerOp.series)) {
      assert.equal(entry.points.length, 2, `${name} should have 2 points`);
    }
  });

  it("_monitor/peak_rss_kb series has 1 point (only run-001 had monitor)", () => {
    const peakRss = pipeline.seriesMap.get("_monitor/peak_rss_kb")!;
    assert.equal(peakRss.metric, "_monitor/peak_rss_kb");
    const monitorEntry = Object.values(peakRss.series)[0];
    assert.equal(monitorEntry.points.length, 1);
    assert.equal(monitorEntry.points[0].value, 52480);
  });

  it("requests_per_sec series has 1 point with tags", () => {
    const rps = pipeline.seriesMap.get("requests_per_sec")!;
    const entry = Object.values(rps.series)[0];
    assert.equal(entry.points.length, 1);
    assert.equal(entry.points[0].value, 15230);
    assert.deepEqual(entry.tags, { env: "staging" });
  });

  // ── Cross-format consistency ──────────────────────────────────────

  it("all series keys trace back to benchmark names in run files", () => {
    // Series keys may include tags like "BenchmarkSort [procs=4]",
    // so we check that the base name (before ' [') exists in the runs.
    const runNames = new Set<string>();
    for (const r of pipeline.runs) {
      for (const b of r.result.benchmarks) {
        runNames.add(b.name);
      }
    }
    for (const sf of pipeline.seriesMap.values()) {
      for (const seriesKey of Object.keys(sf.series)) {
        const baseName = seriesKey.includes(" [") ? seriesKey.slice(0, seriesKey.indexOf(" [")) : seriesKey;
        assert.ok(runNames.has(baseName), `series key "${seriesKey}" (base: "${baseName}") not found in any run`);
      }
    }
  });

  // ── Navigation indexes ────────────────────────────────────────────

  it("refs index conforms to schema and contains main branch", () => {
    const refs = buildRefIndex(pipeline.index.runs);
    const valid = validateRefsIndex(refs);
    assert.ok(valid, `refs index: ${JSON.stringify(validateRefsIndex.errors)}`);
    const mainEntry = refs.find((r) => r.ref === "refs/heads/main");
    assert.ok(mainEntry, "should have an entry for refs/heads/main");
    assert.equal(mainEntry.runCount, 3, "all 3 runs are on main");
  });

  it("prs index conforms to schema and is empty (no PR runs)", () => {
    const prs = buildPrIndex(pipeline.index.runs);
    const valid = validatePrsIndex(prs);
    assert.ok(valid, `prs index: ${JSON.stringify(validatePrsIndex.errors)}`);
    assert.equal(prs.length, 0, "no PR runs in this pipeline");
  });

  it("metrics index conforms to schema and contains all metrics", () => {
    const metrics = buildMetricSummaryViews(pipeline.seriesMap);
    const valid = validateMetricsIndex(metrics);
    assert.ok(valid, `metrics index: ${JSON.stringify(validateMetricsIndex.errors)}`);
    const metricNames = metrics.map((m) => m.metric);
    assert.ok(metricNames.includes("ns_per_op"), "should include ns_per_op");
    assert.ok(metricNames.includes("requests_per_sec"), "should include requests_per_sec");
    assert.ok(metricNames.includes("_monitor/peak_rss_kb"), "should include _monitor/peak_rss_kb");
  });

  // ── Run detail views ──────────────────────────────────────────────

  it("run detail view conforms to schema for each run", () => {
    for (const run of pipeline.runs) {
      const detail = buildRunDetail(run.id, pipeline.runs);
      assert.ok(detail, `buildRunDetail returned null for run ${run.id}`);
      const valid = validateRunDetail(detail);
      assert.ok(valid, `run ${run.id} detail: ${JSON.stringify(validateRunDetail.errors)}`);
    }
  });

  it("run-001 detail view includes all benchmark metrics", () => {
    const detail = buildRunDetail("run-001", pipeline.runs);
    assert.ok(detail);
    assert.equal(detail.run.id, "run-001");
    const metricNames = detail.metricSnapshots.map((s) => s.metric);
    assert.ok(metricNames.includes("ns_per_op"), "run-001 detail should include ns_per_op");
    assert.ok(metricNames.includes("_monitor/peak_rss_kb"), "run-001 detail should include monitor metric");
  });

  it("run-003 detail view includes native benchmark metrics", () => {
    const detail = buildRunDetail("run-003", pipeline.runs);
    assert.ok(detail);
    const metricNames = detail.metricSnapshots.map((s) => s.metric);
    assert.ok(metricNames.includes("requests_per_sec"), "run-003 detail should include requests_per_sec");
    assert.ok(metricNames.includes("p99_latency_ms"), "run-003 detail should include p99_latency_ms");
  });

  it("run detail metric snapshots are sorted alphabetically", () => {
    const detail = buildRunDetail("run-001", pipeline.runs);
    assert.ok(detail);
    const metrics = detail.metricSnapshots.map((s) => s.metric);
    const sorted = [...metrics].sort();
    assert.deepEqual(metrics, sorted, "metric snapshots should be sorted alphabetically");
  });

  // ── Cleanup ───────────────────────────────────────────────────────

  it("cleanup: remove temp dir", () => {
    fs.rmSync(tmpDir, { recursive: true });
  });
});
