---
type: Reference
title: Adopting semantic-release-ci in a consuming repo
description: The two caller workflows a fleet repo adds to release with the shared toolchain and check its release config on PRs, the permissions each needs, npm trusted publishing, and the migration off a repo-local toolchain.
tags: [semantic-release, ci, consuming, adoption, migration]
---

# Adopting semantic-release-ci in a consuming repo

A consuming repo adds two thin caller workflows, each pinning a reusable workflow
here by full commit SHA with a `# vX.Y.Z` comment. Dependabot's `github-actions`
ecosystem bumps the pins, so a toolchain change reaches the repo as one PR, and
only after it has passed this repo's own `release-check`.

Replace `<sha>` with the current release commit of `rmartz/semantic-release-ci`.

## Release

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
permissions:
  contents: write
  issues: write
  pull-requests: write
jobs:
  release:
    uses: rmartz/semantic-release-ci/.github/workflows/semantic-release.yml@<sha> # vX.Y.Z
```

Your `.releaserc.json` stays in your repo and keeps every option it has today.
The workflow supplies the plugin code only.

### Permissions

The reusable workflow declares no `permissions:` and inherits the caller's, so
grant what your release config needs — and nothing it doesn't:

| Scope                  | Needed when                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `contents: write`      | Always: semantic-release pushes the tag and `@semantic-release/github` creates the release. |
| `issues: write`        | `@semantic-release/github` success/fail comments are on (its default).                      |
| `pull-requests: write` | Same: comments on released PRs.                                                             |
| `id-token: write`      | You publish to npmjs with `@semantic-release/npm` (trusted publishing, below).              |
| `packages: write`      | You publish to GitHub Packages instead (`github-packages: true`, below).                    |

A caller's `permissions:` block is exhaustive, and a called workflow can only
narrow it. If you have turned comments off (`"successComment": false`,
`"failComment": false`, `"releasedLabels": false`), drop `issues` and
`pull-requests`.

### npm publishing

For a package in the npmjs group, add `id-token: write` and build before
releasing:

```yaml
permissions:
  contents: write
  issues: write
  pull-requests: write
  id-token: write # npm trusted publishing (OIDC) + provenance
jobs:
  release:
    uses: rmartz/semantic-release-ci/.github/workflows/semantic-release.yml@<sha> # vX.Y.Z
    with:
      build-command: pnpm run build
```

- **Trusted publishing, no token.** Auth is GitHub OIDC; there is no `NPM_TOKEN`
  secret, per the repository checklist. npm validates the **calling** workflow's
  filename, not this one, so a trusted publisher already configured for your
  `release.yml` keeps working unchanged. Renaming your caller breaks publishing
  until the publisher on npmjs.com is updated.
- **`build-command`** runs after your dependencies are installed
  (`package-manager: pnpm` by default — `pnpm install --frozen-lockfile` under the
  pnpm your `package.json` pins; or `npm`). The install gets
  `NODE_AUTH_TOKEN: ${{ github.token }}` for a `.npmrc` that scopes a GitHub
  Packages dependency; grant `packages: read` too if you have one.
- **npm ≥ 11.5.1, so Node 24.** Trusted publishing needs npm 11.5.1 or later, and
  the publish runs with the **runner's** npm: `@semantic-release/npm` depends on npm
  11 but prefers a `node_modules/.bin/npm`, and pnpm links only direct
  dependencies' binaries there. The default `node-version: 24.x` ships npm 11.
  Don't override it with an older Node: npm 10 completes the OIDC exchange and then
  fails `npm publish` with `ENEEDAUTH`, after the tag is already pushed
  (rmartz/merge-safety#76). When the caller grants `id-token: write`, the workflow
  checks the npm version first and fails before releasing.

**GitHub Packages.** A package whose `publishConfig.registry` is
`https://npm.pkg.github.com` grants `packages: write` instead of `id-token: write`
and sets `github-packages: true`, which authenticates the publish with the job
token (the same `NPM_TOKEN: GITHUB_TOKEN` a repo-local release used). Nothing else
changes; OIDC is untouched when it is off.

## Release check

```yaml
# .github/workflows/release-check.yml
name: Release check
on:
  pull_request:
permissions:
  contents: read
jobs:
  release-check:
    uses: rmartz/semantic-release-ci/.github/workflows/release-check.yml@<sha> # vX.Y.Z
```

It posts **`release-check / release-check`** — require that exact context in the
default-branch ruleset. It runs on every PR (no `on.paths`), so the required check
always posts; it takes well under a minute. What it fails on:
[configuration.md](configuration.md#your-release-config).

## Migrating a repo off its own toolchain

One PR per repo:

1. Replace `release.yml`'s job with the release caller above, carrying over the
   repo's `permissions:` and adding `build-command` if it built before releasing.
2. Add the release-check caller. Delete the local guard it replaces: a
   `semantic-release --dry-run` job and/or `scripts/verify-changelog-render.mjs`
   plus its CI job. Swapping a guard that tests nothing for one that does is not a
   CI loosening. If a reviewer disagrees, add the new check in one PR and remove
   the old one in another.
3. Remove `semantic-release`, every `@semantic-release/*` package, and
   `conventional-changelog-conventionalcommits` from `devDependencies`, and the
   Dependabot `ignore` rule for the preset major.
4. After the PR's `release-check / release-check` has posted green, add it to the
   ruleset's required checks and drop the old guard's context. Always confirm a
   context posts before requiring it.
5. Confirm the first post-merge Release run on `main` succeeds.
