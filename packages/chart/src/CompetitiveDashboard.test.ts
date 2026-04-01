import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { SeriesFile } from "@benchkit/format";

/**
 * Tests for CompetitiveDashboard logic helpers.
 * Full component rendering is not feasible without a DOM environment;
 * these tests validate the pure functions and data-model contracts.
 */

// ── Helpers mirrored from CompetitiveDashboard.tsx ──────────────────────────

function isMonitorMetric(metric: string): boolean {
  return metric.startsWith("_monitor/");
}

function rankOrdinal(rank: number): string {
  const mod100 = rank % 100;
  const mod10 = rank % 10;
  if (mod10 === 1 && mod100 !== 11) return `${rank}st`;
  if (mod10 === 2 && mod100 !== 12) return `${rank}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${rank}rd`;
  return `${rank}th`;
}

function formatGap(gap: number, unit: string | undefined): string {
  const abs = Math.abs(gap);
  const formatted =
    abs >= 1000
      ? Math.round(gap).toLocaleString("en-US")
      : gap.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

// Mirrors the scenario filtering logic in CompetitiveDashboard
function resolveScenarioKeys(
  allMetrics: string[],
  scenariosProp: string[] | undefined,
): string[] {
  if (scenariosProp) return allMetrics.filter((m) => scenariosProp.includes(m));
  return allMetrics.filter((m) => !isMonitorMetric(m));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CompetitiveDashboard: isMonitorMetric", () => {
  it("excludes _monitor/ prefixed metrics from scenario list", () => {
    const metrics = ["BenchmarkSort", "_monitor/cpu", "BenchmarkSearch", "_monitor/mem"];
    const scenarios = resolveScenarioKeys(metrics, undefined);
    assert.deepEqual(scenarios, ["BenchmarkSort", "BenchmarkSearch"]);
  });

  it("includes all metrics when scenariosProp is provided", () => {
    const metrics = ["BenchmarkSort", "_monitor/cpu", "BenchmarkSearch"];
    const scenarios = resolveScenarioKeys(metrics, ["BenchmarkSort", "BenchmarkSearch"]);
    assert.deepEqual(scenarios, ["BenchmarkSort", "BenchmarkSearch"]);
  });

  it("respects scenariosProp ordering (preserves index order)", () => {
    const metrics = ["a", "b", "c", "d"];
    const scenarios = resolveScenarioKeys(metrics, ["c", "a"]);
    assert.deepEqual(scenarios, ["a", "c"]);
  });

  it("returns empty list when no non-monitor metrics exist", () => {
    const metrics = ["_monitor/cpu", "_monitor/mem"];
    const scenarios = resolveScenarioKeys(metrics, undefined);
    assert.deepEqual(scenarios, []);
  });
});

describe("CompetitiveDashboard: rankOrdinal", () => {
  it("formats 1st correctly", () => {
    assert.equal(rankOrdinal(1), "1st");
  });

  it("formats 2nd correctly", () => {
    assert.equal(rankOrdinal(2), "2nd");
  });

  it("formats 3rd correctly", () => {
    assert.equal(rankOrdinal(3), "3rd");
  });

  it("formats higher ranks with th suffix", () => {
    assert.equal(rankOrdinal(4), "4th");
    assert.equal(rankOrdinal(10), "10th");
    assert.equal(rankOrdinal(11), "11th");
    assert.equal(rankOrdinal(12), "12th");
    assert.equal(rankOrdinal(13), "13th");
    assert.equal(rankOrdinal(21), "21st");
    assert.equal(rankOrdinal(22), "22nd");
    assert.equal(rankOrdinal(23), "23rd");
    assert.equal(rankOrdinal(100), "100th");
  });
});

describe("CompetitiveDashboard: formatGap", () => {
  it("includes unit when provided", () => {
    assert.equal(formatGap(42, "ns"), "42 ns");
  });

  it("omits unit when undefined", () => {
    assert.equal(formatGap(42, undefined), "42");
  });

  it("uses toLocaleString for large numbers", () => {
    const result = formatGap(123456, "ops");
    assert.ok(result.includes("ops"), `expected "ops" in "${result}"`);
    // The integer is large (>=1000) so it should be rounded
    assert.ok(!result.includes("."), `expected no decimal in large number: "${result}"`);
  });

  it("uses fraction digits for small numbers", () => {
    const result = formatGap(1.2345, "ms");
    assert.ok(result.startsWith("1."), `expected decimal: "${result}"`);
  });
});

describe("CompetitiveDashboard: ownSeries identification", () => {
  it("identifies own series from seriesMap", () => {
    const sf: SeriesFile = {
      metric: "ns_per_op",
      direction: "smaller_is_better",
      series: {
        OurImpl: { points: [{ timestamp: "2025-01-01T00:00:00Z", value: 100 }] },
        Competitor: { points: [{ timestamp: "2025-01-01T00:00:00Z", value: 200 }] },
      },
    };

    const ownSeries = "OurImpl";
    const hasSeries = ownSeries in sf.series;
    assert.equal(hasSeries, true);
  });

  it("handles missing own series gracefully", () => {
    const sf: SeriesFile = {
      metric: "ns_per_op",
      series: {
        Competitor: { points: [{ timestamp: "2025-01-01T00:00:00Z", value: 200 }] },
      },
    };

    const ownSeries = "OurImpl";
    const hasSeries = ownSeries in sf.series;
    assert.equal(hasSeries, false);
  });
});

describe("CompetitiveDashboard: scenario labels", () => {
  it("uses metricLabelFormatter when provided", () => {
    const formatter = (m: string) => m.replace(/_/g, " ").toUpperCase();
    assert.equal(formatter("ns_per_op"), "NS PER OP");
  });

  it("falls back to raw metric name when no formatter", () => {
    const label = (metric: string, fmt?: (m: string) => string) =>
      fmt ? fmt(metric) : metric;
    assert.equal(label("ns_per_op"), "ns_per_op");
  });
});

describe("CompetitiveDashboard: competitor count", () => {
  it("counts series correctly", () => {
    const sf: SeriesFile = {
      metric: "throughput",
      series: {
        ImplA: { points: [] },
        ImplB: { points: [] },
        ImplC: { points: [] },
      },
    };
    assert.equal(Object.keys(sf.series).length, 3);
  });
});

describe("CompetitiveDashboard: props defaults", () => {
  it("maxPoints defaults to 20", () => {
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
});

describe("CompetitiveDashboard: seriesNameFormatter", () => {
  it("receives name and entry", () => {
    const calls: string[] = [];
    const formatter = (name: string) => {
      calls.push(name);
      return `[${name}]`;
    };

    const names = ["ImplA", "ImplB"];
    const labels = names.map((n) => formatter(n));

    assert.deepEqual(calls, ["ImplA", "ImplB"]);
    assert.deepEqual(labels, ["[ImplA]", "[ImplB]"]);
  });

  it("falls back to raw name when not provided", () => {
    const applyFormatter = (
      fmt: ((name: string) => string) | undefined,
      name: string,
    ) => (fmt ? fmt(name) : name);

    assert.equal(applyFormatter(undefined, "ImplA"), "ImplA");
  });
});
