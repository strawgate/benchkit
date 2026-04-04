import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { directionLabel, formatDirection } from "./index.js";

describe("package root exports", () => {
  it("keeps directionLabel as a compatibility alias for formatDirection", () => {
    assert.equal(directionLabel("smaller_is_better"), formatDirection("smaller_is_better"));
    assert.equal(directionLabel("bigger_is_better"), formatDirection("bigger_is_better"));
    assert.equal(directionLabel("sideways_is_better"), formatDirection("sideways_is_better"));
  });
});
