# Embedding @benchkit/chart in an Existing Application

This guide covers adding benchkit charts to an application you already have, whether it uses Preact, React, or plain HTML.

## From a CDN (no build step)

You can load the chart components directly from a CDN like [esm.sh](https://esm.sh) in any HTML page:

```html
<div id="chart"></div>

<script type="module">
  import { render, h } from "https://esm.sh/preact@10.25.0";
  import {
    Dashboard,
    fetchIndex,
    fetchSeries,
    TrendChart,
  } from "https://esm.sh/@benchkit/chart@0.1.0?external=preact";

  // Option A: Full dashboard
  render(
    h(Dashboard, {
      source: { owner: "YOUR_GITHUB_USER", repo: "YOUR_REPO" },
    }),
    document.getElementById("chart")
  );
</script>
```

To render an individual chart instead of the full dashboard:

```html
<div id="trend"></div>

<script type="module">
  import { render, h } from "https://esm.sh/preact@10.25.0";
  import {
    fetchSeries,
    TrendChart,
  } from "https://esm.sh/@benchkit/chart@0.1.0?external=preact";

  const source = { owner: "YOUR_GITHUB_USER", repo: "YOUR_REPO" };

  fetchSeries(source, "ns_per_op").then((series) => {
    render(
      h(TrendChart, { series, title: "ns/op over time" }),
      document.getElementById("trend")
    );
  });
</script>
```

## From npm (with a bundler)

Install the package:

```bash
npm install @benchkit/chart preact
```

Then import components in your code:

```tsx
import { Dashboard } from "@benchkit/chart";

function BenchmarkSection() {
  return (
    <Dashboard
      source={{ owner: "YOUR_GITHUB_USER", repo: "YOUR_REPO" }}
    />
  );
}
```

## In a React application

`@benchkit/chart` uses Preact, but it works in React apps with the `preact/compat` alias. See the [Vite + Preact guide](./vite-preact-app.md#using-with-react) for configuration details.

In short, add Preact and alias it in your bundler config:

```bash
npm install preact
```

Webpack example (`webpack.config.js`):

```js
module.exports = {
  resolve: {
    alias: {
      "preact/hooks": "preact/compat/hooks",
      preact: "preact/compat",
    },
  },
};
```

## What the chart package provides

`@benchkit/chart` renders self-contained chart components. It includes:

- **`Dashboard`** — full dashboard with metric selector, charts, and run table
- **`TrendChart`** — line chart for a metric's time series
- **`ComparisonBar`** — bar chart comparing latest values across benchmarks
- **`RunTable`** — table of recent benchmark runs
- **`fetchIndex`**, **`fetchSeries`**, **`fetchRun`** — data-fetching utilities that read from the `bench-data` branch via `raw.githubusercontent.com`

## What the host application owns

The chart package deliberately does **not** impose global styles. The host application is responsible for:

| Concern | Owned by |
|---|---|
| Page layout and responsive container | Host app |
| Font family | Host app (charts inherit `system-ui` as a fallback) |
| Dark mode or color scheme | Host app — see the [theming guide](./theming.md) |
| Page title, headers, navigation | Host app |
| Data fetching authentication (private repos) | Host app |
| Chart colors and line styles | `@benchkit/chart` (built-in 10-color palette) |
| Tooltip formatting | `@benchkit/chart` |
| Axis labels and scales | `@benchkit/chart` (derived from metric units and direction) |

For deeper theming control, see [Theming and Styling](./theming.md).
