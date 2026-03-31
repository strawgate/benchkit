import type { SeriesFile } from "@benchkit/format";

/** Extracts all unique tag keys and their possible values from a collection of SeriesFiles. */
export function extractTags(seriesMap: Map<string, SeriesFile>): Record<string, string[]> {
  const tagMap: Record<string, Set<string>> = {};
  for (const sf of seriesMap.values()) {
    for (const entry of Object.values(sf.series)) {
      if (entry.tags) {
        for (const [key, value] of Object.entries(entry.tags)) {
          if (!tagMap[key]) tagMap[key] = new Set();
          tagMap[key].add(value);
        }
      }
    }
  }
  const result: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(tagMap)) {
    result[key] = [...values].sort();
  }
  return result;
}

/** Filters a SeriesFile so only entries matching all active filters are included. */
export function filterSeriesFile(sf: SeriesFile, activeFilters: Record<string, string>): SeriesFile {
  if (Object.keys(activeFilters).length === 0) return sf;
  const filtered: SeriesFile["series"] = {};
  for (const [name, entry] of Object.entries(sf.series)) {
    const tags = entry.tags ?? {};
    const matches = Object.entries(activeFilters).every(([k, v]) => tags[k] === v);
    if (matches) filtered[name] = entry;
  }
  return { ...sf, series: filtered };
}

export interface TagFilterProps {
  seriesMap: Map<string, SeriesFile>;
  activeFilters: Record<string, string>;
  onFilterChange: (filters: Record<string, string>) => void;
}

export function TagFilter({ seriesMap, activeFilters, onFilterChange }: TagFilterProps) {
  const availableTags = extractTags(seriesMap);
  const tagKeys = Object.keys(availableTags);

  if (tagKeys.length === 0) return null;

  function toggle(key: string, value: string) {
    const next = { ...activeFilters };
    if (next[key] === value) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onFilterChange(next);
  }

  function clearAll() {
    onFilterChange({});
  }

  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
      {tagKeys.map((key) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 600, marginRight: "2px" }}>{key}:</span>
          {availableTags[key].map((value) => {
            const active = activeFilters[key] === value;
            return (
              <button
                key={value}
                onClick={() => toggle(key, value)}
                style={{
                  padding: "2px 8px",
                  borderRadius: "12px",
                  border: "1px solid",
                  borderColor: active ? "#3b82f6" : "#d1d5db",
                  background: active ? "#3b82f6" : "#fff",
                  color: active ? "#fff" : "#374151",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {value}
              </button>
            );
          })}
        </div>
      ))}
      {hasActiveFilters && (
        <button
          onClick={clearAll}
          style={{
            padding: "2px 8px",
            borderRadius: "12px",
            border: "1px solid #f87171",
            background: "#fff",
            color: "#ef4444",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
