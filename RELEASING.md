# Releasing

This document describes how to cut a release for `@benchkit/chart` and
`@benchkit/format`.

## Versioning strategy

All publishable packages in the monorepo share a **single version number**.
Both `@benchkit/chart` and `@benchkit/format` are released together, even if
only one package has changed. This keeps the dependency relationship simple and
avoids cross-version compatibility issues.

Versions follow [Semantic Versioning](https://semver.org/):

| Change kind | Bump |
|---|---|
| Breaking API change | major |
| New feature (backwards-compatible) | minor |
| Bug fix / docs / internal improvement | patch |

Pre-release versions (e.g. `0.2.0-beta.1`) are supported. Any tag containing
a hyphen is automatically marked as a pre-release on GitHub.

## Prerequisites

- Push access to the repository
- An `NPM_TOKEN` secret configured in the repository settings with publish
  access to the `@benchkit` npm scope

## How to release

1. **Update versions** in both package manifests:

   ```bash
   npm version <major|minor|patch> --workspaces --include-workspace-root=false --no-git-tag-version
   ```

   This bumps the `version` field in `packages/format/package.json` and
   `packages/chart/package.json`.

2. **Commit the version bump**:

   ```bash
   git add packages/*/package.json
   git commit -m "chore: bump version to $(node -p "require('./packages/format/package.json').version")"
   ```

3. **Create and push the tag**:

   ```bash
   VERSION=$(node -p "require('./packages/format/package.json').version")
   git tag "v$VERSION"
   git push origin main "v$VERSION"
   ```

4. **Watch the workflow**. The `Release` workflow will:
   - Build and test all packages
   - Verify the tag matches the package versions
   - Publish `@benchkit/format` and `@benchkit/chart` to npm
   - Create a GitHub Release with auto-generated release notes

   If any step fails the packages are **not** published.

## Major version tags

The actions in this repository follow the GitHub Actions convention of
supporting a floating major version tag (e.g. `v1`) that always points to the
latest stable release within that major line. This lets consumers pin to
`strawgate/benchkit/actions/<name>@v1` and receive all patch and minor updates
automatically.

The `update-major-tag` job in the release workflow keeps this tag up to date.
It runs after every stable (non-pre-release) tag push and force-updates the
major tag to the new release commit. Pre-release tags (those containing `-`,
e.g. `v1.2.0-beta.1`) are skipped.

## What the automation does

The [release workflow](.github/workflows/release.yml) triggers on tags
matching `v*`. It runs four jobs in sequence:

1. **build-and-test** — installs dependencies, builds, and tests
   `@benchkit/format` and `@benchkit/chart`. The release is aborted if
   this job fails.
2. **publish** — builds the packages again in a clean environment, verifies the
   tag version matches both `package.json` files, and publishes to npm with
   `--provenance` for supply-chain transparency.
3. **github-release** — generates a changelog from commit messages since the
   previous tag and creates a GitHub Release. Pre-release tags are
   automatically flagged.
4. **update-major-tag** — force-updates the floating major version tag (e.g.
   `v1`) to point to the latest stable release commit. Skipped for pre-release
   tags.

## Troubleshooting

| Problem | Fix |
|---|---|
| Tag version doesn't match `package.json` | Delete the tag, fix the version, re-tag and push. |
| npm publish fails with 403 | Check the `NPM_TOKEN` secret has publish access to `@benchkit`. |
| Tests fail during release | Fix the issue on `main`, bump again, and re-tag. |
