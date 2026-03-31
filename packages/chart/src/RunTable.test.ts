import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { h } from "preact";
import render from "preact-render-to-string";
import { RunTable } from "./components/RunTable.js";
import type { IndexFile } from "@benchkit/format";

function fullIndex(): IndexFile {
  return {
    runs: [
      {
        id: "run-1",
        timestamp: "2024-06-15T10:30:00Z",
        commit: "abc12345def67890",
        ref: "refs/heads/main",
        benchmarks: 5,
        metrics: ["ops", "latency"],
      },
      {
        id: "run-2",
        timestamp: "2024-06-14T09:00:00Z",
        commit: "1234567890abcdef",
        ref: "refs/heads/feature",
        benchmarks: 3,
        metrics: ["ops"],
      },
    ],
    metrics: ["ops", "latency"],
  };
}

describe("RunTable", () => {
  it("renders all column headers", () => {
    const html = render(h(RunTable, { index: { runs: [] } }));
    assert.match(html, /Run/);
    assert.match(html, /Time/);
    assert.match(html, /Commit/);
    assert.match(html, /Ref/);
    assert.match(html, /Benchmarks/);
    assert.match(html, /Metrics/);
  });

  it("renders run rows with all fields", () => {
    const html = render(h(RunTable, { index: fullIndex() }));
    assert.match(html, /run-1/);
    assert.match(html, /run-2/);
    // Commit truncated to 8 chars
    assert.match(html, /abc12345/);
    assert.doesNotMatch(html, /abc12345def67890/);
    // Ref with refs/heads/ stripped
    assert.match(html, /main/);
    assert.match(html, /feature/);
    // Benchmarks count
    assert.match(html, /5/);
    assert.match(html, /3/);
    // Metrics joined
    assert.match(html, /ops, latency/);
  });

  it("renders empty tbody for no runs", () => {
    const html = render(h(RunTable, { index: { runs: [] } }));
    assert.match(html, /<thead>/);
    assert.match(html, /<tbody><\/tbody>/);
  });

  it("renders em dash for missing optional fields", () => {
    const index: IndexFile = {
      runs: [
        { id: "run-sparse", timestamp: "2024-01-01T00:00:00Z" },
      ],
    };
    const html = render(h(RunTable, { index }));
    assert.match(html, /run-sparse/);
    // Missing commit, ref, benchmarks, metrics all show —
    const dashCount = (html.match(/\u2014/g) ?? []).length;
    assert.ok(dashCount >= 4, `Expected at least 4 em dashes for missing fields, got ${dashCount}`);
  });

  it("truncates rows to maxRows", () => {
    const index: IndexFile = {
      runs: [
        { id: "run-a", timestamp: "2024-01-01T00:00:00Z" },
        { id: "run-b", timestamp: "2024-01-02T00:00:00Z" },
        { id: "run-c", timestamp: "2024-01-03T00:00:00Z" },
      ],
    };
    const html = render(h(RunTable, { index, maxRows: 2 }));
    assert.match(html, /run-a/);
    assert.match(html, /run-b/);
    assert.doesNotMatch(html, /run-c/);
  });

  it("renders all rows when maxRows is not set", () => {
    const index: IndexFile = {
      runs: [
        { id: "run-a", timestamp: "2024-01-01T00:00:00Z" },
        { id: "run-b", timestamp: "2024-01-02T00:00:00Z" },
        { id: "run-c", timestamp: "2024-01-03T00:00:00Z" },
      ],
    };
    const html = render(h(RunTable, { index }));
    assert.match(html, /run-a/);
    assert.match(html, /run-b/);
    assert.match(html, /run-c/);
  });

  it("applies custom CSS class", () => {
    const html = render(h(RunTable, { index: { runs: [] }, class: "my-table" }));
    assert.match(html, /class="my-table"/);
  });

  it("renders clickable rows when onSelectRun is provided", () => {
    const html = render(h(RunTable, { index: fullIndex(), onSelectRun: () => {} }));
    assert.match(html, /cursor:\s*pointer/);
  });

  it("renders non-clickable rows when onSelectRun is absent", () => {
    const html = render(h(RunTable, { index: fullIndex() }));
    assert.match(html, /cursor:\s*default/);
  });

  it("strips refs/heads/ prefix from ref", () => {
    const index: IndexFile = {
      runs: [{ id: "r1", timestamp: "2024-01-01T00:00:00Z", ref: "refs/heads/develop" }],
    };
    const html = render(h(RunTable, { index }));
    assert.match(html, /develop/);
    assert.doesNotMatch(html, /refs\/heads\//);
  });

  it("handles a single run", () => {
    const index: IndexFile = {
      runs: [
        {
          id: "solo",
          timestamp: "2024-03-01T12:00:00Z",
          commit: "aabbccdd",
          ref: "refs/heads/main",
          benchmarks: 1,
          metrics: ["throughput"],
        },
      ],
    };
    const html = render(h(RunTable, { index }));
    assert.match(html, /solo/);
    assert.match(html, /aabbccdd/);
    assert.match(html, /throughput/);
  });
});
