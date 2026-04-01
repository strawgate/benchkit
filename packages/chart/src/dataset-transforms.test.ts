import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { SeriesFile } from "@benchkit/format";
import { transformSeriesDataset } from "./dataset-transforms.js";

function makeSeriesFile(): SeriesFile {
  return {
    metric: "events_per_sec",
    unit: "events/sec",
    direction: "bigger_is_better",
    series: {
      "worker-a": {
        tags: { process: "worker", lane: "a" },
        points: [
          { timestamp: "2026-04-01T00:00:00Z", value: 10 },
          { timestamp: "2026-04-01T00:01:00Z", value: 20 },
        ],
      },
      "worker-b": {
        tags: { process: "worker", lane: "b" },
        points: [
          { timestamp: "2026-04-01T00:00:00Z", value: 30 },
          { timestamp: "2026-04-01T00:01:00Z", value: 40 },
        ],
      },
      collector: {
        tags: { process: "collector", lane: "shared" },
        points: [
          { timestamp: "2026-04-01T00:00:00Z", value: 5 },
          { timestamp: "2026-04-01T00:01:00Z", value: 6 },
        ],
      },
    },
  };
}

describe("transformSeriesDataset", () => {
  it("filters by tag values", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), {
      filters: [{ key: "process", values: ["worker"] }],
    });
    assert.deepEqual(Object.keys(transformed.series), ["worker-a", "worker-b"]);
  });

  it("supports exclusion filters", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), {
      filters: [{ key: "process", values: ["collector"], exclude: true }],
    });
    assert.deepEqual(Object.keys(transformed.series), ["worker-a", "worker-b"]);
  });

  it("groups by tag and sums matching series", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), {
      groupByTag: "process",
      aggregate: "sum",
    });
    assert.deepEqual(Object.keys(transformed.series), ["process=worker", "process=collector"]);
    assert.deepEqual(transformed.series["process=worker"].points, [
      { timestamp: "2026-04-01T00:00:00Z", value: 40 },
      { timestamp: "2026-04-01T00:01:00Z", value: 60 },
    ]);
  });

  it("groups by tag and averages matching series", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), {
      groupByTag: "process",
      aggregate: "avg",
    });
    assert.deepEqual(transformed.series["process=worker"].points, [
      { timestamp: "2026-04-01T00:00:00Z", value: 20 },
      { timestamp: "2026-04-01T00:01:00Z", value: 30 },
    ]);
  });

  it("sorts by latest value and limits visible series", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), {
      sortByLatest: "desc",
      limit: 2,
    });
    assert.deepEqual(Object.keys(transformed.series), ["worker-b", "worker-a"]);
  });
});
