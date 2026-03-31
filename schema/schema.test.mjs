import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSchema(name) {
  return JSON.parse(readFileSync(resolve(__dirname, name), "utf-8"));
}

function createValidator() {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  return ajv;
}

/* ------------------------------------------------------------------ */
/*  benchmark-result.schema.json                                      */
/* ------------------------------------------------------------------ */

describe("benchmark-result schema", () => {
  const ajv = createValidator();
  const schema = loadSchema("benchmark-result.schema.json");
  const validate = ajv.compile(schema);

  it("accepts a minimal valid result", () => {
    const data = {
      benchmarks: [
        { name: "BenchmarkSort", metrics: { ns_per_op: { value: 1234 } } },
      ],
    };
    assert.equal(validate(data), true, JSON.stringify(validate.errors));
  });

  it("accepts a full result with context, tags, and samples", () => {
    const data = {
      benchmarks: [
        {
          name: "BenchmarkSearch",
          tags: { cpu: "0.5", scenario: "passthrough" },
          metrics: {
            ns_per_op: {
              value: 567,
              unit: "ns/op",
              direction: "smaller_is_better",
              range: 12,
            },
            allocs: { value: 3, unit: "allocs/op", direction: "smaller_is_better" },
          },
          samples: [
            { t: 0, ns_per_op: 600 },
            { t: 1, ns_per_op: 550 },
          ],
        },
      ],
      context: {
        commit: "abc123def456",
        ref: "main",
        timestamp: "2025-01-15T10:30:00Z",
        runner: "ubuntu-latest",
      },
    };
    assert.equal(validate(data), true, JSON.stringify(validate.errors));
  });

  it("accepts context with monitor metadata", () => {
    const data = {
      benchmarks: [
        { name: "BenchmarkSort", metrics: { ns_per_op: { value: 1234 } } },
      ],
      context: {
        commit: "abc123def456",
        ref: "main",
        timestamp: "2025-01-15T10:30:00Z",
        runner: "ubuntu-latest",
        monitor: {
          monitor_version: "0.1.0",
          poll_interval_ms: 250,
          duration_ms: 5000,
          runner_os: "Linux",
          runner_arch: "X64",
          poll_count: 20,
        },
      },
    };
    assert.equal(validate(data), true, JSON.stringify(validate.errors));
  });

  it("rejects monitor context missing required fields", () => {
    const data = {
      benchmarks: [
        { name: "BenchmarkSort", metrics: { ns_per_op: { value: 1234 } } },
      ],
      context: {
        monitor: {
          poll_interval_ms: 250,
          duration_ms: 5000,
        },
      },
    };
    assert.equal(validate(data), false);
  });

  it("rejects when benchmarks array is missing", () => {
    assert.equal(validate({}), false);
  });

  it("rejects when benchmarks array is empty", () => {
    assert.equal(validate({ benchmarks: [] }), false);
  });

  it("rejects a benchmark without name", () => {
    const data = {
      benchmarks: [{ metrics: { x: { value: 1 } } }],
    };
    assert.equal(validate(data), false);
  });

  it("rejects a benchmark without metrics", () => {
    const data = {
      benchmarks: [{ name: "Bench" }],
    };
    assert.equal(validate(data), false);
  });

  it("rejects a metric without value", () => {
    const data = {
      benchmarks: [{ name: "Bench", metrics: { x: { unit: "ns/op" } } }],
    };
    assert.equal(validate(data), false);
  });

  it("rejects an invalid direction enum", () => {
    const data = {
      benchmarks: [
        { name: "Bench", metrics: { x: { value: 1, direction: "unknown" } } },
      ],
    };
    assert.equal(validate(data), false);
  });
});

/* ------------------------------------------------------------------ */
/*  index.schema.json                                                 */
/* ------------------------------------------------------------------ */

describe("index schema", () => {
  const ajv = createValidator();
  const schema = loadSchema("index.schema.json");
  const validate = ajv.compile(schema);

  it("accepts a minimal valid index", () => {
    const data = {
      runs: [{ id: "run-1", timestamp: "2025-01-15T10:30:00Z" }],
    };
    assert.equal(validate(data), true, JSON.stringify(validate.errors));
  });

  it("accepts a full index with metrics", () => {
    const data = {
      runs: [
        {
          id: "12345-1",
          timestamp: "2025-06-01T00:00:00Z",
          commit: "abc123",
          ref: "main",
          benchmarks: 5,
          metrics: ["ns_per_op", "allocs"],
        },
        {
          id: "12345-2",
          timestamp: "2025-06-02T00:00:00Z",
          commit: "def456",
          ref: "main",
          benchmarks: 3,
          metrics: ["ns_per_op"],
        },
      ],
      metrics: ["ns_per_op", "allocs"],
    };
    assert.equal(validate(data), true, JSON.stringify(validate.errors));
  });

  it("accepts an empty runs array", () => {
    const data = { runs: [] };
    assert.equal(validate(data), true, JSON.stringify(validate.errors));
  });

  it("rejects when runs array is missing", () => {
    assert.equal(validate({}), false);
  });

  it("rejects a run entry without id", () => {
    const data = {
      runs: [{ timestamp: "2025-01-15T10:30:00Z" }],
    };
    assert.equal(validate(data), false);
  });

  it("rejects a run entry without timestamp", () => {
    const data = {
      runs: [{ id: "run-1" }],
    };
    assert.equal(validate(data), false);
  });
});

/* ------------------------------------------------------------------ */
/*  series.schema.json                                                */
/* ------------------------------------------------------------------ */

describe("series schema", () => {
  const ajv = createValidator();
  const schema = loadSchema("series.schema.json");
  const validate = ajv.compile(schema);

  it("accepts a minimal valid series", () => {
    const data = {
      metric: "ns_per_op",
      series: {
        BenchmarkSort: {
          points: [
            { timestamp: "2025-01-15T10:30:00Z", value: 1234 },
          ],
        },
      },
    };
    assert.equal(validate(data), true, JSON.stringify(validate.errors));
  });

  it("accepts a full series with tags and optional fields", () => {
    const data = {
      metric: "eps",
      unit: "events/sec",
      direction: "bigger_is_better",
      series: {
        "http-throughput|scenario=passthrough": {
          tags: { scenario: "passthrough" },
          points: [
            {
              timestamp: "2025-06-01T00:00:00Z",
              value: 50000,
              commit: "abc123",
              run_id: "12345-1",
              range: 200,
            },
            {
              timestamp: "2025-06-02T00:00:00Z",
              value: 52000,
              commit: "def456",
              run_id: "12345-2",
            },
          ],
        },
      },
    };
    assert.equal(validate(data), true, JSON.stringify(validate.errors));
  });

  it("rejects when metric is missing", () => {
    const data = {
      series: { Bench: { points: [{ timestamp: "2025-01-15T10:30:00Z", value: 1 }] } },
    };
    assert.equal(validate(data), false);
  });

  it("rejects when series is missing", () => {
    const data = { metric: "x" };
    assert.equal(validate(data), false);
  });

  it("rejects a data point without timestamp", () => {
    const data = {
      metric: "x",
      series: { Bench: { points: [{ value: 1 }] } },
    };
    assert.equal(validate(data), false);
  });

  it("rejects a data point without value", () => {
    const data = {
      metric: "x",
      series: { Bench: { points: [{ timestamp: "2025-01-15T10:30:00Z" }] } },
    };
    assert.equal(validate(data), false);
  });

  it("rejects an invalid direction enum", () => {
    const data = {
      metric: "x",
      direction: "invalid",
      series: { Bench: { points: [] } },
    };
    assert.equal(validate(data), false);
  });
});
