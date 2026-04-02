# Developing benchkit

This guide is for contributors working on benchkit internals.

## Prerequisites

- Node.js 24+
- npm

## Repository layout

- `packages/format/`: benchmark types and parsers
- `packages/chart/`: Preact dashboard components
- `packages/dashboard/`: self-benchmark dashboard deployed to GitHub Pages
- `actions/stash/`: GitHub Action to parse and store run data
- `actions/aggregate/`: GitHub Action to build index and series
- `actions/compare/`: GitHub Action to compare results against a baseline
- `actions/monitor/`: GitHub Action for background system metrics collection
- `actions/emit-metric/`: GitHub Action for emitting one-off OTLP metrics to the monitor collector
- `schema/`: JSON schemas for generated data files

## Install dependencies

```bash
npm ci
```

## Build

Build everything:

```bash
npm run build
```

Build a specific workspace:

```bash
npm run build --workspace=packages/format
npm run build --workspace=packages/chart
npm run build --workspace=packages/dashboard
npm run build --workspace=actions/stash
npm run build --workspace=actions/aggregate
npm run build --workspace=actions/compare
npm run build --workspace=actions/monitor
npm run build --workspace=actions/emit-metric
```

## Test

Run all tests:

```bash
npm run test
```

Run a single workspace test suite:

```bash
npm run test --workspace=packages/format
npm run test --workspace=packages/chart
```

## Lint and type checks

```bash
npm run lint
```

This runs ESLint (flat config in `eslint.config.mjs`) and `tsc --noEmit` across all workspaces.

## Working on GitHub actions

Action bundles in `actions/*/dist/` are committed artifacts.

Before opening a PR for action changes:
1. Rebuild the modified action workspace.
2. Confirm `dist/` changes are included.
3. Run local tests and repo CI checks.

## Adding features

1. Decide the target surface first: format package, chart package, or action.
2. Add or update tests in the same workspace.
3. Keep public API changes documented in package README files.
4. If data contract changes, update `schema/` and associated docs.

## Contribution checklist

1. `npm run build`
2. `npm run test`
3. `npm run lint`
4. Verify any action `dist/` bundle updates are committed
5. Update docs for user-visible behavior changes
