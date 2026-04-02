# Recommended Workflow Architecture

This document describes the recommended GitHub Actions workflow patterns for
benchkit users. The core principle is a clean separation of concerns:

- **Producer workflows** append immutable raw run artifacts to `bench-data`.
- The **aggregate workflow** owns all derived outputs and is triggered by
  pushes to `bench-data`.

---

## Roles

### Producer workflow

A producer workflow runs benchmarks and commits **only** raw run files to the
`bench-data` branch. It does **not** rebuild `index.json` or `series/*.json`.

```
bench-data
└── data/
    └── runs/
        ├── 12345-1--bench-go.json      # {run_id}-{attempt}--{job}.json
        └── 12345-1--bench-python.json  # second job in the same run
```

Multiple jobs in the same workflow run, or multiple concurrent workflows, can
all push safely because each write targets a unique file path
(see [Collision-proof naming](#collision-proof-naming)).

### Aggregate workflow

A dedicated aggregate workflow is triggered whenever new run files land on
`bench-data`. It reads all raw runs and rebuilds the derived views:

```
bench-data
└── data/
    ├── index.json
    └── series/
        ├── ns_per_op.json
        └── events_per_sec.json
```

Because the path filter is scoped to `data/runs/**`, the aggregate workflow's
own writes (`index.json`, `series/**`) do **not** retrigger it, preventing
infinite loops.

---

## Collision-proof naming

The stash action's default run identifier embeds three components:

```
{GITHUB_RUN_ID}-{GITHUB_RUN_ATTEMPT}--{GITHUB_JOB}
```

For example, run `12345` attempt `1` from a job named `bench-go` produces:

```
data/runs/12345-1--bench-go.json
```

This means two jobs in the same workflow run can both call the stash action
without overwriting each other.

### Matrix jobs

For matrix builds, `GITHUB_JOB` is the same across all matrix variants, so
you **must** supply a custom `run-id` that incorporates the matrix key:

```yaml
- name: Stash results
  uses: strawgate/benchkit/actions/stash@main
  with:
    results: bench.txt
    run-id: ${{ github.run_id }}-${{ github.run_attempt }}--${{ matrix.go-version }}
```

---

## Example: producer workflow

```yaml
# .github/workflows/bench.yml
name: Benchmarks
on:
  push:
    branches: [main]

permissions:
  contents: write   # push to bench-data

jobs:
  bench-go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run benchmarks
        run: go test -bench=. -benchmem ./... | tee bench.txt

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench.txt
          format: go
          # run-id defaults to {run_id}-{attempt}--bench-go
```

---

## Example: aggregate workflow (bench-data push trigger)

```yaml
# .github/workflows/aggregate.yml
name: Aggregate benchmarks
on:
  push:
    branches:
      - bench-data
    paths:
      - 'data/runs/**'   # only raw-run writes trigger aggregation
                          # derived-file pushes are ignored

permissions:
  contents: write   # push derived files back to bench-data

jobs:
  aggregate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Aggregate
        uses: strawgate/benchkit/actions/aggregate@main
        with:
          max-runs: 0   # 0 = keep all runs
```

The `paths` filter is the key to preventing an infinite loop: aggregate writes
`data/index.json` and `data/series/**`, neither of which matches
`data/runs/**`, so those commits do not retrigger this workflow.

---

## Migration from combined workflows

If your current workflow calls both stash and aggregate in the same job:

```yaml
# Before (combined — no longer recommended)
- name: Stash results
  uses: strawgate/benchkit/actions/stash@main
  with:
    results: bench.txt

- name: Aggregate
  uses: strawgate/benchkit/actions/aggregate@main
```

Split it into the two separate workflow files shown above. The stash step
remains unchanged; the aggregate step moves to the dedicated
`aggregate.yml` workflow triggered on `bench-data` pushes.

This pattern is backward-compatible: existing `bench-data` branches and raw
run files do not need to be migrated. Rename files is not required unless
you want the new collision-proof naming for previously stored runs.
