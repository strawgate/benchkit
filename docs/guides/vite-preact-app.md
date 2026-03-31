# Custom Dashboard with Vite + Preact

This guide shows how to build a standalone benchmark dashboard application using Vite and Preact.

## Prerequisites

- Node.js 20+
- npm 9+

## Create the project

```bash
npm create vite@latest my-bench-dashboard -- --template preact-ts
cd my-bench-dashboard
npm install
```

Install the benchkit chart package:

```bash
npm install @benchkit/chart
```

> `@benchkit/chart` has `preact` as a peer dependency. The Vite template already includes it.

## Wire up the Dashboard

Replace `src/app.tsx` with:

```tsx
import { Dashboard } from "@benchkit/chart";

export function App() {
  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: "0 16px" }}>
      <h1>Benchmark Dashboard</h1>
      <Dashboard
        source={{
          owner: "YOUR_GITHUB_USER",
          repo: "YOUR_REPO",
        }}
      />
    </div>
  );
}
```

Run the dev server:

```bash
npm run dev
```

Open `http://localhost:5173` to see the dashboard.

## Using individual components

If you want more control, import the components and data-fetching utilities directly:

```tsx
import { useState, useEffect } from "preact/hooks";
import {
  fetchIndex,
  fetchSeries,
  TrendChart,
  ComparisonBar,
  RunTable,
} from "@benchkit/chart";
import type { IndexFile, SeriesFile } from "@benchkit/format";

const source = { owner: "YOUR_GITHUB_USER", repo: "YOUR_REPO" };

export function App() {
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [series, setSeries] = useState<SeriesFile | null>(null);

  useEffect(() => {
    fetchIndex(source).then(setIndex);
    fetchSeries(source, "ns_per_op").then(setSeries);
  }, []);

  if (!index || !series) return <p>Loading…</p>;

  return (
    <div>
      <TrendChart series={series} title="ns/op over time" />
      <ComparisonBar series={series} title="Latest ns/op by benchmark" />
      <RunTable index={index} maxRows={10} />
    </div>
  );
}
```

### Component reference

| Component | Props | Description |
|---|---|---|
| `Dashboard` | `source: DataSource` | Full dashboard with metric selector, trend charts, comparison bars, and run table |
| `TrendChart` | `series: SeriesFile`, `title?: string`, `height?: number`, `maxPoints?: number` | Line chart of a metric over time |
| `ComparisonBar` | `series: SeriesFile`, `title?: string`, `height?: number` | Bar chart comparing latest values across benchmarks |
| `RunTable` | `index: IndexFile`, `maxRows?: number`, `onSelectRun?: (id: string) => void` | Table listing recent benchmark runs |

### Data source

The `DataSource` type configures where to fetch data from:

```ts
interface DataSource {
  owner: string;   // GitHub repository owner
  repo: string;    // Repository name
  branch?: string; // Data branch (default: "bench-data")
}
```

## Build and deploy

```bash
npm run build
```

The output in `dist/` is a static site that can be deployed to any static host (Netlify, Vercel, Cloudflare Pages, S3, or GitHub Pages).

## Using with React

If your project uses React instead of Preact, alias Preact to `preact/compat` in your Vite config:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "preact/hooks": "preact/compat/hooks",
      "preact": "preact/compat",
    },
  },
});
```

Then install Preact alongside React:

```bash
npm install preact
```

This lets `@benchkit/chart` components render inside a React application without duplication.
