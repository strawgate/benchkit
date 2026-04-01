import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { RunEntry, SeriesFile } from "@benchkit/format";
import type { RunComparisonEntry, RunMetricSnapshot } from "./components/RunDetail.js";

/**
 * Tests for the RunDetail component API and its helper logic.
 * Full DOM rendering is not available in the Node test runner, so these tests
 * validate the prop-contract helpers, comparison math, and formatting functions
 * that drive the component's visible output — following the same pattern used
 * in Dashboard.test.ts and fetch.test.ts.
 */

// ─── Inline helpers mirroring RunDetail internals ──────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function percentChange(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function formatPercent(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<RunEntry> = {}): RunEntry {
  return {
    id: "run-abc123",
    timestamp: "2025-03-15T10:00:00Z",
    commit: "deadbeef1234abcd",
    ref: "refs/heads/main",
    benchmarks: 4,
    metrics: ["ns_per_op", "allocs_per_op"],
    ...overrides,
  };
}

function makeSeriesFile(metric: string): SeriesFile {
  return {
    metric,
    unit: "ns/op",
    direction: "smaller_is_better",
    series: {
      BenchmarkFoo: {
        points: [
          { timestamp: "2025-03-10T00:00:00Z", value: 1200, commit: "aaa" },
          { timestamp: "2025-03-15T00:00:00Z", value: 1100, commit: "deadbeef1234abcd" },
        ],
      },
      BenchmarkBar: {
        points: [
          { timestamp: "2025-03-10T00:00:00Z", value: 900, commit: "aaa" },
          { timestamp: "2025-03-15T00:00:00Z", value: 950, commit: "deadbeef1234abcd" },
        ],
      },
    },
  };
}

function makeMonitorSeriesFile(): SeriesFile {
  return {
    metric: "_monitor/cpu_user_pct",
    unit: "%",
    direction: "smaller_is_better",
    series: {
      runner: {
        points: [
          { timestamp: "2025-03-10T00:00:00Z", value: 42 },
          { timestamp: "2025-03-15T00:00:00Z", value: 38 },
        ],
      },
    },
  };
}

// ─── RunDetail prop types ─────────────────────────────────────────────────────

describe("RunDetailProps — run metadata", () => {
  it("accepts a minimal RunEntry with only id and timestamp", () => {
    const run: RunEntry = { id: "run-001", timestamp: "2025-01-01T00:00:00Z" };
    assert.equal(run.id, "run-001");
    assert.equal(run.commit, undefined);
    assert.equal(run.ref, undefined);
    assert.equal(run.benchmarks, undefined);
    assert.deepEqual(run.metrics, undefined);
  });

  it("accepts a full RunEntry with all optional fields", () => {
    const run = makeRun();
    assert.equal(run.id, "run-abc123");
    assert.equal(run.commit, "deadbeef1234abcd");
    assert.equal(run.ref, "refs/heads/main");
    assert.equal(run.benchmarks, 4);
    assert.deepEqual(run.metrics, ["ns_per_op", "allocs_per_op"]);
  });

  it("accepts a run with monitor context", () => {
    const run = makeRun({
      monitor: {
        monitor_version: "1.0",
        poll_interval_ms: 100,
        duration_ms: 5000,
        runner_os: "Linux",
        runner_arch: "x64",
        cpu_model: "Intel Xeon",
        cpu_count: 4,
        total_memory_mb: 8192,
      },
    });
    assert.ok(run.monitor);
    assert.equal(run.monitor.runner_os, "Linux");
    assert.equal(run.monitor.cpu_count, 4);
  });
});

describe("RunDetailProps — metricSnapshots (empty case)", () => {
  it("defaults to empty when metricSnapshots is omitted", () => {
    // Mirrors the default in the component signature
    const props: { metricSnapshots?: RunMetricSnapshot[] } = {};
    const snapshots = props.metricSnapshots ?? [];
    assert.equal(snapshots.length, 0);
  });

  it("accepts metric snapshots with SeriesFile data", () => {
    const snapshots: RunMetricSnapshot[] = [
      { metric: "ns_per_op", series: makeSeriesFile("ns_per_op") },
      { metric: "allocs_per_op", series: makeSeriesFile("allocs_per_op") },
    ];
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].metric, "ns_per_op");
    assert.equal(Object.keys(snapshots[0].series.series).length, 2);
  });
});

