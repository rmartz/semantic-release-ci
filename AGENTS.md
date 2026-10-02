# Agent guide — semantic-release-ci

This repo is the fleet's shared **semantic-release**: one release toolchain
(`semantic-release`, its `@semantic-release/*` plugins, and the
`conventional-changelog-conventionalcommits` preset), tested once here and
delivered as **two reusable workflows** a consuming repo pins by SHA and
Dependabot keeps current. See [README.md](README.md) and the
[documentation](docs/index.md).

It exists because every semantic-release repo used to carry its own copy of the
toolchain, so Dependabot bumped the preset without the writer semantic-release
bundles, the bump passed that repo's CI, and the first Release run on `main`
failed. Here, that bump fails once, on this repo's own Dependabot PR.

## This repo is CI-only and unpublished

`package.json` is `private` with a frozen `0.0.0` placeholder, and
`.releaserc.json` has **no `@semantic-release/npm`**. Its **`dependencies` are the
product**: they are the exact toolchain every consumer's release runs, installed
by the reusable workflows from this repo at the caller's pinned SHA
(`job.workflow_sha`). `devDependencies` are this repo's own tooling and never
reach a consumer (the workflows install with `--prod`). Releases exist only so
Dependabot's github-actions ecosystem can bump the `@<sha>` pins consumers put on
the workflows — **do not** bump `package.json` by hand.

## The public surface

- [`semantic-release.yml`](.github/workflows/semantic-release.yml) — runs the
  release for the caller.
- [`release-check.yml`](.github/workflows/release-check.yml) — the PR check that
  proves the caller's release config works with the toolchain.
- The toolchain in `package.json` `dependencies` — which plugins a consumer's
  `.releaserc.json` may name, and which versions it gets.

