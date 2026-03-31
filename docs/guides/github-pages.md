# GitHub Actions + GitHub Pages

This guide walks through setting up a benchmark dashboard that runs in CI and publishes results to GitHub Pages.

## Overview

The pipeline has three stages:

1. **Run benchmarks** in your CI job and produce output (e.g. `go test -bench`)
2. **Stash results** with `@benchkit/stash` — parses output and commits it to a `bench-data` branch
3. **Aggregate** with `@benchkit/aggregate` — rebuilds `index.json` and per-metric series files
4. **Publish** a static HTML page that loads `@benchkit/chart` and points at the data branch

## Step 1 — Benchmark workflow

Create `.github/workflows/benchmark.yml`:

```yaml
name: Benchmarks

on:
  push:
    branches: [main]

permissions:
  contents: write # required to push to the data branch

jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run benchmarks
        run: go test -bench=. -benchmem ./... > bench.txt

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench.txt
          format: go

  aggregate:
    needs: bench
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Aggregate results
        uses: strawgate/benchkit/actions/aggregate@main
```

After this workflow runs, the `bench-data` branch contains:

```
data/
  index.json
  runs/
    <run-id>.json
  series/
    ns_per_op.json
    bytes_per_op.json
    ...
```

## Step 2 — Dashboard page

Create a minimal `index.html` in a `pages/` directory (or wherever your GitHub Pages source is):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Benchmark Dashboard</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 960px;
      margin: 40px auto;
      padding: 0 16px;
    }
    h1 { font-size: 24px; }
  </style>
</head>
<body>
  <h1>Benchmark Dashboard</h1>
  <div id="app"></div>

  <script type="module">
    import { render, h } from "https://esm.sh/preact@10.25.0";
    import { Dashboard } from "https://esm.sh/@benchkit/chart@0.1.0?external=preact";

    render(
      h(Dashboard, {
        source: {
          owner: "YOUR_GITHUB_USER",
          repo: "YOUR_REPO",
          // branch: "bench-data"  ← default, change if needed
        },
      }),
      document.getElementById("app")
    );
  </script>
</body>
</html>
```

Replace `YOUR_GITHUB_USER` and `YOUR_REPO` with your GitHub owner and repository name.

## Step 3 — Deploy to GitHub Pages

Add a job to your workflow (or create a separate workflow) to deploy the page:

```yaml
  deploy-pages:
    needs: aggregate
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - name: Upload pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: pages/

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Enable GitHub Pages in your repository settings under **Settings → Pages → Source → GitHub Actions**.

## Complete workflow

Here is the full `.github/workflows/benchmark.yml`:

```yaml
name: Benchmarks

on:
  push:
    branches: [main]

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run benchmarks
        run: go test -bench=. -benchmem ./... > bench.txt
      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench.txt
          format: go

  aggregate:
    needs: bench
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Aggregate results
        uses: strawgate/benchkit/actions/aggregate@main

  deploy-pages:
    needs: aggregate
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: pages/
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Notes

- The `bench-data` branch is created automatically by the stash action on the first run.
- The dashboard fetches data from `raw.githubusercontent.com` so the repository must be **public**, or you need to supply a token-based URL.
- For private repositories, consider building a static site that embeds the data at build time rather than fetching it at runtime.
