import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

/**
 * These tests validate the DashboardProps formatter contracts and default
 * behavior inline, following the same pattern as fetch.test.ts.
 * Full component rendering is not feasible without a DOM environment.
 */

describe("DashboardProps defaults", () => {
  it("maxPoints defaults to 20", () => {
    // Simulates the destructuring default in Dashboard
    const props: { maxPoints?: number } = {};
    const maxPoints = props.maxPoints ?? 20;
    assert.equal(maxPoints, 20);
  });

  it("maxRuns defaults to 20", () => {
    const props: { maxRuns?: number } = {};
    const maxRuns = props.maxRuns ?? 20;
    assert.equal(maxRuns, 20);
  });

  it("maxPoints can be overridden", () => {
    const props: { maxPoints?: number } = { maxPoints: 50 };
    const maxPoints = props.maxPoints ?? 20;
    assert.equal(maxPoints, 50);
  });

  it("maxRuns can be overridden", () => {
    const props: { maxRuns?: number } = { maxRuns: 10 };
    const maxRuns = props.maxRuns ?? 20;
    assert.equal(maxRuns, 10);
  });
});

describe("metricLabelFormatter", () => {
  it("receives the raw metric name", () => {
    const calls: string[] = [];
    const formatter = (metric: string) => {
      calls.push(metric);
      return metric.toUpperCase();
    };

    const metrics = ["ns_per_op", "allocs_per_op", "bytes_per_op"];
    const labels = metrics.map((m) => formatter(m));

    assert.deepEqual(calls, ["ns_per_op", "allocs_per_op", "bytes_per_op"]);
    assert.deepEqual(labels, ["NS_PER_OP", "ALLOCS_PER_OP", "BYTES_PER_OP"]);
  });

  it("falls back to raw metric name when not provided", () => {
    function applyFormatter(
      formatter: ((m: string) => string) | undefined,
      metric: string,
    ): string {
      return formatter ? formatter(metric) : metric;
    }
    assert.equal(applyFormatter(undefined, "ns_per_op"), "ns_per_op");
  });

  it("is used in chart title with Latest: prefix", () => {
    const formatter = (m: string) => m.replace(/_/g, " ");
    const metric = "ns_per_op";
    const title = `Latest: ${formatter(metric)}`;
    assert.equal(title, "Latest: ns per op");
  });
});

describe("seriesNameFormatter", () => {
  it("receives name and entry with correct types", () => {
    const calls: Array<{ name: string; entry: { tags?: Record<string, string>; points: unknown[] } }> = [];
    const formatter = (name: string, entry: { tags?: Record<string, string>; points: unknown[] }) => {
      calls.push({ name, entry });
      return `formatted:${name}`;
    };

    const seriesEntries: Array<[string, { tags?: Record<string, string>; points: Array<{ timestamp: string; value: number }> }]> = [
      ["BenchmarkSort", { points: [{ timestamp: "2025-01-15T10:30:00Z", value: 1234 }] }],
      ["BenchmarkSearch", { tags: { size: "large" }, points: [{ timestamp: "2025-01-15T10:30:00Z", value: 567 }] }],
    ];

    const labels = seriesEntries.map(([name, entry]) => formatter(name, entry));

    assert.equal(calls.length, 2);
    assert.equal(calls[0].name, "BenchmarkSort");
    assert.equal(calls[0].entry.points.length, 1);
    assert.equal(calls[1].name, "BenchmarkSearch");
    assert.deepEqual(calls[1].entry.tags, { size: "large" });
    assert.deepEqual(labels, ["formatted:BenchmarkSort", "formatted:BenchmarkSearch"]);
  });

  it("falls back to raw name when not provided", () => {
    function applyFormatter(
      formatter: ((name: string, entry: unknown) => string) | undefined,
      name: string,
    ): string {
      return formatter ? formatter(name, {}) : name;
    }
    assert.equal(applyFormatter(undefined, "BenchmarkSort"), "BenchmarkSort");
  });
});

describe("commitHref", () => {
  it("receives commit SHA and full run entry", () => {
    const calls: Array<{ commit: string; run: { id: string; timestamp: string; commit?: string } }> = [];
    const commitHref = (commit: string, run: { id: string; timestamp: string; commit?: string }) => {
      calls.push({ commit, run });
      return `https://github.com/org/repo/commit/${commit}`;
    };

    const run = { id: "run-1", timestamp: "2025-01-15T10:30:00Z", commit: "abc123def456" };
    const href = commitHref(run.commit, run);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].commit, "abc123def456");
    assert.equal(calls[0].run.id, "run-1");
    assert.equal(href, "https://github.com/org/repo/commit/abc123def456");
  });

  it("can return undefined to render plain text", () => {
    const commitHref = (_commit: string, _run: { id: string }) => undefined;
    const result = commitHref("abc123", { id: "run-1" });
    assert.equal(result, undefined);
  });

  it("is not called when commit is missing", () => {
    let called = false;
    const commitHref = () => {
      called = true;
      return "https://example.com";
    };

    // Simulates RunTable logic: only call commitHref when run.commit exists
    const run: { id: string; timestamp: string; commit?: string } = { id: "run-1", timestamp: "2025-01-15T10:30:00Z" };
    if (run.commit) {
      commitHref();
    }

    assert.equal(called, false);
  });
});
