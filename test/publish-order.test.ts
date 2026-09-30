import { describe, expect, it } from 'vitest';

import { checkPublishOrder } from '../src/publish-order.ts';

const npm = (config: Record<string, unknown> = {}) => ({ name: '@semantic-release/npm', config });
const exec = (config: Record<string, unknown>) => ({ name: '@semantic-release/exec', config });
const github = { name: '@semantic-release/github', config: {} };

describe('checkPublishOrder', () => {
  it('passes a publish from exec prepareCmd after a non-publishing npm plugin', () => {
    expect(
      checkPublishOrder([npm({ npmPublish: false }), exec({ prepareCmd: 'npm publish' }), github]),
    ).toEqual([]);
  });

  it('passes a config that publishes nothing to npm', () => {
    expect(checkPublishOrder([github])).toEqual([]);
    expect(checkPublishOrder([npm({ npmPublish: false }), github])).toEqual([]);
  });

  it("fails @semantic-release/npm's own publish, which runs after the tag", () => {
    expect(checkPublishOrder([npm(), github])).toEqual([
      expect.stringContaining('"@semantic-release/npm" publishes after the tag is pushed'),
    ]);
    expect(checkPublishOrder([npm({ npmPublish: true })])).toHaveLength(1);
  });

  it('fails an exec publish in publishCmd', () => {
    expect(
      checkPublishOrder([npm({ npmPublish: false }), exec({ publishCmd: 'pnpm publish' })]),
    ).toEqual([expect.stringContaining('publishes in "publishCmd"')]);
  });

  it('fails an exec publish listed before the npm plugin sets the version', () => {
    expect(
      checkPublishOrder([exec({ prepareCmd: 'npm publish' }), npm({ npmPublish: false })]),
    ).toEqual([expect.stringContaining('publishes before "@semantic-release/npm"')]);
  });

  it('ignores exec commands that do not publish', () => {
    expect(
      checkPublishOrder([
        exec({ prepareCmd: 'node scripts/stamp.js', publishCmd: 'echo published' }),
        npm({ npmPublish: false }),
      ]),
    ).toEqual([]);
  });
});
