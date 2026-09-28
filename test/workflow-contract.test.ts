import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Guards the invariants of the two shipped reusable workflows that a passing run
 * here cannot show, because they only bite in a consumer. See AGENTS.md.
 */

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };
type Job = { permissions?: unknown; steps?: Step[] };
type Workflow = { permissions?: Record<string, string>; jobs: Record<string, Job> };

const readWorkflow = (file: string) =>
  parse(readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8')) as Workflow;

const stepsOf = (workflow: Workflow) =>
  Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);

const SHIPPED = ['semantic-release.yml', 'release-check.yml'] as const;

describe.each(SHIPPED)('%s', (file) => {
  const steps = stepsOf(readWorkflow(file));
  const indexOf = (predicate: (step: Step) => boolean) => steps.findIndex(predicate);

  it('checks the toolchain out at the pinned workflow SHA', () => {
    const checkout = steps.find((step) => step.with?.path === '_semantic-release-ci');
    expect(checkout?.with?.ref).toBe('${{ job.workflow_sha }}');
    expect(checkout?.with?.repository).toBe('${{ job.workflow_repository }}');
  });

  it("moves the toolchain out of the caller's workspace before installing it", () => {
    const move = indexOf((step) =>
      /mv .*_semantic-release-ci.* "\$RUNNER_TEMP/.test(step.run ?? ''),
    );
    const install = indexOf((step) =>
      /pnpm -C "\$RUNNER_TEMP\/semantic-release-ci" install/.test(step.run ?? ''),
    );
    expect(move).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(move);
  });

  it('installs only the production toolchain, from the lockfile', () => {
    const install = steps.find((step) => (step.run ?? '').includes('semantic-release-ci" install'));
    expect(install?.run).toContain('--frozen-lockfile');
    expect(install?.run).toContain('--prod');
  });
});

describe('semantic-release.yml', () => {
  const workflow = readWorkflow('semantic-release.yml');

  // A called workflow that asks for a scope its caller did not grant fails to
  // start, so every scope is the caller's to grant (docs/consuming.md).
  it('declares no permissions of its own', () => {
    expect(workflow.permissions).toBeUndefined();
    for (const job of Object.values(workflow.jobs)) {
      expect(job.permissions).toBeUndefined();
    }
  });
});

describe('release-check.yml', () => {
  it('needs nothing beyond contents: read, so it runs on Dependabot and fork PRs', () => {
    expect(readWorkflow('release-check.yml').permissions).toEqual({ contents: 'read' });
  });
});