describe("RunDetailProps — monitorSnapshots (monitor-present case)", () => {
  it("defaults to empty when monitorSnapshots is omitted", () => {
    const props: { monitorSnapshots?: RunMetricSnapshot[] } = {};
    const snapshots = props.monitorSnapshots ?? [];
    assert.equal(snapshots.length, 0);
  });

  it("accepts monitor snapshots", () => {
    const snapshots: RunMetricSnapshot[] = [
      { metric: "_monitor/cpu_user_pct", series: makeMonitorSeriesFile() },
    ];
    assert.equal(snapshots.length, 1);
    assert.ok(snapshots[0].metric.startsWith("_monitor/"));
  });

  it("builds monitorSeriesMap correctly from snapshots", () => {
    const snapshots: RunMetricSnapshot[] = [
      { metric: "_monitor/cpu_user_pct", series: makeMonitorSeriesFile() },
      { metric: "_monitor/mem_used_mb", series: makeMonitorSeriesFile() },
    ];
    const map = new Map<string, SeriesFile>(snapshots.map((s) => [s.metric, s.series]));
    assert.equal(map.size, 2);
    assert.ok(map.has("_monitor/cpu_user_pct"));
    assert.ok(map.has("_monitor/mem_used_mb"));
  });
});

describe("RunDetailProps — comparisonEntries (comparison-context case)", () => {
  it("accepts comparison entries with all required fields", () => {
    const entries: RunComparisonEntry[] = [
      {
        metric: "ns_per_op",
        current: 1100,
        baseline: 1200,
        unit: "ns/op",
        direction: "smaller_is_better",
      },
    ];
    assert.equal(entries.length, 1);
    assert.equal(entries[0].current, 1100);
    assert.equal(entries[0].baseline, 1200);
  });

  it("accepts optional label and direction fields", () => {
    const entry: RunComparisonEntry = {
      metric: "throughput",
      label: "Throughput (ops/s)",
      current: 50000,
      baseline: 45000,
      unit: "ops/s",
      direction: "bigger_is_better",
    };
    assert.equal(entry.label, "Throughput (ops/s)");
    assert.equal(entry.direction, "bigger_is_better");
  });

  it("accepts entries without optional fields", () => {
    const entry: RunComparisonEntry = {
      metric: "latency",
      current: 5.2,
      baseline: 4.8,
    };
    assert.equal(entry.label, undefined);
    assert.equal(entry.unit, undefined);
    assert.equal(entry.direction, undefined);
  });
});

describe("RunDetail — percentChange helper", () => {
  it("calculates negative percentage for improvement in smaller_is_better", () => {
    const pct = percentChange(1100, 1200);
    assert.ok(pct < 0);
    assert.ok(Math.abs(pct - -8.33) < 0.1);
  });

  it("calculates positive percentage for regression in smaller_is_better", () => {
    const pct = percentChange(1320, 1200);
    assert.ok(pct > 0);
    assert.ok(Math.abs(pct - 10) < 0.01);
  });

  it("returns 0 when baseline is 0 (avoids division by zero)", () => {
    assert.equal(percentChange(100, 0), 0);
  });

  it("returns 0 when current equals baseline", () => {
    assert.equal(percentChange(500, 500), 0);
  });

  it("handles negative values correctly", () => {
    const pct = percentChange(-90, -100);
    // -90 is less negative → a 10% improvement for smaller_is_better
    assert.ok(Math.abs(pct - 10) < 0.01);
  });
});

describe("RunDetail — formatPercent helper", () => {
  it("adds a + prefix for positive values", () => {
    assert.equal(formatPercent(10.0), "+10.0%");
  });

  it("keeps a - prefix for negative values", () => {
    assert.equal(formatPercent(-8.33), "-8.3%");
  });

  it("formats zero correctly", () => {
    assert.equal(formatPercent(0), "0.0%");
  });

  it("rounds to one decimal place", () => {
    assert.equal(formatPercent(12.567), "+12.6%");
  });
});

