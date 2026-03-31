import type { IndexFile, SeriesFile, BenchmarkResult } from "@benchkit/format";

export interface DataSource {
  owner?: string;
  repo?: string;
  branch?: string;
  /** Absolute URL override — if set, owner/repo/branch are ignored. */
  baseUrl?: string;
}

function rawUrl(ds: DataSource, path: string): string {
  if (ds.baseUrl) {
    return `${ds.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }
  if (!ds.owner || !ds.repo) {
    throw new Error("DataSource must have either baseUrl or owner+repo");
  }
  const branch = ds.branch ?? "bench-data";
  return `https://raw.githubusercontent.com/${ds.owner}/${ds.repo}/${branch}/${path}`;
}

export async function fetchIndex(ds: DataSource, signal?: AbortSignal): Promise<IndexFile> {
  const res = await fetch(rawUrl(ds, "data/index.json"), { signal });
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);
  return res.json() as Promise<IndexFile>;
}

export async function fetchSeries(
  ds: DataSource,
  metric: string,
  signal?: AbortSignal,
): Promise<SeriesFile> {
  const res = await fetch(rawUrl(ds, `data/series/${metric}.json`), { signal });
  if (!res.ok) throw new Error(`Failed to fetch series/${metric}: ${res.status}`);
  return res.json() as Promise<SeriesFile>;
}

export async function fetchRun(
  ds: DataSource,
  runId: string,
  signal?: AbortSignal,
): Promise<BenchmarkResult> {
  const res = await fetch(rawUrl(ds, `data/runs/${runId}.json`), { signal });
  if (!res.ok) throw new Error(`Failed to fetch run ${runId}: ${res.status}`);
  return res.json() as Promise<BenchmarkResult>;
}
