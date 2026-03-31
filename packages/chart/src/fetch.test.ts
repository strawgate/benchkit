import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { fetchIndex, fetchSeries, fetchRun } from "./fetch.js";

describe("fetch", () => {
  const ds = { owner: "strawgate", repo: "benchkit", branch: "bench-data" };
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(body: unknown, status = 200) {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return urls;
  }

  function stubFetchError(status: number) {
    globalThis.fetch = (async () =>
      new Response("error", { status })) as typeof fetch;
  }

  describe("fetchIndex", () => {
    it("fetches from the correct URL", async () => {
      const urls = stubFetch({ runs: [], metrics: [] });
      await fetchIndex(ds);

      assert.equal(urls.length, 1);
      assert.equal(
        urls[0],
        "https://raw.githubusercontent.com/strawgate/benchkit/bench-data/data/index.json",
      );
    });

    it("returns parsed index data", async () => {
      const body = { runs: [{ id: "r1", timestamp: "2024-01-01T00:00:00Z" }], metrics: ["ops"] };
      stubFetch(body);

      const result = await fetchIndex(ds);
      assert.deepEqual(result, body);
    });

    it("defaults branch to bench-data when omitted", async () => {
      const urls = stubFetch({ runs: [] });
      await fetchIndex({ owner: "foo", repo: "bar" });

      assert.match(urls[0], /\/foo\/bar\/bench-data\//);
    });

    it("throws on non-ok response", async () => {
      stubFetchError(404);
      await assert.rejects(() => fetchIndex(ds), { message: "Failed to fetch index: 404" });
    });
  });

  describe("fetchSeries", () => {
    it("fetches the correct metric URL", async () => {
      const urls = stubFetch({ metric: "ops", series: {} });
      await fetchSeries(ds, "ops");

      assert.equal(
        urls[0],
        "https://raw.githubusercontent.com/strawgate/benchkit/bench-data/data/series/ops.json",
      );
    });

    it("returns parsed series data", async () => {
      const body = {
        metric: "latency",
        unit: "ms",
        series: {
          "bench-a": {
            points: [{ timestamp: "2024-01-01T00:00:00Z", value: 42 }],
          },
        },
      };
      stubFetch(body);

      const result = await fetchSeries(ds, "latency");
      assert.deepEqual(result, body);
    });

    it("throws on non-ok response", async () => {
      stubFetchError(500);
      await assert.rejects(() => fetchSeries(ds, "ops"), { message: "Failed to fetch series/ops: 500" });
    });
  });

  describe("fetchRun", () => {
    it("fetches the correct run URL", async () => {
      const urls = stubFetch({ benchmarks: [] });
      await fetchRun(ds, "run-123");

      assert.equal(
        urls[0],
        "https://raw.githubusercontent.com/strawgate/benchkit/bench-data/data/runs/run-123.json",
      );
    });

    it("returns parsed run data", async () => {
      const body = {
        benchmarks: [
          { name: "test", metrics: { ops: { value: 100, unit: "ops/s" } } },
        ],
        context: { commit: "abc123" },
      };
      stubFetch(body);

      const result = await fetchRun(ds, "run-123");
      assert.deepEqual(result, body);
    });

    it("throws on non-ok response", async () => {
      stubFetchError(403);
      await assert.rejects(() => fetchRun(ds, "run-123"), { message: "Failed to fetch run run-123: 403" });
    });
  });

  describe("URL construction", () => {
    it("uses custom branch when provided", async () => {
      const urls = stubFetch({ runs: [] });
      await fetchIndex({ owner: "o", repo: "r", branch: "custom-branch" });

      assert.match(urls[0], /\/o\/r\/custom-branch\//);
    });
  });
});
