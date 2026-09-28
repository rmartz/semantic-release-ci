---
type: Reference
title: semantic-release-ci configuration reference
description: Every input of the semantic-release and release-check reusable workflows, the release-config options the shared toolchain supports, and the plugins a consumer's config may name.
tags: [semantic-release, ci, configuration, workflows]
---

# Configuration reference

## `semantic-release.yml`

| Input             | Default | What it controls                                                                                                                                                   |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node-version`    | `24.x`  | Node.js for the toolchain and any `build-command`.                                                                                                                 |
| `build-command`   | `''`    | Runs in your checkout before releasing, e.g. `pnpm run build` ahead of `@semantic-release/npm`. When set, your dependencies are installed first. Empty skips both. |
| `package-manager` | `pnpm`  | `pnpm` or `npm`: how your dependencies are installed for `build-command` (`pnpm install --frozen-lockfile` with the pnpm your `package.json` pins, or `npm ci`).   |
| `timeout-minutes` | `10`    | The release job's timeout.                                                                                                                                         |

The job never runs on `pull_request` / `pull_request_target`, and releases are
serialized per repository (`cancel-in-progress: false`). It declares no
`permissions:` — see [consuming.md](consuming.md#permissions) for what the caller
grants.

## `release-check.yml`

| Input          | Default | What it controls                    |
| -------------- | ------- | ----------------------------------- |
| `node-version` | `24.x`  | Node.js the check's toolchain runs. |

It posts the check `release-check / release-check` (when the caller's job id is
`release-check`) and needs only `contents: read`.

## Your release config

Both workflows read your config the way semantic-release does — `.releaserc`,
`.releaserc.json` / `.yaml` / `.js`, `release.config.*`, or `package.json#release`
— so keep your existing file and its options (`branches`, `tagFormat`,
`releaseRules`, `successComment`, …). The check fails a config that:

- names a plugin the toolchain does not ship (below), or uses an inline plugin;
- uses `extends` (a shareable config would pull plugins from outside the toolchain);
- omits `@semantic-release/commit-analyzer` or
  `@semantic-release/release-notes-generator`, or sets either one's `preset` to
  anything but `conventionalcommits`;
- cuts no release for `feat:` or `fix:`, or one for `feat!:` lower than for
  `feat:` — so the `!` marker the fleet's merge flow stamps is honored. A pre-1.0
  cap (`{ "breaking": true, "release": "minor" }`) passes;
- cannot render release notes (a preset/writer mismatch, a bad preset option).

## Plugins the toolchain ships

The versions are this repo's `package.json` `dependencies` at the SHA you pin:

- `@semantic-release/commit-analyzer`
- `@semantic-release/release-notes-generator`
- `@semantic-release/npm`
- `@semantic-release/github`
- the `conventional-changelog-conventionalcommits` preset

Need another plugin (`@semantic-release/exec`, `@semantic-release/git`, …)? Add
it to `dependencies` here in a `feat:` PR — never to your own repo, where the
release would not load it.
