import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareRuns as compare, compareBenchmarkResults } from "./compare.js";
import type { BenchmarkResult, OtlpMetricsDocument } from "./types.js";

// ---------------------------------------------------------------------------
// OTLP document helpers
// ---------------------------------------------------------------------------

function makeAttribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

function makeGaugeDataPoint(
  scenario: string,
  series: string,
  value: number,
  direction: string = "smaller_is_better",
) {
  return {
    attributes: [
      makeAttribute("benchkit.scenario", scenario),
      makeAttribute("benchkit.series", series),
      makeAttribute("benchkit.metric.direction", direction),
    ],
    timeUnixNano: "1700000000000000000",
    asDouble: value,
  };
}

function makeOtlpDoc(
  metrics: Array<{
    name: string;
    unit?: string;
    gauge: { dataPoints: ReturnType<typeof makeGaugeDataPoint>[] };
  }>,
): OtlpMetricsDocument {
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            makeAttribute("benchkit.run_id", "test-run-1"),
            makeAttribute("benchkit.kind", "code"),
            makeAttribute("benchkit.source_format", "native"),
          ],
        },
        scopeMetrics: [{ metrics }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// BenchmarkResult helper (for compareBenchmarkResults tests)
// ---------------------------------------------------------------------------

function makeResult(benchmarks: BenchmarkResult["benchmarks"]): BenchmarkResult {
  return { benchmarks };
}

// ---------------------------------------------------------------------------
// compareRuns (OTLP-based)
// ---------------------------------------------------------------------------

describe("compare (OTLP)", () => {
  it("returns empty result for empty baseline", () => {
    const current = makeOtlpDoc([
      { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100)] } },
    ]);
    const result = compare(current, []);
    assert.deepEqual(result.entries, []);
    assert.equal(result.hasRegression, false);
  });

  it("detects regression for smaller_is_better metric", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 120, "smaller_is_better")] } },
    ]);

    const result = compare(current, baseline);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].status, "regressed");
    assert.equal(result.entries[0].percentChange, 20);
    assert.equal(result.hasRegression, true);
  });

  it("detects improvement for smaller_is_better metric", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 80, "smaller_is_better")] } },
    ]);

    const result = compare(current, baseline);
    assert.equal(result.entries[0].status, "improved");
    assert.equal(result.entries[0].percentChange, -20);
    assert.equal(result.hasRegression, false);
  });

  it("detects regression for bigger_is_better metric", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ops_per_sec", unit: "ops/s", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 1000, "bigger_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ops_per_sec", unit: "ops/s", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 800, "bigger_is_better")] } },
    ]);

    const result = compare(current, baseline);
    assert.equal(result.entries[0].status, "regressed");
    assert.equal(result.entries[0].percentChange, -20);
    assert.equal(result.hasRegression, true);
  });

  it("detects improvement for bigger_is_better metric", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ops_per_sec", unit: "ops/s", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 1000, "bigger_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ops_per_sec", unit: "ops/s", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 1200, "bigger_is_better")] } },
    ]);

    const result = compare(current, baseline);
    assert.equal(result.entries[0].status, "improved");
    assert.equal(result.entries[0].percentChange, 20);
    assert.equal(result.hasRegression, false);
  });

  it("classifies within threshold as stable", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 103, "smaller_is_better")] } },
    ]);

    const result = compare(current, baseline, { test: "percentage", threshold: 5 });
    assert.equal(result.entries[0].status, "stable");
    assert.equal(result.entries[0].percentChange, 3);
    assert.equal(result.hasRegression, false);
  });

  it("skips new benchmarks with no baseline", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100)] } },
      ]),
    ];
    const current = makeOtlpDoc([
      {
        name: "ns_per_op",
        unit: "ns/op",
        gauge: {
          dataPoints: [
            makeGaugeDataPoint("BenchA", "default", 100),
            makeGaugeDataPoint("BenchNew", "default", 200),
          ],
        },
      },
    ]);

    const result = compare(current, baseline);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].benchmark, "BenchA");
  });

  it("averages across multiple baseline runs", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 90, "smaller_is_better")] } },
      ]),
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 110, "smaller_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better")] } },
    ]);

    // baseline avg = 100, current = 100, change = 0%
    const result = compare(current, baseline);
    assert.equal(result.entries[0].baseline, 100);
    assert.equal(result.entries[0].percentChange, 0);
    assert.equal(result.entries[0].status, "stable");
  });

  it("handles multiple scenarios and metrics", () => {
    const baseline = [
      makeOtlpDoc([
        {
          name: "ns_per_op",
          unit: "ns/op",
          gauge: {
            dataPoints: [
              makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better"),
              makeGaugeDataPoint("BenchB", "default", 500, "smaller_is_better"),
            ],
          },
        },
        {
          name: "bytes_per_op",
          unit: "B/op",
          gauge: {
            dataPoints: [
              makeGaugeDataPoint("BenchA", "default", 200, "smaller_is_better"),
            ],
          },
        },
      ]),
    ];
    const current = makeOtlpDoc([
      {
        name: "ns_per_op",
        unit: "ns/op",
        gauge: {
          dataPoints: [
            makeGaugeDataPoint("BenchA", "default", 90, "smaller_is_better"),
            makeGaugeDataPoint("BenchB", "default", 550, "smaller_is_better"),
          ],
        },
      },
      {
        name: "bytes_per_op",
        unit: "B/op",
        gauge: {
          dataPoints: [
            makeGaugeDataPoint("BenchA", "default", 250, "smaller_is_better"),
          ],
        },
      },
    ]);

    const result = compare(current, baseline);
    assert.equal(result.entries.length, 3);

    const benchANs = result.entries.find((e) => e.benchmark === "BenchA" && e.metric === "ns_per_op");
    assert.equal(benchANs?.status, "improved"); // 100→90 = -10%

    const benchABytes = result.entries.find((e) => e.benchmark === "BenchA" && e.metric === "bytes_per_op");
    assert.equal(benchABytes?.status, "regressed"); // 200→250 = +25%

    const benchBNs = result.entries.find((e) => e.benchmark === "BenchB" && e.metric === "ns_per_op");
    assert.equal(benchBNs?.status, "regressed"); // 500→550 = +10%

    assert.equal(result.hasRegression, true);
  });

  it("uses custom threshold", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 115, "smaller_is_better")] } },
    ]);

    // 15% change, 20% threshold → stable
    const result = compare(current, baseline, { test: "percentage", threshold: 20 });
    assert.equal(result.entries[0].status, "stable");

    // 15% change, 10% threshold → regressed
    const result2 = compare(current, baseline, { test: "percentage", threshold: 10 });
    assert.equal(result2.entries[0].status, "regressed");
  });

  it("skips metrics with zero baseline and returns warnings", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "allocs", unit: "allocs/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 0, "smaller_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "allocs", unit: "allocs/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 5, "smaller_is_better")] } },
    ]);

    const result = compare(current, baseline);
    assert.equal(result.entries.length, 0);
    assert.ok(result.warnings);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /allocs/);
    assert.match(result.warnings[0], /BenchA/);
    assert.match(result.warnings[0], /baseline mean is zero/);
  });

  it("omits warnings key when no metrics are skipped", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 105, "smaller_is_better")] } },
    ]);

    const result = compare(current, baseline);
    assert.equal(result.warnings, undefined);
  });

  it("boundary: exactly at threshold is stable", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 105, "smaller_is_better")] } },
    ]);

    // 5% change with 5% threshold → stable (<=)
    const result = compare(current, baseline, { test: "percentage", threshold: 5 });
    assert.equal(result.entries[0].status, "stable");
  });

  it("excludes monitor metrics from comparison", () => {
    const baseline = [
      makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better")] } },
        { name: "_monitor.cpu_user_pct", unit: "%", gauge: { dataPoints: [makeGaugeDataPoint("diagnostic", "runner", 50, "smaller_is_better")] } },
      ]),
    ];
    const current = makeOtlpDoc([
      { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 120, "smaller_is_better")] } },
      { name: "_monitor.cpu_user_pct", unit: "%", gauge: { dataPoints: [makeGaugeDataPoint("diagnostic", "runner", 80, "smaller_is_better")] } },
    ]);

    const result = compare(current, baseline);
    // Only the non-monitor metric should appear
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].benchmark, "BenchA");
    assert.equal(result.entries[0].metric, "ns_per_op");
  });
});

