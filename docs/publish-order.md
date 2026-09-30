---
type: Design
title: Publish to npm before the tag is pushed
description: Why an npm publisher publishes from an @semantic-release/exec prepareCmd instead of @semantic-release/npm's publish step, and why the release check enforces it rather than the shared workflow doing it.
tags: [semantic-release, npm, publishing, design, decision]
resource: src/publish-order.ts
---

# Publish to npm before the tag is pushed

**Decision:** a release that publishes to npm does so in semantic-release's
`prepare` step, before the tag is pushed. The
[release check](release-check.md) fails any config that would publish after it
(rmartz/semantic-release-ci#12).

## The failure

semantic-release runs `prepare`, then pushes the git tag, then runs `publish`.
`@semantic-release/npm` publishes in `publish`, so when its `npm publish` fails
the tag is already on the remote with no package behind it. Every consumer that
Dependabot moves to that tag then fails to install. In rmartz/merge-safety this
happened four releases in a row (v0.7.0–v0.10.0).

Publishing first inverts the failure. A failed publish stops the release before
any tag exists, and the next run retries it cleanly. The remaining failure, the
package published but the tag push failing, is rarer: pushing a tag with the job
token is simpler than an OIDC exchange plus a registry upload. It also leaves the
consumer-facing state consistent, because Dependabot follows tags, and no tag
means no consumer is moved to the version. Recover by pushing the missing tag by
hand; a re-run would fail when it tries to publish the same version again.

## The required config

```json
{
  "plugins": [
    ["@semantic-release/commit-analyzer", { "preset": "conventionalcommits" }],
    ["@semantic-release/release-notes-generator", { "preset": "conventionalcommits" }],
    ["@semantic-release/npm", { "npmPublish": false }],
    ["@semantic-release/exec", { "prepareCmd": "npm publish" }],
    "@semantic-release/github"
  ]
}
```

- `@semantic-release/npm` keeps its `prepare` step, which writes the release
  version into `package.json`. `"npmPublish": false` turns off only its publish.
- `@semantic-release/exec` runs `npm publish` in `prepare`. It must come **after**
  `@semantic-release/npm`, because plugins run a step in list order and the
  version must be set first.
- Use `npm publish`, not `pnpm publish`, which refuses to run from the tree the
  version bump just dirtied. The runner's npm handles trusted publishing (OIDC)
  itself. A GitHub Packages publisher (`github-packages: true`) authenticates
  through its `.npmrc`:
  `//npm.pkg.github.com/:_authToken=${NPM_TOKEN}`.
- A `pkgRoot` on `@semantic-release/npm` needs the matching directory in the
  command (`npm publish ./dist`).

## What the check fails

[`src/publish-order.ts`](../src/publish-order.ts) fails a config where:

- `@semantic-release/npm` is present without `"npmPublish": false`. That
  includes semantic-release's default plugin list;
- an `@semantic-release/exec` `publishCmd` runs `npm`/`pnpm`/`yarn publish`;
- an exec `prepareCmd` that publishes is listed before `@semantic-release/npm`.

A config that publishes nothing to npm, such as an action repo with only
`@semantic-release/github`, passes.

## Options not taken

- **Per-repo config with no check.** Every publisher would carry a subtle
  ordering fix, and a repo that forgot it would regress silently, on its first
  failed publish.
- **The shared workflow publishes itself.** The next version is unknown until
  `analyzeCommits`, so the workflow would need a two-pass release or
  semantic-release's programmatic API, and would replace semantic-release's own
  flow with ours. The check gets the same guarantee while keeping each repo's
  config the single description of its release.