Treat workflow input names/defaults as a compatibility surface: add inputs with
safe defaults rather than repurposing existing ones. **Removing a plugin from
`dependencies`** breaks every consumer that names it, so it is a breaking change.
The check context `release-check / release-check` is required in consumers'
rulesets: renaming either job id strands every consumer (see the repository
checklist's "renaming a shared check" rule). Full reference:
[docs/configuration.md](docs/configuration.md).

## Operational invariants that must not regress

- **The toolchain installs outside the caller's workspace.** Both workflows check
  this repo out to `_semantic-release-ci` (`actions/checkout` refuses paths
  outside `GITHUB_WORKSPACE`) and **move it to `$RUNNER_TEMP`** before installing,
  under the pnpm **our** `package.json` pins. Nested in the caller's checkout, the
  install would inherit their `pnpm-workspace.yaml` and `.npmrc`, and
  `@semantic-release/npm` would pack the directory into their tarball.
- **`semantic-release.yml` declares no `permissions:`.** A called workflow asking
  for a scope its caller did not grant fails to start, and the scopes a release
  needs differ per repo (`id-token` only for npm publishers). The caller grants;
  we inherit.
- **`release-check.yml` needs only `contents: read`.** It must keep running on
  Dependabot and fork PRs — the PRs that bump toolchains — so it never takes a
  token, a secret, the network, or a push.
- **The check calls the real plugins.** `src/release-check.ts` loads the config
  with the same `cosmiconfig('release')` lookup semantic-release uses and calls
  the installed commit-analyzer and release-notes-generator. Never replace it
  with `semantic-release --dry-run`, which exits on a PR before rendering notes
  (see [docs/release-check.md](docs/release-check.md)).
- **npm publishes before the tag.** The check fails a config that would publish
  in semantic-release's `publish` step, after the tag is pushed
  ([docs/publish-order.md](docs/publish-order.md)). Loosening that rule
  reintroduces tags with no package behind them.

`test/workflow-contract.test.ts` guards the workflow invariants.

## Reusable-workflow gotcha: no `./`-local actions across the boundary

A reusable workflow's `uses: ./…` resolves against the **caller's** checkout, so
the two shipped workflows inline their setup rather than referencing
`./.github/actions/setup`, which is used only by this repo's own CI.

## Documentation — update it as part of every task

- **Read first.** Before editing, read the relevant `docs/` page(s) and this file.
- **Update in the same PR.** If your change adds, alters, or contradicts a
  documented input, plugin, or invariant, fix the doc in the same PR.
- **Docs follow OKF.** Pages under `docs/` use OKF frontmatter and stay reachable
  from [docs/index.md](docs/index.md) — see [docs/okf-format.md](docs/okf-format.md).

## Repository conformance

This repo is held to the shared
[repository checklist](https://github.com/rmartz/ai/blob/main/docs/guidance/repository-checklist.md)
and **self-manages** its own config — fix conformance gaps directly here, in a PR.

- **Hygiene** arrives via the [`repo-hygiene.yml`](.github/workflows/repo-hygiene.yml)
  caller, running conflict-markers, action-pins, package-pins, docs-links,
  md-pairing, okf, okf-index, and file-caps.
- **Safe bot merge:** [`merge-safety.yml`](.github/workflows/merge-safety.yml)
  (required check `merge-safety`) and [`bot-automerge.yml`](.github/workflows/bot-automerge.yml).
- **PR policy:** [`pr-policy.yml`](.github/workflows/pr-policy.yml) runs
  `rmartz/pr-policy-action` on every PR and posts the `pr-policy` verdict. It
  passes `skip-uat: true`: the repo has nothing to user-test. Its `title` check
  validates PR titles (Conventional Commits, breaking-marker and type rules), so
  there is no separate PR-title-lint workflow.
- **CI, releases, labels** are owned here: typecheck / lint / format / test and
  the dogfooded `release-check` ([ci.yml](.github/workflows/ci.yml)), the post-merge commit-convention tripwire, and the dogfooded
  [release.yml](.github/workflows/release.yml).

## Common commands

```bash
pnpm install                 # deps (run in each worktree first)
pnpm run typecheck           # tsc --noEmit
pnpm run lint                # eslint (incl. max-lines caps)
pnpm run format:check        # prettier --check
pnpm run test                # vitest
pnpm run release-check       # the check, against this repo's own .releaserc.json
node src/bin/release-check.ts --cwd ../other-repo   # …or against another checkout
```

The TypeScript runs directly on Node 24's type stripping — there is no build
step, so source must stay erasable-only (`erasableSyntaxOnly`: no enums,
namespaces, or parameter properties) and import siblings with a `.ts` extension.

Before pushing, run `ai-pre-push-verify -C <worktree>` and fix every failure.

## Code standards

- **Strict TypeScript.** No `any`, no `@ts-ignore`. Favor type inference.
- **Named exports only**; no default exports. Prefer `async/await`.
- **Pin dependencies** to full `major.minor.patch` (keep the `^`), and **SHA-pin**
  every third-party GitHub Action with a `# vX.Y.Z` comment.

## Worktrees, PRs, and releases

- **Work in a dedicated worktree** under `.git-worktrees/` (`ai-new-worktree`),
  never on `main` in the root checkout. Run `pnpm install` in a fresh worktree.
- **PR titles must be Conventional Commits.** The repo squash-merges using the PR
  title, so it is the only subject that reaches `main`.
- **Releases are automatic** via this repo's own `semantic-release.yml` on every
  push to `main`. `feat:` → minor; `fix:` / `perf:` → patch; a breaking `!` →
  major; `docs:` / `chore:` / `style:` / `refactor:` / `test:` / `ci:` / `build:`
  do not release.
- **What is product code.** A change consumers should receive takes a
  **releasing** type (`feat:` / `fix:` / `perf:`), never `ci:`: the two shipped
  workflows, `src/`, and the `dependencies` toolchain (Dependabot already titles
  those bumps `fix`). The shipped workflows count as product code **even though**
  `ci.yml` and `release.yml` call them by local path to dogfood them — the
  dogfood is a test of the product, not a reason to reclassify it. The `ci` type
  is for this repo's **own** CI only: `ci.yml`, `release.yml`,
  `repo-hygiene.yml`, `pr-policy.yml` and other callers, and
  `.github/actions/setup`.
- **A toolchain major** (e.g. the preset) is taken only once the `release-check`
  job passes on its Dependabot PR. A red one is the guard working: leave it open
  (or close it) until the rest of the toolchain catches up.

## Agent directive files

- **`AGENTS.md` is the single source of truth** for agent instructions — author
  directives here, never in `CLAUDE.md`.
- **Every `AGENTS.md` has a companion `CLAUDE.md`** (a bare `@AGENTS.md` import),
  enforced by the `md-pairing` check.
