import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { h } from "preact";
import render from "preact-render-to-string";
import { ComparisonBar } from "./components/ComparisonBar.js";
import type { SeriesFile } from "@benchkit/format";

function makeSeries(overrides?: Partial<SeriesFile>): SeriesFile {
  return {
    metric: "ops",
    unit: "ops/s",
    series: {
      "bench-a": {
        points: [
          { timestamp: "2024-01-01T00:00:00Z", value: 100, range: 5 },
          { timestamp: "2024-01-02T00:00:00Z", value: 120, range: 3 },
        ],
      },
      "bench-b": {
        points: [
          { timestamp: "2024-01-01T00:00:00Z", value: 200 },
          { timestamp: "2024-01-02T00:00:00Z", value: 210 },
        ],
      },
    },
    ...overrides,
  };
}

describe("ComparisonBar", () => {
  it("renders a canvas element", () => {
    const html = render(h(ComparisonBar, { series: makeSeries() }));
    assert.match(html, /<canvas/);
  });

  it("renders title when provided", () => {
    const html = render(h(ComparisonBar, { series: makeSeries(), title: "Comparison" }));
    assert.match(html, /Comparison/);
    assert.match(html, /<h3/);
  });

  it("does not render title when omitted", () => {
    const html = render(h(ComparisonBar, { series: makeSeries() }));
    assert.doesNotMatch(html, /<h3/);
  });

  it("applies default height of 250px", () => {
    const html = render(h(ComparisonBar, { series: makeSeries() }));
    assert.match(html, /height:\s*250px/);
  });

  it("applies custom height", () => {
    const html = render(h(ComparisonBar, { series: makeSeries(), height: 400 }));
    assert.match(html, /height:\s*400px/);
  });

  it("applies custom CSS class", () => {
    const html = render(h(ComparisonBar, { series: makeSeries(), class: "bar-chart" }));
    assert.match(html, /class="bar-chart"/);
  });

  it("renders without error for empty series", () => {
    const emptySeries: SeriesFile = { metric: "ops", series: {} };
    const html = render(h(ComparisonBar, { series: emptySeries }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for series with empty points", () => {
    const noPoints: SeriesFile = {
      metric: "ops",
      series: { test: { points: [] } },
    };
    const html = render(h(ComparisonBar, { series: noPoints }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for single series entry", () => {
    const single: SeriesFile = {
      metric: "ops",
      series: {
        only: { points: [{ timestamp: "2024-01-01T00:00:00Z", value: 42 }] },
      },
    };
    const html = render(h(ComparisonBar, { series: single }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for series without range values", () => {
    const noRange: SeriesFile = {
      metric: "ops",
      series: {
        a: { points: [{ timestamp: "2024-01-01T00:00:00Z", value: 10 }] },
        b: { points: [{ timestamp: "2024-01-01T00:00:00Z", value: 20 }] },
      },
    };
    const html = render(h(ComparisonBar, { series: noRange }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for series without unit", () => {
    const noUnit: SeriesFile = {
      metric: "throughput",
      series: {
        test: { points: [{ timestamp: "2024-01-01T00:00:00Z", value: 50 }] },
      },
    };
    const html = render(h(ComparisonBar, { series: noUnit }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for more than 6 series (triggers axis swap)", () => {
    const manySeries: SeriesFile = {
      metric: "ops",
      series: Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `bench-${i}`,
          { points: [{ timestamp: "2024-01-01T00:00:00Z", value: 10 * (i + 1) }] },
        ]),
      ),
    };
    const html = render(h(ComparisonBar, { series: manySeries }));
    assert.match(html, /<canvas/);
  });

  it("renders without error for series with direction field", () => {
    const directed: SeriesFile = {
      metric: "latency",
      unit: "ms",
      direction: "smaller_is_better",
      series: {
        test: { points: [{ timestamp: "2024-01-01T00:00:00Z", value: 5, range: 1 }] },
      },
    };
    const html = render(h(ComparisonBar, { series: directed }));
    assert.match(html, /<canvas/);
  });
});
