import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { h } from "preact";
import render from "preact-render-to-string";
import { TrendChart } from "./components/TrendChart.js";
import type { SeriesFile } from "@benchkit/format";

function makeSeries(overrides?: Partial<SeriesFile>): SeriesFile {
  return {
    metric: "ops",
    unit: "ops/s",
    series: {
      "bench-a": {
        points: [
          { timestamp: "2024-01-01T00:00:00Z", value: 100, commit: "aabb1122", range: 5 },
          { timestamp: "2024-01-02T00:00:00Z", value: 110, commit: "ccdd3344", range: 3 },
          { timestamp: "2024-01-03T00:00:00Z", value: 105, commit: "eeff5566" },
        ],
      },
    },
    ...overrides,
  };
}

describe("TrendChart", () => {
  it("renders a canvas element", () => {
    const html = render(h(TrendChart, { series: makeSeries() }));
    assert.match(html, /<canvas/);
  });

  it("renders title when provided", () => {
    const html = render(h(TrendChart, { series: makeSeries(), title: "Ops Trend" }));
    assert.match(html, /Ops Trend/);
    assert.match(html, /<h3/);
  });

  it("does not render title when omitted", () => {
    const html = render(h(TrendChart, { series: makeSeries() }));
    assert.doesNotMatch(html, /<h3/);
  });

  it("applies default height of 300px", () => {
    const html = render(h(TrendChart, { series: makeSeries() }));
    assert.match(html, /height:\s*300px/);
  });

  it("applies custom height", () => {
    const html = render(h(TrendChart, { series: makeSeries(), height: 500 }));
    assert.match(html, /height:\s*500px/);
  });

  it("applies custom CSS class", () => {
    const html = render(h(TrendChart, { series: makeSeries(), class: "my-chart" }));
    assert.match(html, /class="my-chart"/);
  });

  it("renders without error for empty series", () => {
    const emptySeries: SeriesFile = { metric: "ops", series: {} };
    const html = render(h(TrendChart, { series: emptySeries }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for single-point series", () => {
    const singlePoint: SeriesFile = {
      metric: "ops",
      series: {
        "bench-a": {
          points: [{ timestamp: "2024-01-01T00:00:00Z", value: 42 }],
        },
      },
    };
    const html = render(h(TrendChart, { series: singlePoint }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for multiple series", () => {
    const multiSeries: SeriesFile = {
      metric: "ops",
      series: {
        "bench-a": {
          points: [
            { timestamp: "2024-01-01T00:00:00Z", value: 100 },
            { timestamp: "2024-01-02T00:00:00Z", value: 110 },
          ],
        },
        "bench-b": {
          points: [
            { timestamp: "2024-01-01T00:00:00Z", value: 200 },
            { timestamp: "2024-01-02T00:00:00Z", value: 210 },
          ],
        },
      },
    };
    const html = render(h(TrendChart, { series: multiSeries }));
    assert.match(html, /<canvas/);
  });

  it("renders without error when series has no unit", () => {
    const noUnit: SeriesFile = {
      metric: "throughput",
      series: {
        test: { points: [{ timestamp: "2024-01-01T00:00:00Z", value: 50 }] },
      },
    };
    const html = render(h(TrendChart, { series: noUnit }));
    assert.match(html, /<canvas/);
  });

  it("renders without error with maxPoints prop", () => {
    const html = render(h(TrendChart, { series: makeSeries(), maxPoints: 2 }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for series with missing optional data point fields", () => {
    const minimal: SeriesFile = {
      metric: "ops",
      series: {
        test: {
          points: [
            { timestamp: "2024-01-01T00:00:00Z", value: 10 },
            { timestamp: "2024-01-02T00:00:00Z", value: 20 },
          ],
        },
      },
    };
    const html = render(h(TrendChart, { series: minimal }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for series with tags", () => {
    const tagged: SeriesFile = {
      metric: "latency",
      unit: "ms",
      series: {
        test: {
          tags: { env: "prod", region: "us-east" },
          points: [{ timestamp: "2024-01-01T00:00:00Z", value: 5 }],
        },
      },
    };
    const html = render(h(TrendChart, { series: tagged }));
    assert.match(html, /<canvas/);
  });
});
