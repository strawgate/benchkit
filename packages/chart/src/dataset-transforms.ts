import type { DataPoint, SeriesFile, SeriesEntry } from "@benchkit/format";

export type DatasetAggregate = "sum" | "avg" | "max";

export interface DatasetFilter {
  key: string;
  values: string[];
  exclude?: boolean;
}

/**
 * Options for transforming a single fetched SeriesFile dataset.
 *
 * All operations are intentionally scoped to the one dataset passed in:
 * there are no cross-file joins, no remote queries, and no branch-wide
 * discovery.  The API is safe to call in a browser component that already
 * holds the dataset in memory.
 *
 * Typical pipeline (applied in order):
 *   1. `metric`        – override which metric name is reported on the result
 *   2. `filters`       – keep/exclude series by tag values
 *   3. `groupByTag`    – collapse matching series into one aggregated series
 *   4. `aggregate`     – statistic applied during grouping (default: "sum")
 *   5. `sortByLatest`  – reorder surviving series by their most-recent value
 *   6. `limit`         – keep only the first N series (top-k when combined
 *                        with `sortByLatest: "desc"`)
 */
export interface TransformSeriesDatasetOptions {
  /** Override the `metric` field on the returned SeriesFile. */
  metric?: string;
  /** Keep or exclude series whose tags match the given conditions. */
  filters?: DatasetFilter[];
  /** Collapse series that share the same value for this tag into one series. */
  groupByTag?: string;
  /** Statistic used when collapsing series during `groupByTag`. Default: "sum". */
  aggregate?: DatasetAggregate;
  /** Sort surviving series by their latest data-point value. */
  sortByLatest?: "asc" | "desc";
  /** Keep only the first N series after sorting (top-k when used with sortByLatest: "desc"). */
  limit?: number;
}

function latestValue(entry: SeriesEntry): number {
  return entry.points[entry.points.length - 1]?.value ?? Number.NaN;
}

function filterEntry(entry: SeriesEntry, filters: DatasetFilter[]): boolean {
  if (filters.length === 0) return true;
  const tags = entry.tags ?? {};
  return filters.every((filter) => {
    const tagValue = tags[filter.key];
    const matches = tagValue !== undefined && filter.values.includes(tagValue);
    return filter.exclude ? !matches : matches;
  });
}

function aggregatePoints(entries: SeriesEntry[], aggregate: DatasetAggregate): DataPoint[] {
  const byTimestamp = new Map<string, number[]>();
  for (const entry of entries) {
    for (const point of entry.points) {
      const values = byTimestamp.get(point.timestamp);
      if (values) values.push(point.value);
      else byTimestamp.set(point.timestamp, [point.value]);
    }
  }

  return [...byTimestamp.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([timestamp, values]) => {
      const value = aggregate === "sum"
        ? values.reduce((sum, current) => sum + current, 0)
        : aggregate === "max"
          ? Math.max(...values)
          : values.reduce((sum, current) => sum + current, 0) / values.length;
      return { timestamp, value };
    });
}

/**
 * Returns a human-readable label for a series produced by `groupByTag`.
 *
 * For example, `formatGroupLabel("process", "worker")` returns `"worker"` while
 * `formatGroupLabel("process", "__missing__")` returns `"(no process)"`.
 */
export function formatGroupLabel(groupByTag: string, groupKey: string): string {
  if (groupKey === "__missing__") return `(no ${groupByTag})`;
  return groupKey;
}

/**
 * Converts the simple `Record<string, string>` tag-filter shape used by
 * `TagFilter` / `filterSeriesFile` into the `DatasetFilter[]` array accepted
 * by `transformSeriesDataset`.
 *
 * Each key-value pair becomes an inclusive single-value filter.
 */
export function filtersFromTagRecord(activeFilters: Record<string, string>): DatasetFilter[] {
  return Object.entries(activeFilters).map(([key, value]) => ({ key, values: [value] }));
}

/**
 * Apply a bounded, dataset-local transform pipeline to a single SeriesFile.
 *
 * Operations are applied in order: filter → group → sort → limit.
 * No cross-file joins are performed; the function is safe to call in a browser
 * component that already holds the dataset in memory.
 */
export function transformSeriesDataset(
  series: SeriesFile,
  options: TransformSeriesDatasetOptions = {},
): SeriesFile {
  const filters = options.filters ?? [];
  const aggregate = options.aggregate ?? "sum";
  let entries = Object.entries(series.series)
    .filter(([, entry]) => filterEntry(entry, filters));

  if (options.groupByTag) {
    const groupByTag = options.groupByTag;
    const groups = new Map<string, SeriesEntry[]>();
    for (const [, entry] of entries) {
      const groupKey = entry.tags?.[groupByTag] ?? "__missing__";
      const existing = groups.get(groupKey);
      if (existing) existing.push(entry);
      else groups.set(groupKey, [entry]);
    }

    entries = [...groups.entries()].map(([groupKey, groupEntries]) => [
      `${groupByTag}=${groupKey}`,
      {
        tags: { [groupByTag]: groupKey },
        points: aggregatePoints(groupEntries, aggregate),
      },
    ]);
  }

  if (options.sortByLatest) {
    entries.sort((left, right) => {
      const leftValue = latestValue(left[1]);
      const rightValue = latestValue(right[1]);
      return options.sortByLatest === "asc"
        ? leftValue - rightValue
        : rightValue - leftValue;
    });
  }

  if (options.limit && options.limit > 0) {
    entries = entries.slice(0, options.limit);
  }

  return {
    ...series,
    metric: options.metric ?? series.metric,
    series: Object.fromEntries(entries),
  };
}
