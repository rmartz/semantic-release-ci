import { describe, expect, it } from 'vitest';

import { findOrphanedReleases, type PublishedVersion } from '../src/orphaned-release.ts';

const ON_BRANCH = 'a'.repeat(40);
const OFF_BRANCH = 'b'.repeat(40);

const published = (version: string, gitHead: string | undefined = ON_BRANCH): PublishedVersion => ({
  version,
  gitHead,
});

const find = (versions: PublishedVersion[], tags: string[], tagFormat = 'v${version}') =>
  findOrphanedReleases({
    published: versions,
    tags,
    tagFormat,
    isAncestor: (sha) => sha === ON_BRANCH,
  });

describe('findOrphanedReleases', () => {
  it('finds a version published from this branch whose tag push failed', () => {
    expect(find([published('11.0.2'), published('11.1.0')], ['v11.0.2'])).toEqual([
      { version: '11.1.0', tag: 'v11.1.0', gitHead: ON_BRANCH },
    ]);
  });

  it('finds nothing when every published version is tagged', () => {
    expect(find([published('11.0.2'), published('11.1.0')], ['v11.0.2', 'v11.1.0'])).toEqual([]);
  });

  it('ignores an untagged version older than the last tag', () => {
    expect(find([published('10.0.0'), published('11.0.0')], ['v11.0.0'])).toEqual([]);
  });

  it('ignores a version published from a commit not on this branch', () => {
    expect(find([published('11.1.0', OFF_BRANCH)], ['v11.0.2'])).toEqual([]);
  });

  it('ignores a version with no recorded gitHead', () => {
    expect(find([{ version: '11.1.0', gitHead: undefined }], ['v11.0.2'])).toEqual([]);
  });

  it('ignores prereleases', () => {
    expect(find([published('11.1.0-beta.1')], ['v11.0.2'])).toEqual([]);
  });

  it('finds nothing in a repo with no tag yet', () => {
    expect(find([published('1.0.0')], [])).toEqual([]);
  });

  it('returns several orphans oldest first', () => {
    expect(
      find([published('1.2.0'), published('1.10.0'), published('1.1.0')], ['v1.1.0']).map(
        (orphan) => orphan.tag,
      ),
    ).toEqual(['v1.2.0', 'v1.10.0']);
  });

  it('compares versions numerically, not as strings', () => {
    expect(find([published('1.9.0')], ['v1.10.0'])).toEqual([]);
  });

  it('honors a custom tagFormat', () => {
    expect(find([published('2.1.0')], ['release-2.0.0', 'v9.0.0'], 'release-${version}')).toEqual([
      { version: '2.1.0', tag: 'release-2.1.0', gitHead: ON_BRANCH },
    ]);
  });
});
