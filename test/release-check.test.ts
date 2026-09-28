import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkReleaseConfig, loadReleaseConfig } from '../src/release-check.ts';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const check = async (name: string) => {
  const cwd = fixture(name);
  const loaded = await loadReleaseConfig(cwd);
  if (!loaded) {
    throw new Error(`fixture ${name} has no release config`);
  }
  return checkReleaseConfig(loaded, { cwd, repositoryUrl: 'https://github.com/owner/repo.git' });
};

describe('loadReleaseConfig', () => {
  it('reads a package.json#release config, as semantic-release does', async () => {
    const loaded = await loadReleaseConfig(fixture('package-json-config'));
    expect(loaded?.filepath).toMatch(/package\.json$/);
  });

  it('returns null when the directory has no release config', async () => {
    expect(await loadReleaseConfig(fixture('empty'))).toBeNull();
  });
});

describe('checkReleaseConfig', () => {
  it('passes a conventionalcommits config, including a pre-1.0 breaking cap', async () => {
    const { failures, notes } = await check('valid');
    expect(failures).toEqual([]);
    expect(notes).toContain('Release types: feat! → minor, feat → minor, fix → patch.');
    expect(notes.some((note) => note.startsWith('Release notes render'))).toBe(true);
  });

  it("fails semantic-release's default plugins, whose angular preset drops '!'", async () => {
    const { failures } = await check('angular-default');
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"@semantic-release/commit-analyzer" must set "preset"'),
        expect.stringContaining("does not honor the '!' breaking marker"),
      ]),
    );
  });

  it('fails a plugin the shared toolchain does not ship', async () => {
    const { failures } = await check('missing-plugin');
    expect(failures).toEqual([
      expect.stringContaining('Plugin "@semantic-release/exec" is not provided'),
    ]);
  });

  it('fails a config without the release-notes-generator', async () => {
    const { failures } = await check('no-notes-generator');
    expect(failures).toEqual([
      '"@semantic-release/release-notes-generator" is missing from plugins.',
    ]);
  });
});
