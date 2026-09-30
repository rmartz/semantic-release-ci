import { cosmiconfig } from 'cosmiconfig';

import { checkPublishOrder } from './publish-order.ts';

/**
 * The release check: prove a repo's semantic-release config works with the shared
 * toolchain, without a token, the network, or a push.
 *
 * `semantic-release --dry-run` cannot do this on a pull request. It detects the
 * `pull_request` event and exits before `analyzeCommits`/`generateNotes`, and
 * forcing past that exit runs `verifyConditions`, whose git push-permission check
 * fails on the read-only token Dependabot and fork PRs get. So we load the same
 * config semantic-release would, then call the real commit-analyzer and
 * release-notes-generator plugins directly on synthetic commits. A preset/writer
 * mismatch, a bad preset option, or a plugin the toolchain does not ship fails
 * here, as does an npm publish that runs after the tag is pushed
 * (see publish-order.ts). See docs/release-check.md.
 */

export type ReleaseConfig = {
  plugins?: unknown[];
  repositoryUrl?: string;
  extends?: unknown;
};

export type LoadedConfig = { config: ReleaseConfig; filepath: string };

type PluginConfig = Record<string, unknown> & { preset?: string };

type Logger = { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

type Commit = { hash: string; message: string };

type ReleasePlugin = {
  analyzeCommits?: (config: PluginConfig, context: object) => Promise<string | null>;
  generateNotes?: (config: PluginConfig, context: object) => Promise<string>;
};

export type CheckResult = { failures: string[]; notes: string[] };

const COMMIT_ANALYZER = '@semantic-release/commit-analyzer';
const NOTES_GENERATOR = '@semantic-release/release-notes-generator';
const REQUIRED_PRESET = 'conventionalcommits';

// semantic-release's own default when a config names no plugins.
const DEFAULT_PLUGINS = [
  COMMIT_ANALYZER,
  NOTES_GENERATOR,
  '@semantic-release/npm',
  '@semantic-release/github',
];

// One commit of each shape the analyzer and the changelog templates treat
// differently. `feat!` is the one a mis-preset analyzer silently drops. It has no
// `BREAKING CHANGE:` footer on purpose: the fleet's merge flow stamps only the `!`,
// and the default angular preset honors the footer but not the marker.
const SAMPLE_COMMITS = {
  breaking: { hash: '0'.repeat(40), message: 'feat!: breaking sample' },
  feat: { hash: '1'.repeat(40), message: 'feat: feature sample' },
  fix: { hash: '2'.repeat(40), message: 'fix: fix sample' },
} satisfies Record<string, Commit>;

const RELEASE_RANK: Record<string, number> = { patch: 1, minor: 2, major: 3 };

const SILENT_LOGGER: Logger = { log: () => {}, error: () => {} };

export async function loadReleaseConfig(cwd: string): Promise<LoadedConfig | null> {
  // The same lookup semantic-release performs, so every config format it accepts
  // (.releaserc, .releaserc.json/.yaml/.js, release.config.*, package.json#release)
  // is checked exactly as the release will read it.
  const result = await cosmiconfig('release').search(cwd);
  if (!result || result.isEmpty) {
    return null;
  }
  return { config: result.config as ReleaseConfig, filepath: result.filepath };
}

const pluginEntry = (entry: unknown): { name: unknown; config: PluginConfig } =>
  Array.isArray(entry)
    ? { name: entry[0], config: (entry[1] ?? {}) as PluginConfig }
    : { name: entry, config: {} };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function checkAnalyzer(
  plugin: ReleasePlugin,
  config: PluginConfig,
  cwd: string,
  result: CheckResult,
) {
  if (!plugin.analyzeCommits) {
    result.failures.push(`${COMMIT_ANALYZER} does not export analyzeCommits.`);
    return;
  }
  const analyze = plugin.analyzeCommits;
  const releaseFor = async (commit: Commit) =>
    analyze(config, { cwd, env: {}, commits: [commit], logger: SILENT_LOGGER });

  try {
    const breaking = await releaseFor(SAMPLE_COMMITS.breaking);
    const feat = await releaseFor(SAMPLE_COMMITS.feat);
    const fix = await releaseFor(SAMPLE_COMMITS.fix);
    result.notes.push(`Release types: feat! → ${breaking}, feat → ${feat}, fix → ${fix}.`);
    if (!feat || !fix) {
      result.failures.push(
        `${COMMIT_ANALYZER} cuts no release for a plain feat/fix commit (feat → ${feat}, fix → ${fix}).`,
      );
    }
    if (!breaking || (RELEASE_RANK[breaking] ?? 0) < (RELEASE_RANK[feat ?? ''] ?? 0)) {
      result.failures.push(
        `${COMMIT_ANALYZER} does not honor the '!' breaking marker (feat! → ${breaking}). ` +
          `Set "preset": "${REQUIRED_PRESET}".`,
      );
    }
  } catch (error) {
    result.failures.push(`${COMMIT_ANALYZER} threw: ${errorMessage(error)}`);
  }
}

async function checkNotes(
  plugin: ReleasePlugin,
  config: PluginConfig,
  cwd: string,
  repositoryUrl: string,
  result: CheckResult,
) {
  if (!plugin.generateNotes) {
    result.failures.push(`${NOTES_GENERATOR} does not export generateNotes.`);
    return;
  }
  const context = {
    cwd,
    env: {},
    options: { repositoryUrl },
    lastRelease: { gitTag: 'v1.0.0', version: '1.0.0' },
    nextRelease: { gitTag: 'v2.0.0', version: '2.0.0', type: 'major', channel: null },
    commits: Object.values(SAMPLE_COMMITS),
    logger: SILENT_LOGGER,
  };
  try {
    const notes = await plugin.generateNotes(config, context);
    if (!notes || notes.trim().length === 0) {
      result.failures.push(`${NOTES_GENERATOR} rendered empty release notes.`);
    } else {
      result.notes.push(`Release notes render (${notes.length} chars).`);
    }
  } catch (error) {
    result.failures.push(
      `${NOTES_GENERATOR} failed to render release notes: ${errorMessage(error)}`,
    );
  }
}

export async function checkReleaseConfig(
  { config }: LoadedConfig,
  { cwd, repositoryUrl }: { cwd: string; repositoryUrl: string },
): Promise<CheckResult> {
  const result: CheckResult = { failures: [], notes: [] };

  if (config.extends !== undefined) {
    result.failures.push(
      '"extends" is not supported: a shareable config would pull plugins from outside the shared toolchain.',
    );
  }

  const entries = (config.plugins ?? DEFAULT_PLUGINS).map(pluginEntry);
  const loaded = new Map<string, { plugin: ReleasePlugin; config: PluginConfig }>();

  for (const { name, config: pluginConfig } of entries) {
    if (typeof name !== 'string') {
      result.failures.push(
        'Inline (non-string) plugins are not supported by the shared toolchain.',
      );
      continue;
    }
    try {
      loaded.set(name, { plugin: (await import(name)) as ReleasePlugin, config: pluginConfig });
    } catch (error) {
      result.failures.push(
        `Plugin "${name}" is not provided by the shared toolchain: ${errorMessage(error)}`,
      );
    }
  }

  for (const name of [COMMIT_ANALYZER, NOTES_GENERATOR]) {
    if (!entries.some((entry) => entry.name === name)) {
      result.failures.push(`"${name}" is missing from plugins.`);
      continue;
    }
    const entry = loaded.get(name);
    if (!entry) {
      continue; // reported above as not provided by the toolchain
    }
    if (entry.config.preset !== REQUIRED_PRESET) {
      result.failures.push(
        `"${name}" must set "preset": "${REQUIRED_PRESET}" (got ${JSON.stringify(entry.config.preset)}).`,
      );
    }
  }

  result.failures.push(...checkPublishOrder(entries));

  const analyzer = loaded.get(COMMIT_ANALYZER);
  if (analyzer) {
    await checkAnalyzer(analyzer.plugin, analyzer.config, cwd, result);
  }
  const generator = loaded.get(NOTES_GENERATOR);
  if (generator) {
    await checkNotes(generator.plugin, generator.config, cwd, repositoryUrl, result);
  }

  return result;
}
