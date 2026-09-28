import { parseArgs } from 'node:util';

import { checkReleaseConfig, loadReleaseConfig } from '../release-check.ts';

// Usage: node src/bin/release-check.ts [--cwd <repo checkout>]
// Run from this repo's own directory so the plugins resolve from the shared
// toolchain; --cwd points at the repo whose release config is checked.
const { values } = parseArgs({ options: { cwd: { type: 'string' } } });
const cwd = values.cwd ?? process.cwd();

const loaded = await loadReleaseConfig(cwd);
if (!loaded) {
  console.error(`No semantic-release config found in ${cwd}.`);
  process.exit(1);
}

const repository = process.env.GITHUB_REPOSITORY ?? 'owner/repo';
const repositoryUrl = loaded.config.repositoryUrl ?? `https://github.com/${repository}.git`;

console.log(`Checking ${loaded.filepath}`);
const { failures, notes } = await checkReleaseConfig(loaded, { cwd, repositoryUrl });
for (const note of notes) {
  console.log(`  ${note}`);
}
if (failures.length > 0) {
  console.error('\nThe release config does not work with the shared toolchain:');
  for (const failure of failures) {
    console.error(`  ✗ ${failure}`);
  }
  process.exit(1);
}
console.log('\nThe release config works with the shared toolchain.');
