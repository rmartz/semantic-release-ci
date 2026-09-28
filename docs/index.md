---
okf_version: 0.2
---

# Documentation

Documentation for `semantic-release-ci`, the fleet's shared semantic-release,
written in [Open Knowledge Format](okf-format.md).

- [Adopting it in a consuming repo](consuming.md) — the two caller workflows, the
  permissions each needs, npm publishing, and the migration off a repo-local
  toolchain.
- [Configuration reference](configuration.md) — every workflow input, and which
  plugins a release config may name.
- [Why the release check, not `semantic-release --dry-run`](release-check.md) —
  why a dry-run passes on a PR without testing anything, and what the check runs
  instead.
- [The OKF documentation format](okf-format.md) — how these pages are structured
  and validated in this repo.
