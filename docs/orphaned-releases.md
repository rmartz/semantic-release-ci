---
type: Design
title: Tag a version published without its tag
description: Why the release workflow tags an npm version whose tag push failed before it runs semantic-release, and what it will and will not tag.
tags: [semantic-release, npm, publishing, tags, recovery, design, decision]
resource: src/orphaned-release.ts
---

# Tag a version published without its tag

**Decision:** before semantic-release runs, the
[release workflow](../.github/workflows/semantic-release.yml) tags any npm version
that was published but never tagged, at the commit it was published from.

## The failure

An npm publisher publishes in `prepare`, before the tag is pushed
([publish-order.md](publish-order.md)). If the tag push then fails, the version is
on the registry with no tag. In rmartz/pr-lifecycle, 11.1.0 was published and
`git push --tags` got a GitHub `Internal Server Error`. semantic-release finds the
next version from the last tag, so every later run recomputed 11.1.0 and failed
`npm publish` with E403. Re-running the release did not help either. The repo could
not release again until someone pushed the missing tag by hand.

## What it tags

[`src/bin/tag-orphaned-release.ts`](../src/bin/tag-orphaned-release.ts) reads the
package's versions from the registry `npm publish` targets (`publishConfig`), with
`NPM_TOKEN` when `github-packages` is set. It tags a version only when all of these
hold:

- it is a stable `x.y.z` version newer than the newest tag in the repo's
  `tagFormat`, and that format has no tag for it yet;
- its recorded `gitHead`, the commit npm packed it from, is an ancestor of the
  commit being released.

It skips a repo that does not publish to npm (a `private` package, or a config
without `@semantic-release/npm`), a package with no tag yet, and a package that has
never been published. If the registry lookup fails, it warns and lets the release
run as it would have without this step. The tag is pushed with the job token, as
semantic-release pushes its own.

The recovered version gets no GitHub Release or release notes, because
`@semantic-release/github` runs only for the version it releases. Its commits stay
out of the next release's notes.

## Options not taken

- **Make the publish skip a version npm already has.** That heals only a re-run
  of the same commit. After the next merge, `gitHead` no longer matches `HEAD`,
  and the run still fails.
- **Push the tag by hand.** That was the documented recovery, and every repo
  stays stuck until a person notices.
