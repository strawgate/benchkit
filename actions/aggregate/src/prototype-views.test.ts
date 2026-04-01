import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ParsedRun } from "./aggregate.js";
import {
  buildMetricSummaryViews,
  buildPrIndex,
  buildRefIndex,
  buildRunDetail,
  extractPrNumber,
} from "./prototype-views.js";
import { buildSeries } from "./aggregate.js";

function makeRun(
  id: string,
  timestamp: string,
  ref: string,
  benchmarks: ParsedRun["result"]["benchmarks"],
  commit?: string,
): ParsedRun {
  return {
    id,
    result: {
      benchmarks,
      context: {
        timestamp,
        ref,
        commit,
      },
    },
  };
}

describe("prototype aggregate views", () => {
  it("extracts PR numbers from refs", () => {
    assert.equal(extractPrNumber("refs/pull/42/merge"), 42);
    assert.equal(extractPrNumber("refs/heads/main"), null);
    assert.equal(extractPrNumber(undefined), null);
  });

  it("builds ref and PR indexes from runs", () => {
    const runs = [
      { id: "run-3", timestamp: "2026-04-01T03:00:00Z", ref: "refs/pull/42/merge", commit: "ccc" },
      { id: "run-2", timestamp: "2026-04-01T02:00:00Z", ref: "refs/heads/main", commit: "bbb" },
      { id: "run-1", timestamp: "2026-04-01T01:00:00Z", ref: "refs/heads/main", commit: "aaa" },
    ];

    const refs = buildRefIndex(runs);
    const prs = buildPrIndex(runs);

    assert.deepEqual(refs[0], {
      ref: "refs/pull/42/merge",
      latestRunId: "run-3",
      latestTimestamp: "2026-04-01T03:00:00Z",
      latestCommit: "ccc",
      runCount: 1,
    });

    assert.deepEqual(prs[0], {
      prNumber: 42,
      ref: "refs/pull/42/merge",
      latestRunId: "run-3",
      latestTimestamp: "2026-04-01T03:00:00Z",
      latestCommit: "ccc",
      runCount: 1,
    });
  });

  it("builds a run detail view from a parsed run", () => {
    const runs = [
      makeRun(
        "run-1",
        "2026-04-01T01:00:00Z",
        "refs/heads/main",
        [
          {
            name: "mock-http-ingest",
            tags: { scenario: "json-ingest" },
            metrics: {
              events_per_sec: {
                value: 13240.5,
                unit: "events/sec",
                direction: "bigger_is_better",
              },
              p95_batch_ms: {
                value: 143.2,
                unit: "ms",
                direction: "smaller_is_better",
              },
            },
          },
        ],
        "abc123",
      ),
    ];

    const detail = buildRunDetail("run-1", runs);
    assert.ok(detail);
    assert.equal(detail?.run.id, "run-1");
    assert.deepEqual(detail?.run.metrics, ["events_per_sec", "p95_batch_ms"]);
    assert.equal(detail?.metricSnapshots[0].values[0].name, "mock-http-ingest [scenario=json-ingest]");
  });

  it("builds metric summary views from series files", () => {
    const runs = [
      makeRun(
        "run-1",
        "2026-04-01T01:00:00Z",
        "refs/heads/main",
        [
          {
            name: "mock-http-ingest",
            tags: { scenario: "json-ingest" },
            metrics: {
              events_per_sec: { value: 1000, unit: "events/sec", direction: "bigger_is_better" },
            },
          },
        ],
      ),
      makeRun(
        "run-2",
        "2026-04-01T02:00:00Z",
        "refs/heads/main",
        [
          {
            name: "mock-http-ingest",
            tags: { scenario: "json-ingest" },
            metrics: {
              events_per_sec: { value: 1100, unit: "events/sec", direction: "bigger_is_better" },
            },
          },
        ],
      ),
    ];

    const summary = buildMetricSummaryViews(buildSeries(runs));
    assert.deepEqual(summary, [
      {
        metric: "events_per_sec",
        latestSeriesCount: 1,
        latestRunId: "run-2",
        latestTimestamp: "2026-04-01T02:00:00Z",
      },
    ]);
  });
});
