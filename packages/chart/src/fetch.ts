import type { IndexFile, SeriesFile, BenchmarkResult } from "@benchkit/format";

export interface DataSource {
  owner: string;
  repo: string;
  branch?: string;
}

function rawUrl(ds: DataSource, path: string): string {
  const branch = ds.branch ?? "bench-data";
  return `https://raw.githubusercontent.com/${ds.owner}/${ds.repo}/${branch}/${path}`;
}

export async function fetchIndex(ds: DataSource): Promise<IndexFile> {
  const res = await fetch(rawUrl(ds, "data/index.json"));
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);
  return res.json() as Promise<IndexFile>;
}

export async function fetchSeries(
  ds: DataSource,
  metric: string,
): Promise<SeriesFile> {
  const res = await fetch(rawUrl(ds, `data/series/${metric}.json`));
  if (!res.ok) throw new Error(`Failed to fetch series/${metric}: ${res.status}`);
  return res.json() as Promise<SeriesFile>;
}

export async function fetchRun(
  ds: DataSource,
  runId: string,
): Promise<BenchmarkResult> {
  const res = await fetch(rawUrl(ds, `data/runs/${runId}.json`));
  if (!res.ok) throw new Error(`Failed to fetch run ${runId}: ${res.status}`);
  return res.json() as Promise<BenchmarkResult>;
}
