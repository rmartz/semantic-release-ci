# semantic-release-ci

Shared **semantic-release** for the fleet: one release toolchain
(`semantic-release`, its `@semantic-release/*` plugins, and the
`conventional-changelog-conventionalcommits` preset), tested once in this repo
and delivered as two reusable GitHub Actions workflows a repo pins by SHA:

- **`semantic-release.yml`** — runs the release on push to `main` with the shared
  toolchain, against your repo's own `.releaserc.json`.
- **`release-check.yml`** — a PR check that proves your release config works with
  that toolchain: it renders release notes and analyzes a `feat!` / `feat` / `fix`
  commit with the real plugins. Needs only `contents: read`, so it runs on
  Dependabot and fork PRs.

A toolchain bump that would break releases — like a preset major that needs a
newer `conventional-changelog-writer` than semantic-release bundles — fails this
repo's own `release-check` on the Dependabot PR that causes it, and never reaches
a consuming repo.

## Quickstart

`.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    branches: [main]
permissions:
  contents: write # tags + GitHub releases
  issues: write # success comments on released issues
  pull-requests: write # success comments on released PRs
jobs:
  release:
    uses: rmartz/semantic-release-ci/.github/workflows/semantic-release.yml@<sha> # vX.Y.Z
```

`.github/workflows/release-check.yml`:

```yaml
name: Release check
on:
  pull_request:
permissions:
  contents: read
jobs:
  release-check:
    uses: rmartz/semantic-release-ci/.github/workflows/release-check.yml@<sha> # vX.Y.Z
```

Then require the `release-check / release-check` status check in your
default-branch ruleset, and remove `semantic-release`, `@semantic-release/*` and
`conventional-changelog-conventionalcommits` from your `devDependencies`. npm
publishers add `id-token: write` and a `build-command`; see
[docs/consuming.md](docs/consuming.md).

Replace `<sha>` with the current release commit of `rmartz/semantic-release-ci`;
Dependabot's `github-actions` ecosystem keeps the pin current.

## Documentation

Full documentation lives in [`docs/`](docs/index.md):

- [Adopting it in a consuming repo](docs/consuming.md)
- [Configuration reference](docs/configuration.md)
- [Why the release check, not `semantic-release --dry-run`](docs/release-check.md)

## Development

This repo is CI-only and unpublished. Its `dependencies` are the shipped
toolchain; the check is TypeScript run directly by Node 24.

```bash
pnpm install
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run release-check
```

See [AGENTS.md](AGENTS.md) for the contributor guide.
