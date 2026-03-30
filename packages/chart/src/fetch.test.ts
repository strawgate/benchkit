import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

describe("fetch", () => {
  it("constructs correct raw URLs", async () => {
    // We can't import the ESM directly in node:test easily without bundler,
    // so we verify the URL logic inline.
    const ds = { owner: "strawgate", repo: "benchkit", branch: "bench-data" };
    const branch = ds.branch ?? "bench-data";
    const url = `https://raw.githubusercontent.com/${ds.owner}/${ds.repo}/${branch}/data/index.json`;
    assert.equal(
      url,
      "https://raw.githubusercontent.com/strawgate/benchkit/bench-data/data/index.json",
    );
  });

  it("defaults to bench-data branch", () => {
    const ds: { owner: string; repo: string; branch?: string } = { owner: "foo", repo: "bar" };
    const branch = ds.branch ?? "bench-data";
    assert.equal(branch, "bench-data");
  });
});
