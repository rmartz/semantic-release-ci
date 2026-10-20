import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_TAG_FORMAT,
  findOrphanedReleases,
  type PublishedVersion,
} from '../orphaned-release.ts';
import { loadReleaseConfig } from '../release-check.ts';

// Usage: node src/bin/tag-orphaned-release.ts   (from the caller's checkout)
// Tags any version the registry has whose tag push failed, so semantic-release
// computes the next version instead of failing to republish it. The release
// workflow runs it right before semantic-release. See docs/orphaned-releases.md.

type PackageJson = {
  name?: string;
  private?: boolean;
  publishConfig?: Record<string, string>;
};

type Packument = { versions?: Record<string, { gitHead?: string }> };

const NPM = '@semantic-release/npm';
const NPMJS = 'https://registry.npmjs.org/';

const cwd = process.cwd();
const skip = (reason: string) => {
  console.log(`No orphaned release to tag: ${reason}.`);
  process.exit(0);
};

const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

const isAncestor = (sha: string) => {
  try {
    git('merge-base', '--is-ancestor', sha, 'HEAD');
    return true;
  } catch {
    return false; // not an ancestor, or a commit this checkout does not have
  }
};

const manifestPath = join(cwd, 'package.json');
if (!existsSync(manifestPath)) {
  skip('no package.json');
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageJson;
if (manifest.private === true || !manifest.name) {
  skip('the package is not published');
}
const name = manifest.name as string;

const loaded = await loadReleaseConfig(cwd);
const plugins = loaded?.config.plugins;
// No `plugins` means semantic-release's defaults, which include @semantic-release/npm.
const publishesToNpm =
  plugins === undefined ||
  plugins.some((entry) => (Array.isArray(entry) ? entry[0] : entry) === NPM);
if (!publishesToNpm) {
  skip(`the release config does not use ${NPM}`);
}
const tagFormat = loaded?.config.tagFormat ?? DEFAULT_TAG_FORMAT;

// Read the registry the package publishes to, as `npm publish` resolves it.
const scope = name.startsWith('@') ? name.split('/')[0] : undefined;
const publishConfig = manifest.publishConfig ?? {};
const registry = (scope && publishConfig[`${scope}:registry`]) || publishConfig.registry || NPMJS;
const url = `${registry.replace(/\/$/, '')}/${name.replace('/', '%2f')}`;
const token = process.env.NPM_TOKEN;
const response = await fetch(url, {
  headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
});
if (response.status === 404) {
  skip(`${name} has never been published`);
}
if (!response.ok) {
  // Recovery only: a lookup failure leaves the release to run exactly as before.
  console.log(`::warning::Could not read ${name} from ${registry} (HTTP ${response.status}).`);
  skip('the registry lookup failed');
}
const packument = (await response.json()) as Packument;
const published: PublishedVersion[] = Object.entries(packument.versions ?? {}).map(
  ([version, metadata]) => ({ version, gitHead: metadata.gitHead }),
);

const orphans = findOrphanedReleases({
  published,
  tags: git('tag', '--list').split('\n').filter(Boolean),
  tagFormat,
  isAncestor,
});
if (orphans.length === 0) {
  skip('every published version is tagged');
}

const server = new URL(process.env.GITHUB_SERVER_URL ?? 'https://github.com');
const remote = `https://x-access-token:${process.env.GITHUB_TOKEN ?? ''}@${server.host}/${process.env.GITHUB_REPOSITORY ?? ''}.git`;
for (const { version, tag, gitHead } of orphans) {
  git('tag', tag, gitHead);
  git('push', remote, `refs/tags/${tag}`);
  console.log(
    `::notice::Tagged ${tag} at ${gitHead}: ${name}@${version} was published from it, ` +
      `but its tag push failed. It has no GitHub Release; semantic-release continues from it.`,
  );
}
