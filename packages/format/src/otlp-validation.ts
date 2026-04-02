/**
 * Runtime validators for the benchkit OTLP semantic contract.
 *
 * These validators enforce the required attributes documented in
 * docs/otlp-semantic-conventions.md. They throw descriptive errors that
 * guide producers toward compliance.
 */

import {
  ATTR_KIND,
  ATTR_METRIC_DIRECTION,
  ATTR_METRIC_ROLE,
  ATTR_RUN_ID,
  ATTR_SCENARIO,
  ATTR_SERIES,
  ATTR_SOURCE_FORMAT,
  MONITOR_METRIC_PREFIX,
  VALID_DIRECTIONS,
  VALID_METRIC_ROLES,
  VALID_RUN_KINDS,
  VALID_SOURCE_FORMATS,
  type Direction,
  type MetricRole,
  type RunKind,
  type SourceFormat,
} from "./otlp-conventions.js";

// ---------------------------------------------------------------------------
// Resource attribute validation
// ---------------------------------------------------------------------------

/**
 * Validates that all required resource-level attributes are present and valid.
 * Throws with a descriptive message on the first violation found.
 */
export function validateRequiredResourceAttributes(
  attrs: Record<string, string>,
): void {
  requireAttribute(attrs, ATTR_RUN_ID);
  validateRunKind(attrs[ATTR_KIND]);
  validateSourceFormat(attrs[ATTR_SOURCE_FORMAT]);
}

// ---------------------------------------------------------------------------
// Datapoint attribute validation
// ---------------------------------------------------------------------------

/**
 * Validates that required datapoint-level attributes are present.
 *
 * For non-monitor metrics, `benchkit.scenario` and `benchkit.series` are
 * required. Monitor metrics (`_monitor.*`) are exempt since they default
 * to `"diagnostic"` scenario.
 */
export function validateRequiredDatapointAttributes(
  attrs: Record<string, string>,
  metricName: string,
): void {
  if (isMonitorMetric(metricName)) return;

  requireAttribute(attrs, ATTR_SCENARIO);
  requireAttribute(attrs, ATTR_SERIES);
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Returns true if `value` is a valid `benchkit.kind`. */
export function isValidRunKind(value: string): value is RunKind {
  return (VALID_RUN_KINDS as readonly string[]).includes(value);
}

/** Validates and returns a `RunKind`, or throws. */
export function validateRunKind(value: string | undefined): RunKind {
  if (!value) {
    throw new Error(
      `Missing required attribute '${ATTR_KIND}'. ` +
        `Expected one of: ${VALID_RUN_KINDS.join(", ")}.`,
    );
  }
  if (!isValidRunKind(value)) {
    throw new Error(
      `Invalid '${ATTR_KIND}' value '${value}'. ` +
        `Expected one of: ${VALID_RUN_KINDS.join(", ")}.`,
    );
  }
  return value;
}

/** Returns true if `value` is a valid `benchkit.metric.direction`. */
export function isValidDirection(value: string): value is Direction {
  return (VALID_DIRECTIONS as readonly string[]).includes(value);
}

/** Validates and returns a `Direction`, or throws. */
export function validateDirection(value: string | undefined): Direction {
  if (!value) {
    throw new Error(
      `Missing required attribute '${ATTR_METRIC_DIRECTION}'. ` +
        `Expected one of: ${VALID_DIRECTIONS.join(", ")}.`,
    );
  }
  if (!isValidDirection(value)) {
    throw new Error(
      `Invalid '${ATTR_METRIC_DIRECTION}' value '${value}'. ` +
        `Expected one of: ${VALID_DIRECTIONS.join(", ")}.`,
    );
  }
  return value;
}

/** Returns true if `value` is a valid `benchkit.metric.role`. */
export function isValidMetricRole(value: string): value is MetricRole {
  return (VALID_METRIC_ROLES as readonly string[]).includes(value);
}

/** Validates and returns a `MetricRole`, or throws. */
export function validateMetricRole(value: string | undefined): MetricRole {
  if (!value) {
    throw new Error(
      `Missing required attribute '${ATTR_METRIC_ROLE}'. ` +
        `Expected one of: ${VALID_METRIC_ROLES.join(", ")}.`,
    );
  }
  if (!isValidMetricRole(value)) {
    throw new Error(
      `Invalid '${ATTR_METRIC_ROLE}' value '${value}'. ` +
        `Expected one of: ${VALID_METRIC_ROLES.join(", ")}.`,
    );
  }
  return value;
}

/** Returns true if `value` is a valid `benchkit.source_format`. */
export function isValidSourceFormat(value: string): value is SourceFormat {
  return (VALID_SOURCE_FORMATS as readonly string[]).includes(value);
}

/** Validates and returns a `SourceFormat`, or throws. */
export function validateSourceFormat(
  value: string | undefined,
): SourceFormat {
  if (!value) {
    throw new Error(
      `Missing required attribute '${ATTR_SOURCE_FORMAT}'. ` +
        `Expected one of: ${VALID_SOURCE_FORMATS.join(", ")}.`,
    );
  }
  if (!isValidSourceFormat(value)) {
    throw new Error(
      `Invalid '${ATTR_SOURCE_FORMAT}' value '${value}'. ` +
        `Expected one of: ${VALID_SOURCE_FORMATS.join(", ")}.`,
    );
  }
  return value;
}

/** Returns true if the metric name uses the reserved `_monitor.` prefix. */
export function isMonitorMetric(name: string): boolean {
  return name.startsWith(MONITOR_METRIC_PREFIX);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requireAttribute(
  attrs: Record<string, string>,
  key: string,
): void {
  if (!attrs[key]) {
    throw new Error(`Missing required attribute '${key}'.`);
  }
}
