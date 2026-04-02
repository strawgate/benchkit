import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./parse.js";

describe("parse (auto-detect)", () => {
  it("detects native format", () => {
    const input = JSON.stringify({
      benchmarks: [
        { name: "test", metrics: { eps: { value: 100 } } },
      ],
    });
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "test");
  });

  it("detects benchmark-action format", () => {
    const input = JSON.stringify([
      { name: "Bench", value: 42, unit: "ns/op" },
    ]);
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "Bench");
  });

  it("detects Go bench format", () => {
    const input = `BenchmarkFoo-8    10000    1234 ns/op`;
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "BenchmarkFoo");
  });

  it("detects Rust bench format", () => {
    const input = `test sort::bench_sort   ... bench:         320 ns/iter (+/- 42)`;
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "sort::bench_sort");
  });

  it("detects Hyperfine format", () => {
    const input = JSON.stringify({
      results: [{ command: "sleep 1", mean: 1.0 }],
    });
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "sleep 1");
  });

  it("detects OTLP metrics format", () => {
    const input = JSON.stringify({
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: "benchkit.run_id", value: { stringValue: "run-1" } },
              { key: "benchkit.kind", value: { stringValue: "workflow" } },
              { key: "benchkit.source_format", value: { stringValue: "otlp" } },
            ],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "events_per_sec",
                  unit: "events/sec",
                  gauge: {
                    dataPoints: [
                      {
                        attributes: [
                          { key: "benchkit.scenario", value: { stringValue: "json-ingest" } },
                          { key: "benchkit.series", value: { stringValue: "mock-http-ingest" } },
                          { key: "benchkit.metric.direction", value: { stringValue: "bigger_is_better" } },
                        ],
                        timeUnixNano: "1711929600000000000",
                        asDouble: 13240.5,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "json-ingest");
  });

  it("throws on unrecognized input", () => {
    assert.throws(() => parse("totally unknown format"), {
      message: /Could not auto-detect/,
    });
  });

  it("respects explicit format override", () => {
    const input = `BenchmarkBar-4    5000    999 ns/op`;
    const result = parse(input, "go");
    assert.equal(result.benchmarks[0].name, "BenchmarkBar");
  });

  it("supports explicit otlp format override", () => {
    const input = JSON.stringify({
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: "benchkit.run_id", value: { stringValue: "run-1" } },
              { key: "benchkit.kind", value: { stringValue: "workflow" } },
              { key: "benchkit.source_format", value: { stringValue: "otlp" } },
            ],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "service_rss_mb",
                  unit: "MB",
                  gauge: {
                    dataPoints: [
                      {
                        attributes: [
                          { key: "benchkit.scenario", value: { stringValue: "json-ingest" } },
                          { key: "benchkit.series", value: { stringValue: "mock-http-ingest" } },
                          { key: "benchkit.metric.direction", value: { stringValue: "smaller_is_better" } },
                        ],
                        timeUnixNano: "1711929600000000000",
                        asDouble: 543.1,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = parse(input, "otlp");
    assert.equal(result.benchmarks[0].metrics.service_rss_mb.value, 543.1);
  });

  it("throws on empty input", () => {
    assert.throws(() => parse(""), {
      message: /Could not auto-detect/,
    });
  });

  it("throws on whitespace-only input", () => {
    assert.throws(() => parse("   \n\t  \n  "), {
      message: /Could not auto-detect/,
    });
  });

  it("throws on invalid JSON that looks like JSON", () => {
    assert.throws(() => parse("[{malformed"), {
      message: /Could not auto-detect/,
    });
  });

  it("detects Go bench format with extra preamble lines", () => {
    const input = [
      "=== RUN   TestSomething",
      "--- PASS: TestSomething (0.00s)",
      "goos: linux",
      "goarch: amd64",
      "BenchmarkFoo-8    10000    1234 ns/op",
      "ok      github.com/example/pkg  1.234s",
    ].join("\n");
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "BenchmarkFoo");
  });

  it("throws on JSON with unexpected shape", () => {
    assert.throws(() => parse(JSON.stringify({ foo: "bar" })), {
      message: /Could not auto-detect/,
    });
  });

  it("detects benchmark-action format with extra fields", () => {
    const input = JSON.stringify([
      { name: "Sort", value: 100, unit: "ns/op", group: "Group1", extra: "ignored" },
    ]);
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "Sort");
  });

  it("detects native format with minimal valid structure", () => {
    const input = JSON.stringify({
      benchmarks: [{ name: "min", metrics: { value: { value: 1 } } }],
    });
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "min");
  });

  it("throws when JSON is embedded in surrounding plain text", () => {
    const input = `some preamble text\n${JSON.stringify({ benchmarks: [] })}\nsome trailing text`;
    assert.throws(() => parse(input), {
      message: /Could not auto-detect/,
    });
  });
});
