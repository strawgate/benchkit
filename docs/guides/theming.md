# Theming and Styling

This guide explains what `@benchkit/chart` provides out of the box and how your host application can control the visual appearance.

## Default behavior

`@benchkit/chart` components render with minimal, self-contained styles:

- **Font**: inherits from the page; falls back to `system-ui, sans-serif`
- **Colors**: a built-in 10-color palette for chart lines and bars
- **Layout**: components fill their container width; height is configurable via props
- **Spacing**: internal padding and margins are self-contained

No global CSS file is required. Components use inline styles so they work in any environment.

## What the host application controls

| Concern | How to control it |
|---|---|
| **Page layout** | Wrap the `Dashboard` or individual components in your own container with your preferred max-width, padding, and margins |
| **Font** | Set `font-family` on the page `body` or on the wrapper element — chart components inherit it |
| **Background** | Set on the page or wrapper; chart canvases are transparent by default |
| **Dark mode** | Use CSS on the wrapper — see [Dark mode](#dark-mode) below |
| **Container width** | Components are responsive and fill their container |
| **Chart height** | Pass the `height` prop to `TrendChart` or `ComparisonBar` (default: 300px) |
| **Max data points** | Pass `maxPoints` to `TrendChart` to limit the number of points shown |
| **Visible rows** | Pass `maxRows` to `RunTable` to cap the number of rows displayed |

## Layout example

```html
<style>
  .bench-wrapper {
    max-width: 800px;
    margin: 0 auto;
    padding: 24px;
    font-family: "Inter", system-ui, sans-serif;
  }
</style>

<div class="bench-wrapper">
  <div id="dashboard"></div>
</div>
```

```tsx
// With Preact / bundler
import { Dashboard } from "@benchkit/chart";

function App() {
  return (
    <div class="bench-wrapper">
      <Dashboard source={{ owner: "you", repo: "your-repo" }} />
    </div>
  );
}
```

## Chart height

```tsx
<TrendChart series={series} title="Latency" height={400} />
<ComparisonBar series={series} title="Throughput" height={250} />
```

The default height is 300 pixels. Set it to match your layout.

## Dark mode

The chart components use Chart.js under the hood, which renders to a `<canvas>`. To support dark mode:

1. Set the page background and text color as usual with CSS.
2. Chart.js will pick up the inherited font color for axis labels and tooltips.
3. The canvas background is transparent, so it naturally uses your page background.

```css
/* Example dark-mode overrides */
@media (prefers-color-scheme: dark) {
  body {
    background: #1a1a2e;
    color: #e0e0e0;
  }
}
```

The `Dashboard` component's built-in metric buttons use inline styles with light-mode defaults. To override them in dark mode, wrap the dashboard and apply CSS overrides:

```css
@media (prefers-color-scheme: dark) {
  .bench-wrapper button {
    background: #2d2d44;
    color: #e0e0e0;
    border-color: #444;
  }

  .bench-wrapper button[style*="background: rgb(59, 130, 246)"] {
    /* Active button keeps its blue highlight */
  }

  .bench-wrapper table {
    color: #e0e0e0;
  }
}
```

## Component hierarchy

```
Dashboard
├── Metric buttons (inline-styled)
├── Overview mode
│   └── Grid of TrendChart (mini, clickable)
├── Detail mode
│   ├── TrendChart (full)
│   └── ComparisonBar
└── RunTable
```

When using the `Dashboard` component, all sub-components are managed for you. When composing individual components, you control the layout and can freely mix them with your own UI.

## Summary

- `@benchkit/chart` stays out of the way — no global CSS, no theme providers
- Your app controls layout, fonts, background, and dark-mode switching
- Chart colors are built-in but naturally adapt to dark backgrounds
- Use wrapper elements and standard CSS to integrate with any design system
