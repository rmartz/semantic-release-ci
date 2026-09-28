---
type: Design
title: Why the release check, not semantic-release --dry-run
description: Why `semantic-release --dry-run` passes on a pull request without testing anything, why forcing past its exit fails for the wrong reason, and what the release check runs instead.
tags: [semantic-release, ci, design, decision, changelog]
---

# Why the release check, not `semantic-release --dry-run`

**Decision:** a repo's release setup is guarded on pull requests by
[`release-check.yml`](../.github/workflows/release-check.yml), which calls the
real commit-analyzer and release-notes-generator plugins directly. A local
`semantic-release --dry-run` job is **not** a release guard, and is removed when a
repo adopts this one.

## The failure it catches

`conventional-changelog-conventionalcommits@10` needs
`conventional-changelog-writer@9`, but `semantic-release@25` (through
`@semantic-release/release-notes-generator@14`) still bundles writer 8. When the
preset is a repo's direct dependency and the writer arrives only through
semantic-release, Dependabot bumps one without the other. `generateNotes` then
throws:

> Missing helper: "conventional-changelog-conventionalcommits requires
> conventional-changelog-writer@9 or newer …"

and the Release run on the next push to `main` fails. It happened in
rmartz/storybook-ci#3 and rmartz/pr-lifecycle#18, and was open again at once in
three repos when this repo was created.

## Why a dry-run cannot catch it

- **It exits before testing anything.** On a `pull_request` event semantic-release
  logs _"This run was triggered by a pull request and therefore a new version
  won't be published"_ and stops before `analyzeCommits` / `generateNotes`. The
  `--branches "$HEAD_REF"` override does not prevent that exit, so the job is
  green whatever the toolchain does.
- **Forcing past the exit fails for the wrong reason.** semantic-release then runs
  `verifyConditions`, whose git push-permission check fails on the read-only
  `GITHUB_TOKEN` that Dependabot and fork PRs get — exactly the PRs that bump the
  toolchain.

## What the check runs instead

[`src/release-check.ts`](../src/release-check.ts) loads the caller's config with
the same `cosmiconfig('release')` lookup semantic-release uses, imports each named
plugin from the shared toolchain, and calls:

- `analyzeCommits` on a `feat!:`, a `feat:` and a `fix:` commit, failing if either
  of the latter cuts no release or `feat!:` is ranked below `feat:` — the case
  where the default angular preset silently drops the `!` marker;
- `generateNotes` on those commits, failing on a throw or empty notes.

That is the seam that breaks, exercised with no token, network or push. Before
this repo existed, five repos carried four diverging copies of a similar script;
it now lives here once.

## Why it is centralized

A check in each repo still tests each repo's own toolchain copy, so every bump is
tested — and can break — twelve times. Here the toolchain has one lockfile, and
this repo's CI runs the shipped check against it on every PR. A toolchain bump
that fails is stopped on this repo's Dependabot PR; consumers only ever receive a
workflow SHA whose toolchain has passed.

Verified when the check was written: it fails with preset `^10.4.0` +
`release-notes-generator@14.1.1` (the error above) and passes with `^9.3.1`.
