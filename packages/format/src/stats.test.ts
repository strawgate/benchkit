import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mean, stddev, zScoreTest, tTest } from "./stats.js";

describe("stats", () => {
  it("calculates mean correctly", () => {
    assert.equal(mean([10, 20, 30]), 20);
    assert.equal(mean([1, 2, 3, 4]), 2.5);
    assert.equal(mean([]), 0);
  });

  it("calculates sample stddev correctly", () => {
    // [10, 20, 30] -> mean=20, squares=(100+0+100)=200, df=2, var=100, sd=10
    assert.equal(stddev([10, 20, 30]), 10);
    assert.equal(stddev([1]), 0);
    assert.equal(stddev([]), 0);
  });

  describe("zScoreTest", () => {
    it("detects regression (smaller_is_better)", () => {
      // To keep it simple, let's use values that clearly have a mean and SD
      const simpleBaseline = [90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110, 90, 110];
      // mean=100, sd=10.34
      const status = zScoreTest(140, simpleBaseline, 1.96, "smaller_is_better");
      assert.equal(status, "regressed");
    });

    it("detects stable (smaller_is_better)", () => {
      const simpleBaseline = Array(30).fill(100);
      simpleBaseline[0] = 90;
      simpleBaseline[1] = 110;
      // SD will be small, but let's just test logic
      const status = zScoreTest(101, simpleBaseline, 3, "smaller_is_better");
      assert.equal(status, "stable");
    });
  });

  describe("tTest", () => {
    it("detects regression (smaller_is_better)", () => {
      const baseline = [90, 110, 100, 100, 100]; // mean=100, n=5, df=4, sd=7.07
      // t = (120 - 100) / (7.07 * sqrt(1 + 1/5)) = 20 / (7.07 * 1.095) = 20 / 7.74 = 2.58
      // T_CRITICAL_95[4] = 2.776
      // 2.58 < 2.776 -> stable
      assert.equal(tTest(120, baseline, 95, "smaller_is_better"), "stable");

      // t = (130 - 100) / 7.74 = 3.87
      // 3.87 > 2.776 -> regressed
      assert.equal(tTest(130, baseline, 95, "smaller_is_better"), "regressed");
    });

    it("detects improvement (bigger_is_better)", () => {
        const baseline = [90, 110, 100, 100, 100];
        assert.equal(tTest(130, baseline, 95, "bigger_is_better"), "improved");
    });
  });
});
