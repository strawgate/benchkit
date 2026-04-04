import type { SeriesDataPoint, SeriesFile, SeriesEntry } from "@benchkit/format";

export type DatasetAggregate = "sum" | "avg" | "max";

export interface DatasetFilter {
  key: string;
  values: string[];
  exclude?: boolean;
}

export interface TransformSeriesDatasetOptions {
  metric?: string;
  filters?: DatasetFilter[];
  groupByTag?: string;
  aggregate?: DatasetAggregate;
  sortByLatest?: "asc" | "desc";
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

function aggregatePoints(entries: SeriesEntry[], aggregate: DatasetAggregate): SeriesDataPoint[] {
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
