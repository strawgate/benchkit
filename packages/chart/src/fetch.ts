import type { IndexFile, SeriesFile, BenchmarkResult } from "@benchkit/format";

export interface DataSource {
  owner?: string;
  repo?: string;
  branch?: string;
  /** Absolute URL override — if set, owner/repo/branch are ignored. */
  baseUrl?: string;
}

export function rawUrl(ds: DataSource, filePath: string): string {
  if (ds.baseUrl) {
    return `${ds.baseUrl.replace(/\/+$/, "")}/${filePath.replace(/^\/+/, "")}`;
  }
  if (!ds.owner || !ds.repo) {
    throw new Error("DataSource must have either baseUrl or owner+repo");
  }
  const branch = ds.branch ?? "bench-data";
  return `https://raw.githubusercontent.com/${ds.owner}/${ds.repo}/${branch}/${filePath}`;
}

async function fetchJson<T>(ds: DataSource, filePath: string, signal?: AbortSignal): Promise<T> {
  const url = rawUrl(ds, filePath);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchIndex(ds: DataSource, signal?: AbortSignal): Promise<IndexFile> {
  return fetchJson<IndexFile>(ds, "data/index.json", signal);
}

export function fetchSeries(ds: DataSource, metric: string, signal?: AbortSignal): Promise<SeriesFile> {
  return fetchJson<SeriesFile>(ds, `data/series/${metric}.json`, signal);
}

export function fetchRun(ds: DataSource, runId: string, signal?: AbortSignal): Promise<BenchmarkResult> {
  return fetchJson<BenchmarkResult>(ds, `data/runs/${runId}.json`, signal);
}
