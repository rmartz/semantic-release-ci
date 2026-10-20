/**
 * Find npm versions that were published but never tagged.
 *
 * An npm publisher publishes in semantic-release's `prepare` step, before the tag
 * is pushed (docs/publish-order.md). When the tag push then fails, as with a
 * transient GitHub 500, the version is on the registry and the tag is not. Every
 * later run recomputes that same version from the last tag and fails `npm publish`
 * with E403, so the repo cannot release again until someone pushes the tag by hand
 * (rmartz/pr-lifecycle 11.1.0). The release workflow tags these orphans before it
 * runs semantic-release, so the next run picks up from them instead.
 * See docs/orphaned-releases.md.
 */

export type PublishedVersion = { version: string; gitHead: string | undefined };

export type OrphanedRelease = { version: string; tag: string; gitHead: string };

type Input = {
  published: PublishedVersion[];
  tags: string[];
  tagFormat: string;
  isAncestor: (sha: string) => boolean;
};

// semantic-release's own default `tagFormat`.
export const DEFAULT_TAG_FORMAT = 'v${version}';

const VERSION_PLACEHOLDER = '${version}';
const STABLE_VERSION = /^\d+\.\d+\.\d+$/;

const tagFor = (tagFormat: string, version: string) =>
  tagFormat.replace(VERSION_PLACEHOLDER, version);

const versionOfTag = (tagFormat: string) => {
  const [prefix = '', suffix = ''] = tagFormat.split(VERSION_PLACEHOLDER);
  return (tag: string) => {
    if (!tag.startsWith(prefix) || !tag.endsWith(suffix)) {
      return undefined;
    }
    const version = tag.slice(prefix.length, tag.length - suffix.length);
    return STABLE_VERSION.test(version) ? version : undefined;
  };
};

const compareVersions = (a: string, b: string) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

/**
 * The published stable versions newer than the last tagged one, with no tag of
 * their own, published from a commit already on this branch, oldest first.
 * Prereleases are left alone: the fleet releases only from `main`. A repo with no
 * tag yet has nothing to recover: versions published before it adopted this
 * `tagFormat` are not orphans of a failed push.
 */
export function findOrphanedReleases({
  published,
  tags,
  tagFormat,
  isAncestor,
}: Input): OrphanedRelease[] {
  const tagged = tags
    .map(versionOfTag(tagFormat))
    .filter((version) => version !== undefined)
    .sort(compareVersions);
  const lastTagged = tagged.at(-1);
  if (lastTagged === undefined) {
    return [];
  }
  const existing = new Set(tags);

  return published
    .filter(({ version }) => STABLE_VERSION.test(version))
    .filter(({ version }) => compareVersions(version, lastTagged) > 0)
    .filter(({ version }) => !existing.has(tagFor(tagFormat, version)))
    .flatMap(({ version, gitHead }) =>
      gitHead !== undefined && isAncestor(gitHead)
        ? [{ version, tag: tagFor(tagFormat, version), gitHead }]
        : [],
    )
    .sort((a, b) => compareVersions(a.version, b.version));
}
