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

## What the automation does

The [release workflow](.github/workflows/release.yml) triggers on tags
matching `v*`. It runs three jobs in sequence:

1. **build-and-test** — installs dependencies, builds, and tests
   `@benchkit/format` and `@benchkit/chart`. The release is aborted if
   this job fails.
2. **publish** — builds the packages again in a clean environment, verifies the
   tag version matches both `package.json` files, and publishes to npm with
   `--provenance` for supply-chain transparency.
3. **github-release** — generates a changelog from commit messages since the
   previous tag and creates a GitHub Release. Pre-release tags are
   automatically flagged.

## Troubleshooting

| Problem | Fix |
|---|---|
| Tag version doesn't match `package.json` | Delete the tag, fix the version, re-tag and push. |
| npm publish fails with 403 | Check the `NPM_TOKEN` secret has publish access to `@benchkit`. |
| Tests fail during release | Fix the issue on `main`, bump again, and re-tag. |
| Provenance attestation fails | Ensure `id-token: write` permission is set in the workflow and each `package.json` has a `repository` field pointing to the GitHub repo. |
