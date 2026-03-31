# Benchkit Documentation

## Integration Guides

Step-by-step guides for common setups:

- **[GitHub Actions + GitHub Pages](guides/github-pages.md)** — Run benchmarks in CI and publish a dashboard to GitHub Pages
- **[Custom Dashboard with Vite + Preact](guides/vite-preact-app.md)** — Build a standalone benchmark dashboard application
- **[Embedding Charts in an Existing App](guides/embedding-charts.md)** — Add benchmark charts to any web page or application
- **[Non-Go Benchmark Ingestion](guides/non-go-benchmarks.md)** — Use benchkit with Python, JavaScript, or any language
- **[Theming and Styling](guides/theming.md)** — Control layout, fonts, dark mode, and chart appearance

## Packages

| Package | Description |
|---|---|
| [`@benchkit/format`](../packages/format/) | Benchmark result types and format parsers (Go, benchmark-action, native) |
| [`@benchkit/chart`](../packages/chart/) | Preact components for rendering benchmark dashboards |

## GitHub Actions

| Action | Description |
|---|---|
| [`@benchkit/stash`](../actions/stash/) | Parse benchmark results and commit them to a data branch |
| [`@benchkit/aggregate`](../actions/aggregate/) | Rebuild index and series files from all stored runs |

## Data Flow

```
Benchmark output (Go / Python / JS / ...)
        │
        ▼
┌─────────────────┐     ┌───────────────────┐
│  @benchkit/stash │ ──▶ │  bench-data branch │
└─────────────────┘     │  data/runs/*.json  │
                        └───────────────────┘
                                │
                                ▼
                      ┌────────────────────┐
                      │ @benchkit/aggregate │
                      └────────────────────┘
                                │
                                ▼
                      ┌────────────────────┐
                      │  bench-data branch  │
                      │  data/index.json    │
                      │  data/series/*.json │
                      └────────────────────┘
                                │
                                ▼
                      ┌────────────────────┐
                      │  @benchkit/chart    │
                      │  Dashboard / Charts │
                      └────────────────────┘
```
