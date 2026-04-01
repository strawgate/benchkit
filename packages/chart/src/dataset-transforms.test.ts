import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { SeriesFile } from "@benchkit/format";
import { transformSeriesDataset, formatGroupLabel, filtersFromTagRecord } from "./dataset-transforms.js";

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
  it("returns all series when no options are provided", () => {
    const sf = makeSeriesFile();
    const result = transformSeriesDataset(sf);
    assert.deepEqual(Object.keys(result.series), ["worker-a", "worker-b", "collector"]);
    assert.equal(result.metric, "events_per_sec");
  });

  it("overrides the metric name when the metric option is set", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), { metric: "ops_per_sec" });
    assert.equal(transformed.metric, "ops_per_sec");
    assert.equal(transformed.unit, "events/sec");
  });

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

  it("groups by tag and takes the max across matching series", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), {
      groupByTag: "process",
      aggregate: "max",
    });
    assert.deepEqual(transformed.series["process=worker"].points, [
      { timestamp: "2026-04-01T00:00:00Z", value: 30 },
      { timestamp: "2026-04-01T00:01:00Z", value: 40 },
    ]);
  });

  it("preserves tags on grouped series", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), { groupByTag: "process" });
    assert.deepEqual(transformed.series["process=worker"].tags, { process: "worker" });
    assert.deepEqual(transformed.series["process=collector"].tags, { process: "collector" });
  });

  it("sorts by latest value descending (top-k ordering)", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), {
      sortByLatest: "desc",
    });
    assert.deepEqual(Object.keys(transformed.series), ["worker-b", "worker-a", "collector"]);
  });

  it("sorts by latest value ascending", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), {
      sortByLatest: "asc",
    });
    assert.deepEqual(Object.keys(transformed.series), ["collector", "worker-a", "worker-b"]);
  });

  it("limits to top-k series when combined with sortByLatest", () => {
    const transformed = transformSeriesDataset(makeSeriesFile(), {
      sortByLatest: "desc",
      limit: 2,
    });
    assert.deepEqual(Object.keys(transformed.series), ["worker-b", "worker-a"]);
  });

  it("preserves metric metadata on the returned SeriesFile", () => {
    const sf = makeSeriesFile();
    const result = transformSeriesDataset(sf, { filters: [{ key: "process", values: ["worker"] }] });
    assert.equal(result.metric, "events_per_sec");
    assert.equal(result.unit, "events/sec");
    assert.equal(result.direction, "bigger_is_better");
  });
});

describe("formatGroupLabel", () => {
  it("returns the group key as-is for normal values", () => {
    assert.equal(formatGroupLabel("process", "worker"), "worker");
    assert.equal(formatGroupLabel("lane", "a"), "a");
  });

  it("returns a descriptive placeholder for the missing-tag sentinel", () => {
    assert.equal(formatGroupLabel("process", "__missing__"), "(no process)");
    assert.equal(formatGroupLabel("region", "__missing__"), "(no region)");
  });
});

describe("filtersFromTagRecord", () => {
  it("returns an empty array for an empty record", () => {
    assert.deepEqual(filtersFromTagRecord({}), []);
  });

  it("converts each key-value pair into an inclusive single-value DatasetFilter", () => {
    const filters = filtersFromTagRecord({ process: "worker", lane: "a" });
    assert.deepEqual(filters, [
      { key: "process", values: ["worker"] },
      { key: "lane", values: ["a"] },
    ]);
  });

  it("produces filters that transformSeriesDataset can apply correctly", () => {
    const sf = makeSeriesFile();
    const transformed = transformSeriesDataset(sf, {
      filters: filtersFromTagRecord({ process: "worker" }),
    });
    assert.deepEqual(Object.keys(transformed.series), ["worker-a", "worker-b"]);
  });
});
