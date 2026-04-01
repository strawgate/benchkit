import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getNestedValue,
  collectFromJson,
  parsePrometheusText,
  parseLabels,
  labelsMatch,
  collectFromPrometheus,
  buildCollectResult,
  type JsonMetricMapping,
  type PrometheusMetricRequest,
} from "./collect.js";

// ── getNestedValue ───────────────────────────────────────────────────

describe("getNestedValue", () => {
  it("returns a top-level number field", () => {
    assert.equal(getNestedValue({ events_per_sec: 1500 }, "events_per_sec"), 1500);
  });

  it("returns a nested number field via dot-notation", () => {
    assert.equal(getNestedValue({ system: { rss_mb: 42.5 } }, "system.rss_mb"), 42.5);
  });

  it("returns a deeply nested field", () => {
    assert.equal(getNestedValue({ a: { b: { c: 99 } } }, "a.b.c"), 99);
  });

  it("returns undefined for a missing field", () => {
    assert.equal(getNestedValue({ x: 1 }, "missing"), undefined);
  });

  it("returns undefined when a path segment is not an object", () => {
    assert.equal(getNestedValue({ a: 1 }, "a.b"), undefined);
  });

  it("returns undefined for a non-number leaf", () => {
    assert.equal(getNestedValue({ name: "hello" }, "name"), undefined);
  });

  it("returns undefined for null input", () => {
    assert.equal(getNestedValue(null, "field"), undefined);
  });
});

// ── collectFromJson ──────────────────────────────────────────────────

describe("collectFromJson", () => {
  const data = {
    events_per_sec: 15230,
    system: { rss_mb: 128.4 },
  };

  it("maps top-level fields to metrics", () => {
    const mappings: JsonMetricMapping[] = [
      { field: "events_per_sec", name: "events_per_sec", unit: "count/s", direction: "bigger_is_better" },
    ];
    const result = collectFromJson(data, mappings);
    assert.deepEqual(result, {
      events_per_sec: { value: 15230, unit: "count/s", direction: "bigger_is_better" },
    });
  });

  it("maps nested fields with dot-notation", () => {
    const mappings: JsonMetricMapping[] = [
      { field: "system.rss_mb", name: "rss_mb", unit: "MB", direction: "smaller_is_better" },
    ];
    const result = collectFromJson(data, mappings);
    assert.deepEqual(result, {
      rss_mb: { value: 128.4, unit: "MB", direction: "smaller_is_better" },
    });
  });

  it("maps multiple fields in one call", () => {
    const mappings: JsonMetricMapping[] = [
      { field: "events_per_sec", name: "eps" },
      { field: "system.rss_mb", name: "rss" },
    ];
    const result = collectFromJson(data, mappings);
    assert.equal(Object.keys(result).length, 2);
    assert.equal(result.eps.value, 15230);
    assert.equal(result.rss.value, 128.4);
  });

  it("omits unit and direction when not specified", () => {
    const mappings: JsonMetricMapping[] = [
      { field: "events_per_sec", name: "eps" },
    ];
    const result = collectFromJson(data, mappings);
    assert.equal(result.eps.unit, undefined);
    assert.equal(result.eps.direction, undefined);
  });

  it("throws when the field is missing", () => {
    const mappings: JsonMetricMapping[] = [
      { field: "nonexistent", name: "x" },
    ];
    assert.throws(
      () => collectFromJson(data, mappings),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("nonexistent"), `Got: ${err.message}`);
        return true;
      },
    );
  });

  it("throws when the field is not a number", () => {
    const mappings: JsonMetricMapping[] = [
      { field: "system", name: "x" },  // object, not a number
    ];
    assert.throws(
      () => collectFromJson({ system: {} }, mappings),
      /not a number/,
    );
  });
});

// ── parseLabels ──────────────────────────────────────────────────────

describe("parseLabels", () => {
  it("parses a single label", () => {
    assert.deepEqual(parseLabels('method="get"'), { method: "get" });
  });

  it("parses multiple labels", () => {
    assert.deepEqual(
      parseLabels('method="post",code="200"'),
      { method: "post", code: "200" },
    );
  });

  it("returns empty object for empty string", () => {
    assert.deepEqual(parseLabels(""), {});
  });

  it("handles escaped quotes inside values", () => {
    const result = parseLabels('label="foo\\"bar"');
    assert.equal(result.label, 'foo"bar');
  });
});

// ── labelsMatch ──────────────────────────────────────────────────────

describe("labelsMatch", () => {
  const entryLabels = { method: "post", code: "200", job: "api" };

  it("returns true when filter is empty", () => {
    assert.ok(labelsMatch(entryLabels, {}));
  });

  it("returns true when all filter keys match", () => {
    assert.ok(labelsMatch(entryLabels, { method: "post", code: "200" }));
  });

  it("returns false when a filter key does not match", () => {
    assert.ok(!labelsMatch(entryLabels, { method: "get" }));
  });

  it("returns false when a filter key is missing from entry", () => {
    assert.ok(!labelsMatch(entryLabels, { region: "us-east-1" }));
  });
});

// ── parsePrometheusText ──────────────────────────────────────────────

