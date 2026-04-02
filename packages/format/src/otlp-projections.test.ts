import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractRunMetrics,
  extractScenarioMetrics,
  extractComparisonMetrics,
  extractResourceContext,
  getMetricTemporality,
  getMetricUnits,
} from "./otlp-projections.js";
import type { OtlpMetricsDocument, OtlpMetric, OtlpResourceMetrics } from "./types.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeAttribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

function makeGaugeDataPoint(
  scenario: string,
  series: string,
  value: number,
  extras: Record<string, string> = {},
) {
  return {
    attributes: [
      makeAttribute("benchkit.scenario", scenario),
      makeAttribute("benchkit.series", series),
      makeAttribute("benchkit.metric.direction", "bigger_is_better"),
      ...Object.entries(extras).map(([k, v]) => makeAttribute(k, v)),
    ],
    timeUnixNano: "1700000000000000000",
    asDouble: value,
  };
}

function makeDocument(overrides?: {
  extraMetrics?: OtlpMetric[];
  extraDatapoints?: ReturnType<typeof makeGaugeDataPoint>[];
}): OtlpMetricsDocument {
  const outcomeMetric: OtlpMetric = {
    name: "events_per_sec",
    unit: "events/s",
    gauge: {
      dataPoints: [
        makeGaugeDataPoint("json-ingest", "elastic-agent", 14000),
        makeGaugeDataPoint("tcp-syslog", "elastic-agent", 8500),
        ...(overrides?.extraDatapoints ?? []),
      ],
    },
  };

  const monitorMetric: OtlpMetric = {
    name: "_monitor.cpu_user_pct",
    unit: "%",
    sum: {
      dataPoints: [
        {
          attributes: [
            makeAttribute("benchkit.scenario", "diagnostic"),
            makeAttribute("benchkit.series", "runner"),
            makeAttribute("benchkit.metric.direction", "smaller_is_better"),
            makeAttribute("benchkit.metric.role", "diagnostic"),
          ],
          timeUnixNano: "1700000000000000000",
          asDouble: 45.2,
        },
      ],
      aggregationTemporality: 2,
      isMonotonic: false,
    },
  };

  const histogramMetric: OtlpMetric = {
    name: "request_latency_ms",
    unit: "ms",
    histogram: {
      dataPoints: [
        {
          attributes: [
            makeAttribute("benchkit.scenario", "json-ingest"),
            makeAttribute("benchkit.series", "elastic-agent"),
            makeAttribute("benchkit.metric.direction", "smaller_is_better"),
          ],
          timeUnixNano: "1700000000000000000",
          count: 100,
          sum: 2500,
        },
      ],
      aggregationTemporality: 2,
    },
  };

  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            makeAttribute("benchkit.run_id", "12345678-1"),
            makeAttribute("benchkit.kind", "workflow"),
            makeAttribute("benchkit.source_format", "otlp"),
            makeAttribute("benchkit.ref", "refs/heads/main"),
            makeAttribute("benchkit.commit", "abc123"),
            makeAttribute("service.name", "test-service"),
          ],
        },
        scopeMetrics: [
          {
            metrics: [outcomeMetric, monitorMetric, histogramMetric, ...(overrides?.extraMetrics ?? [])],
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// extractRunMetrics
// ---------------------------------------------------------------------------

describe("extractRunMetrics", () => {
  it("returns all benchmarks from the document", () => {
    const result = extractRunMetrics(makeDocument());
    assert.ok(result.benchmarks.length > 0);
    const names = result.benchmarks.map((b) => b.name);
    assert.ok(names.includes("json-ingest"));
    assert.ok(names.includes("tcp-syslog"));
    assert.ok(names.includes("diagnostic"));
  });

  it("includes context from resource attributes", () => {
    const result = extractRunMetrics(makeDocument());
    assert.equal(result.context?.commit, "abc123");
    assert.equal(result.context?.ref, "refs/heads/main");
  });

  it("throws when required resource attributes are missing", () => {
    const doc: OtlpMetricsDocument = {
      resourceMetrics: [
        {
          resource: { attributes: [] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "test",
                  gauge: {
                    dataPoints: [makeGaugeDataPoint("s1", "series1", 1)],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    assert.throws(() => extractRunMetrics(doc), /Missing required/);
  });
});

// ---------------------------------------------------------------------------
// extractScenarioMetrics
// ---------------------------------------------------------------------------

describe("extractScenarioMetrics", () => {
  it("filters to only the requested scenario", () => {
    const result = extractScenarioMetrics(makeDocument(), "json-ingest");
    const names = result.benchmarks.map((b) => b.name);
    assert.ok(names.includes("json-ingest"));
    assert.ok(!names.includes("tcp-syslog"));
    assert.ok(!names.includes("diagnostic"));
  });

  it("returns empty benchmarks for non-existent scenario", () => {
    const result = extractScenarioMetrics(makeDocument(), "does-not-exist");
    assert.equal(result.benchmarks.length, 0);
  });

  it("preserves metrics within the matching scenario", () => {
    const result = extractScenarioMetrics(makeDocument(), "json-ingest");
    const ingest = result.benchmarks.find((b) => b.name === "json-ingest");
    assert.ok(ingest);
    assert.ok("events_per_sec" in ingest.metrics);
    assert.equal(ingest.metrics["events_per_sec"].value, 14000);
  });

  it("includes histogram metrics for the matching scenario", () => {
    const result = extractScenarioMetrics(makeDocument(), "json-ingest");
    const ingest = result.benchmarks.find((b) => b.name === "json-ingest");
    assert.ok(ingest);
    assert.ok("request_latency_ms.count" in ingest.metrics);
    assert.ok("request_latency_ms.sum" in ingest.metrics);
  });

  it("includes monitor metrics when filtering by 'diagnostic' scenario", () => {
    const result = extractScenarioMetrics(makeDocument(), "diagnostic");
    const names = result.benchmarks.map((b) => b.name);
    assert.ok(names.includes("diagnostic"));
    const diag = result.benchmarks.find((b) => b.name === "diagnostic");
    assert.ok(diag);
    assert.ok("_monitor.cpu_user_pct" in diag.metrics);
  });
});

// ---------------------------------------------------------------------------
// extractComparisonMetrics
// ---------------------------------------------------------------------------

describe("extractComparisonMetrics", () => {
  it("excludes monitor metrics by default", () => {
    const result = extractComparisonMetrics(makeDocument());
    const allMetricNames = result.benchmarks.flatMap((b) =>
      Object.keys(b.metrics),
    );
    assert.ok(!allMetricNames.some((n) => n.startsWith("_monitor.")));
  });

  it("excludes diagnostic-role datapoints", () => {
    const result = extractComparisonMetrics(makeDocument());
    const names = result.benchmarks.map((b) => b.name);
    assert.ok(!names.includes("diagnostic"));
  });

  it("keeps outcome metrics", () => {
    const result = extractComparisonMetrics(makeDocument());
    const allMetricNames = result.benchmarks.flatMap((b) =>
      Object.keys(b.metrics),
    );
    assert.ok(allMetricNames.includes("events_per_sec"));
  });

  it("includes monitor metrics when excludeMonitor is false", () => {
    const result = extractComparisonMetrics(makeDocument(), false);
    const names = result.benchmarks.map((b) => b.name);
    assert.ok(names.includes("diagnostic"));
  });
});

// ---------------------------------------------------------------------------
// extractResourceContext
// ---------------------------------------------------------------------------

describe("extractResourceContext", () => {
  it("extracts context from resource attributes", () => {
    const ctx = extractResourceContext(makeDocument().resourceMetrics);
    assert.equal(ctx.commit, "abc123");
    assert.equal(ctx.ref, "refs/heads/main");
    assert.equal(ctx.runner, "test-service");
  });

  it("returns empty context for empty input", () => {
    const ctx = extractResourceContext([]);
    assert.equal(ctx.commit, undefined);
    assert.equal(ctx.ref, undefined);
    assert.equal(ctx.runner, undefined);
  });

  it("de-duplicates across multiple resource metrics", () => {
    const rm1: OtlpResourceMetrics = {
      resource: {
        attributes: [
          makeAttribute("benchkit.commit", "abc123"),
          makeAttribute("benchkit.ref", "refs/heads/main"),
        ],
      },
    };
    const rm2: OtlpResourceMetrics = {
      resource: {
        attributes: [
          makeAttribute("benchkit.commit", "def456"),
          makeAttribute("benchkit.ref", "refs/heads/other"),
          makeAttribute("service.name", "my-service"),
        ],
      },
    };
    const ctx = extractResourceContext([rm1, rm2]);
    // First wins for de-duplication
    assert.equal(ctx.commit, "abc123");
    assert.equal(ctx.ref, "refs/heads/main");
    assert.equal(ctx.runner, "my-service");
  });
});

// ---------------------------------------------------------------------------
// getMetricTemporality
// ---------------------------------------------------------------------------

describe("getMetricTemporality", () => {
  it("maps metric names to their temporality", () => {
    const metrics: OtlpMetric[] = [
      { name: "gauge_metric", gauge: { dataPoints: [] } },
      { name: "sum_metric", sum: { dataPoints: [], aggregationTemporality: 2 } },
      { name: "delta_metric", sum: { dataPoints: [], aggregationTemporality: 1 } },
    ];
    const result = getMetricTemporality(metrics);
    assert.equal(result.get("gauge_metric"), "unspecified");
    assert.equal(result.get("sum_metric"), "cumulative");
    assert.equal(result.get("delta_metric"), "delta");
  });

  it("returns empty map for no metrics", () => {
    const result = getMetricTemporality([]);
    assert.equal(result.size, 0);
  });
});

// ---------------------------------------------------------------------------
// getMetricUnits
// ---------------------------------------------------------------------------

describe("getMetricUnits", () => {
  it("maps metric names to their units", () => {
    const metrics: OtlpMetric[] = [
      { name: "events_per_sec", unit: "events/s", gauge: { dataPoints: [] } },
      { name: "cpu_pct", unit: "%", gauge: { dataPoints: [] } },
      { name: "no_unit", gauge: { dataPoints: [] } },
    ];
    const result = getMetricUnits(metrics);
    assert.equal(result.get("events_per_sec"), "events/s");
    assert.equal(result.get("cpu_pct"), "%");
    assert.equal(result.get("no_unit"), undefined);
  });

  it("returns empty map for no metrics", () => {
    const result = getMetricUnits([]);
    assert.equal(result.size, 0);
  });
});
