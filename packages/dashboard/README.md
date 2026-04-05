# @benchkit/dashboard

Private Preact app that deploys benchkit's own benchmark dashboard to GitHub Pages. This is **not** a library or template — it is the live dogfood deployment at [strawgate.github.io/benchkit](https://strawgate.github.io/benchkit/).

## Role

`packages/dashboard` exists to:

- **Dogfood** `@benchkit/chart` against real benchmark data, catching bugs and UX issues before users hit them.
- **Demonstrate** how a full dashboard can be built with a handful of props and zero backend.
- **Deploy** automatically on every push to `main` via the [GitHub Pages workflow](../../.github/workflows/pages.yml).

It is marked `"private": true` in `package.json` and will never be published to npm.

## Building on benchkit

If you want to build your own dashboard, **start from `@benchkit/chart` directly** — do not fork this app. The chart package exports three ready-made surfaces:

| Surface | Use case |
|---|---|
| `Dashboard` | Metric-first overview with trend charts, comparisons, regressions, and monitor panels. |
| `RunDashboard` | PR- or run-oriented entry point with run selectors and baseline comparison. |
| `RunDetail` | Deep-dive page for a single run's metrics and diagnostics. |

See [`packages/chart/README.md`](../chart/README.md) for full prop tables and [`docs/getting-started.md`](../../docs/getting-started.md) for a step-by-step setup guide.

## Local development

```bash
# from the repo root
npm ci
npm run build            # build format + chart first
npm run dev --workspace=packages/dashboard
```

The dev server starts at `http://localhost:5173/benchkit/` and fetches live data from the `bench-data` branch.

## How it works

[`src/main.tsx`](src/main.tsx) renders a single `<Dashboard>` component pointed at `strawgate/benchkit`:

```tsx
<Dashboard
  source={{ owner: "strawgate", repo: "benchkit" }}
  seriesNameFormatter={(name) => name.replace(/^Benchmark/, "")}
  commitHref={(sha) => `https://github.com/strawgate/benchkit/commit/${sha}`}
  regressionThreshold={10}
  regressionWindow={5}
/>
```

Vite builds a static bundle into `dist/`, which the Pages workflow uploads as an artifact and deploys.