// ---------------------------------------------------------------------------
// compareBenchmarkResults (BenchmarkResult-based, backward compat)
// ---------------------------------------------------------------------------

describe("compareBenchmarkResults", () => {
  it("returns empty result for empty baseline", () => {
    const current = makeResult([
      { name: "BenchA", metrics: { ns_per_op: { value: 100, unit: "ns/op" } } },
    ]);
    const result = compareBenchmarkResults(current, []);
    assert.deepEqual(result.entries, []);
    assert.equal(result.hasRegression, false);
  });

  it("detects regression for smaller_is_better metric", () => {
    const baseline = [
      makeResult([
        { name: "BenchA", metrics: { ns_per_op: { value: 100, unit: "ns/op", direction: "smaller_is_better" } } },
      ]),
    ];
    const current = makeResult([
      { name: "BenchA", metrics: { ns_per_op: { value: 120, unit: "ns/op", direction: "smaller_is_better" } } },
    ]);

    const result = compareBenchmarkResults(current, baseline);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].status, "regressed");
    assert.equal(result.entries[0].percentChange, 20);
    assert.equal(result.hasRegression, true);
  });

  it("detects improvement for bigger_is_better metric", () => {
    const baseline = [
      makeResult([
        { name: "BenchA", metrics: { ops_per_sec: { value: 1000, unit: "ops/s", direction: "bigger_is_better" } } },
      ]),
    ];
    const current = makeResult([
      { name: "BenchA", metrics: { ops_per_sec: { value: 1200, unit: "ops/s", direction: "bigger_is_better" } } },
    ]);

    const result = compareBenchmarkResults(current, baseline);
    assert.equal(result.entries[0].status, "improved");
    assert.equal(result.entries[0].percentChange, 20);
    assert.equal(result.hasRegression, false);
  });

  it("infers direction from unit when not explicit", () => {
    const baseline = [
      makeResult([
        { name: "BenchA", metrics: { throughput: { value: 1000, unit: "ops/s" } } },
      ]),
    ];
    const current = makeResult([
      { name: "BenchA", metrics: { throughput: { value: 800, unit: "ops/s" } } },
    ]);

    const result = compareBenchmarkResults(current, baseline);
    // ops/s → bigger_is_better; drop from 1000→800 = regressed
    assert.equal(result.entries[0].direction, "bigger_is_better");
    assert.equal(result.entries[0].status, "regressed");
  });
});
