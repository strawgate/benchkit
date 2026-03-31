import { ComparisonStatus } from "./types.js";

/**
 * Calculates the arithmetic mean of a numeric array.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculates the sample standard deviation of a numeric array.
 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const sumSquareDiff = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0);
  return Math.sqrt(sumSquareDiff / (values.length - 1));
}

// Critical values for two-tailed Z-test (Standard Normal Distribution)
const Z_CRITICAL: Record<number, number> = {
  80: 1.282,
  90: 1.645,
  95: 1.96,
  98: 2.326,
  99: 2.576,
  0.80: 1.282,
  0.90: 1.645,
  0.95: 1.96,
  0.98: 2.326,
  0.99: 2.576,
};

/**
 * Critical values for two-tailed Student's t-test at 95% confidence level.
 * Indexed by degrees of freedom (df = n - 1).
 */
const T_CRITICAL_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
};

/**
 * Returns the critical value for a Z-test at the given confidence level.
 */
export function zCriticalValue(confidence: number): number {
  return Z_CRITICAL[confidence] ?? 1.96; // Default to 95%
}

/**
 * Returns the critical value for a T-test at the given degrees of freedom and confidence level.
 */
export function tCriticalValue(df: number, confidence: number): number {
  if (df <= 0) return Infinity;
  if (df > 30) return zCriticalValue(confidence);
  // Defaulting to 95% table as it's the most common and we only have one table for now.
  return T_CRITICAL_95[df] ?? 1.96;
}

/**
 * Performs a Z-test comparison.
 * If threshold is small (< 10), it's treated as number of sigmas.
 * If threshold is large (>= 10), it's treated as confidence percentage.
 */
export function zScoreTest(
  current: number,
  baselineValues: number[],
  threshold: number,
  direction: "bigger_is_better" | "smaller_is_better"
): ComparisonStatus {
  const avg = mean(baselineValues);
  const sd = stddev(baselineValues);

  if (sd === 0) {
    if (current === avg) return "stable";
    const isHigher = current > avg;
    return isHigher === (direction === "smaller_is_better") ? "regressed" : "improved";
  }

  const z = (current - avg) / sd;
  const criticalZ = threshold >= 10 ? zCriticalValue(threshold) : threshold;

  if (Math.abs(z) <= criticalZ) return "stable";
  return z > 0
    ? direction === "smaller_is_better" ? "regressed" : "improved"
    : direction === "smaller_is_better" ? "improved" : "regressed";
}

/**
 * Performs a Student's t-test comparison using a prediction interval.
 * If threshold is small (< 10), it's treated as a direct critical value.
 * If threshold is large (>= 10), it's treated as confidence percentage.
 */
export function tTest(
  current: number,
  baselineValues: number[],
  threshold: number,
  direction: "bigger_is_better" | "smaller_is_better"
): ComparisonStatus {
  const n = baselineValues.length;
  const avg = mean(baselineValues);
  const sd = stddev(baselineValues);

  if (sd === 0) {
    if (current === avg) return "stable";
    const isHigher = current > avg;
    return isHigher === (direction === "smaller_is_better") ? "regressed" : "improved";
  }

  // Prediction interval for a single new observation: t = (x_new - mean) / (sd * sqrt(1 + 1/n))
  const t = (current - avg) / (sd * Math.sqrt(1 + 1 / n));
  const df = n - 1;
  const criticalT = threshold >= 10 ? tCriticalValue(df, threshold) : threshold;

  if (Math.abs(t) <= criticalT) return "stable";
  return t > 0
    ? direction === "smaller_is_better" ? "regressed" : "improved"
    : direction === "smaller_is_better" ? "improved" : "regressed";
}