describe("parsePrometheusText", () => {
  const sampleText = `
# HELP http_requests_total The total number of HTTP requests.
# TYPE http_requests_total counter
http_requests_total{method="post",code="200"} 1027
http_requests_total{method="post",code="400"} 3
# HELP process_resident_memory_bytes Resident memory size in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 1.155e+07
`.trim();

  it("skips comment lines", () => {
    const entries = parsePrometheusText(sampleText);
    assert.ok(entries.every((e) => !e.name.startsWith("#")));
  });

  it("parses metric names", () => {
    const entries = parsePrometheusText(sampleText);
    const names = entries.map((e) => e.name);
    assert.ok(names.includes("http_requests_total"));
    assert.ok(names.includes("process_resident_memory_bytes"));
  });

  it("parses labels", () => {
    const entries = parsePrometheusText(sampleText);
    const req200 = entries.find(
      (e) => e.name === "http_requests_total" && e.labels.code === "200",
    );
    assert.ok(req200);
    assert.equal(req200.labels.method, "post");
    assert.equal(req200.value, 1027);
  });

  it("parses metrics without labels", () => {
    const entries = parsePrometheusText(sampleText);
    const mem = entries.find((e) => e.name === "process_resident_memory_bytes");
    assert.ok(mem);
    assert.deepEqual(mem.labels, {});
    assert.ok(mem.value > 0);
  });

  it("handles lines with timestamps", () => {
    const text = "http_requests_total 42 1395066363000";
    const entries = parsePrometheusText(text);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].value, 42);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(parsePrometheusText(""), []);
  });

  it("returns empty array for only comments", () => {
    assert.deepEqual(
      parsePrometheusText("# HELP foo A metric\n# TYPE foo gauge"),
      [],
    );
  });
});

// ── collectFromPrometheus ────────────────────────────────────────────

describe("collectFromPrometheus", () => {
  const entries: import("./collect.js").PrometheusEntry[] = [
    { name: "http_requests_total", labels: { method: "post", code: "200" }, value: 1027 },
    { name: "http_requests_total", labels: { method: "post", code: "400" }, value: 3 },
    { name: "process_resident_memory_bytes", labels: {}, value: 11_550_720 },
  ];

  it("collects a simple metric without labels", () => {
    const requests: PrometheusMetricRequest[] = [
      { metric: "process_resident_memory_bytes", name: "rss_bytes", unit: "bytes", direction: "smaller_is_better" },
    ];
    const result = collectFromPrometheus(entries, requests);
    assert.deepEqual(result, {
      rss_bytes: { value: 11_550_720, unit: "bytes", direction: "smaller_is_better" },
    });
  });

  it("sums matching entries when no label filter is applied", () => {
    const requests: PrometheusMetricRequest[] = [
      { metric: "http_requests_total", name: "http_requests" },
    ];
    const result = collectFromPrometheus(entries, requests);
    assert.equal(result.http_requests.value, 1030);
  });

  it("applies a global label filter", () => {
    const requests: PrometheusMetricRequest[] = [
      { metric: "http_requests_total", name: "http_200_requests" },
    ];
    const result = collectFromPrometheus(entries, requests, { code: "200" });
    assert.equal(result.http_200_requests.value, 1027);
  });

  it("applies a per-request label filter", () => {
    const requests: PrometheusMetricRequest[] = [
      { metric: "http_requests_total", name: "http_400_requests", labels: { code: "400" } },
    ];
    const result = collectFromPrometheus(entries, requests);
    assert.equal(result.http_400_requests.value, 3);
  });

  it("merges global and per-request filters", () => {
    const requests: PrometheusMetricRequest[] = [
      { metric: "http_requests_total", name: "post_200", labels: { code: "200" } },
    ];
    const result = collectFromPrometheus(entries, requests, { method: "post" });
    assert.equal(result.post_200.value, 1027);
  });

  it("throws when the metric is not found", () => {
    const requests: PrometheusMetricRequest[] = [
      { metric: "nonexistent_metric", name: "x" },
    ];
    assert.throws(
      () => collectFromPrometheus(entries, requests),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("nonexistent_metric"), `Got: ${err.message}`);
        return true;
      },
    );
  });

  it("throws with filter description when label filter yields no match", () => {
    const requests: PrometheusMetricRequest[] = [
      { metric: "http_requests_total", name: "x" },
    ];
    assert.throws(
      () => collectFromPrometheus(entries, requests, { code: "500" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("500"), `Got: ${err.message}`);
        return true;
      },
    );
  });
});

// ── buildCollectResult ───────────────────────────────────────────────

describe("buildCollectResult", () => {
  it("builds a BenchmarkResult with the given name and metrics", () => {
    const metrics = { rps: { value: 15230, unit: "req/s", direction: "bigger_is_better" as const } };
    const result = buildCollectResult("http-server", metrics, {});
    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "http-server");
    assert.deepEqual(result.benchmarks[0].metrics, metrics);
    assert.equal(result.benchmarks[0].tags, undefined);
  });

  it("attaches tags when provided", () => {
    const result = buildCollectResult("bench", {}, { env: "prod", region: "us-east-1" });
    assert.deepEqual(result.benchmarks[0].tags, { env: "prod", region: "us-east-1" });
  });

  it("omits tags key when tags object is empty", () => {
    const result = buildCollectResult("bench", {}, {});
    assert.equal(result.benchmarks[0].tags, undefined);
  });

  it("sets a timestamp in the context", () => {
    const result = buildCollectResult("bench", {}, {});
    assert.ok(result.context?.timestamp);
    assert.ok(!isNaN(Date.parse(result.context.timestamp!)));
  });
});