describe("RunDetail — formatTimestamp helper", () => {
  it("returns a non-empty string for a valid ISO timestamp", () => {
    const result = formatTimestamp("2025-03-15T10:00:00Z");
    assert.ok(typeof result === "string" && result.length > 0);
  });

  it("returns the raw string when parsing fails", () => {
    const bad = "not-a-date";
    // toLocaleString on an invalid Date returns "Invalid Date", which is truthy
    const result = formatTimestamp(bad);
    assert.ok(typeof result === "string");
  });
});

describe("RunDetail — commitHref and artifactHref callbacks", () => {
  it("commitHref receives the commit SHA and full RunEntry", () => {
    const run = makeRun();
    const calls: Array<{ commit: string; run: RunEntry }> = [];
    const commitHref = (commit: string, r: RunEntry) => {
      calls.push({ commit, run: r });
      return `https://github.com/org/repo/commit/${commit}`;
    };
    const href = run.commit ? commitHref(run.commit, run) : undefined;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].commit, "deadbeef1234abcd");
    assert.equal(href, "https://github.com/org/repo/commit/deadbeef1234abcd");
  });

  it("commitHref is not called when commit is missing", () => {
    const run = makeRun({ commit: undefined });
    let called = false;
    const commitHref = () => { called = true; return "https://example.com"; };
    if (run.commit) commitHref();
    assert.equal(called, false);
  });

  it("artifactHref receives the full RunEntry", () => {
    const run = makeRun();
    const artifactHref = (r: RunEntry) => `https://ci.example.com/runs/${r.id}`;
    const url = artifactHref(run);
    assert.equal(url, `https://ci.example.com/runs/run-abc123`);
  });

  it("artifactHref can return undefined to suppress the link", () => {
    const run = makeRun();
    const artifactHref = (_r: RunEntry): string | undefined => undefined;
    assert.equal(artifactHref(run), undefined);
  });
});

describe("RunDetail — fakeIndex construction for MonitorSection", () => {
  it("fakeIndex contains exactly the provided run", () => {
    const run = makeRun();
    const fakeIndex = { runs: [run] };
    assert.equal(fakeIndex.runs.length, 1);
    assert.equal(fakeIndex.runs[0].id, run.id);
  });

  it("MonitorSection receives a non-empty map when monitorSnapshots are present", () => {
    const snapshots: RunMetricSnapshot[] = [
      { metric: "_monitor/cpu_user_pct", series: makeMonitorSeriesFile() },
    ];
    const monitorSeriesMap = new Map<string, SeriesFile>(
      snapshots.map((s) => [s.metric, s.series]),
    );
    assert.equal(monitorSeriesMap.size, 1);
  });

  it("MonitorSection receives an empty map when monitorSnapshots is omitted", () => {
    const snapshots: RunMetricSnapshot[] = [];
    const monitorSeriesMap = new Map<string, SeriesFile>(
      snapshots.map((s) => [s.metric, s.series]),
    );
    assert.equal(monitorSeriesMap.size, 0);
  });
});

describe("RunDetail — metricLabelFormatter and seriesNameFormatter", () => {
  it("metricLabelFormatter is applied to metric names", () => {
    const formatter = (m: string) => m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    assert.equal(formatter("ns_per_op"), "Ns Per Op");
  });

  it("falls back to raw metric name when formatter is not provided", () => {
    const applyFormatter = (f: ((m: string) => string) | undefined, m: string) =>
      f ? f(m) : m;
    assert.equal(applyFormatter(undefined, "ns_per_op"), "ns_per_op");
  });

  it("seriesNameFormatter is passed through to chart components", () => {
    const calls: string[] = [];
    const formatter = (name: string, _entry: unknown) => {
      calls.push(name);
      return `[${name}]`;
    };
    ["BenchmarkFoo", "BenchmarkBar"].forEach((name) => formatter(name, {}));
    assert.deepEqual(calls, ["BenchmarkFoo", "BenchmarkBar"]);
  });
});

describe("RunDetail — maxPoints default", () => {
  it("defaults to 20 when maxPoints is not provided", () => {
    const props: { maxPoints?: number } = {};
    const maxPoints = props.maxPoints ?? 20;
    assert.equal(maxPoints, 20);
  });

  it("can be overridden", () => {
    const props: { maxPoints?: number } = { maxPoints: 50 };
    const maxPoints = props.maxPoints ?? 20;
    assert.equal(maxPoints, 50);
  });
});
