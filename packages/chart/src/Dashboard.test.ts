import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { h } from "preact";
import render from "preact-render-to-string";
import { Dashboard } from "./Dashboard.js";
import type { DataSource } from "./fetch.js";
import type { IndexFile, SeriesFile } from "@benchkit/format";

const source: DataSource = { owner: "test-owner", repo: "test-repo" };

function mockFetchResponses(responses: Record<string, unknown>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const sampleIndex: IndexFile = {
  runs: [
    { id: "run-1", timestamp: "2024-06-15T10:30:00Z", commit: "abc12345", ref: "refs/heads/main", benchmarks: 2, metrics: ["ops"] },
  ],
  metrics: ["ops"],
};

const _sampleSeries: SeriesFile = {
  metric: "ops",
  unit: "ops/s",
  series: {
    "bench-a": {
      points: [{ timestamp: "2024-01-01T00:00:00Z", value: 100 }],
    },
  },
};

describe("Dashboard", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders loading state on initial render", () => {
    mockFetchResponses({ "index.json": sampleIndex });
    const html = render(h(Dashboard, { source }));
    assert.match(html, /Loading benchmark data/);
  });

  it("applies custom CSS class to loading state", () => {
    mockFetchResponses({ "index.json": sampleIndex });
    const html = render(h(Dashboard, { source, class: "dash" }));
    assert.match(html, /class="dash"/);
  });

  it("renders without error when source has explicit branch", () => {
    mockFetchResponses({ "index.json": sampleIndex });
    const html = render(h(Dashboard, { source: { ...source, branch: "custom" } }));
    assert.match(html, /Loading benchmark data/);
  });

  it("renders without error with minimal source props", () => {
    mockFetchResponses({ "index.json": { runs: [] } });
    const html = render(h(Dashboard, { source: { owner: "o", repo: "r" } }));
    assert.ok(html.length > 0);
  });
});
