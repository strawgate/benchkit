import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getFetchFailureMessage } from "./git-fetch.js";

describe("getFetchFailureMessage", () => {
  it("returns guidance when git fetch refuses because the branch is checked out", () => {
    const stderr = [
      "fatal: refusing to fetch into branch 'bench-data' checked out",
      "in repository '/home/runner/work/repo/repo'",
    ].join("\n");

    assert.match(
      getFetchFailureMessage("bench-data", stderr) ?? "",
      /Remove the 'ref: bench-data' input from your actions\/checkout step/,
    );
  });

  it("returns undefined for unrelated fetch failures", () => {
    assert.equal(
      getFetchFailureMessage("bench-data", "fatal: couldn't find remote ref bench-data"),
      undefined,
    );
  });
});
