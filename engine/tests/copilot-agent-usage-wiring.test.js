/**
 * Usage capture for every chat/completions workflow reachable via the
 * azure-openai runtime kind (Issue #335, FR-001, FR-002, FR-005, FR-015).
 * Structural checks only: embedded github-script bodies cannot run outside Actions.
 */
import { describe, it, expect } from 'vitest';
import fs   from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// workflow slug -> agent identifier recorded in the apm-msg block
const WORKFLOWS = {
  architect: 'architect-agent',
  qa: 'qa-agent',
  reviewer: 'reviewer-agent',
  security: 'security-agent',
  triage: 'triage-agent',
  docs: 'docs-agent',
  release: 'release-agent',
  'tech-debt': 'tech-debt-agent',
  'ba-enrich': 'ba-agent',
};

describe.each(Object.entries(WORKFLOWS))('copilot-agent-%s.yml usage wiring', (slug, agent) => {
  const rel = `.github/workflows/copilot-agent-${slug}.yml`;
  const wf = read(rel);

  it('builds the usage block from the chat/completions response via the shared helper', () => {
    expect(wf).toContain('model-pricing.cjs');
    expect(wf).toContain('usageApmBlock(');
    expect(wf).toContain('response: data');
    expect(wf).toContain(`agent: '${agent}'`);
  });

  it('labels the runtime azure-openai when an endpoint override is in use', () => {
    expect(wf).toContain("runtime: runtimeEndpoint ? 'azure-openai' : 'copilot-default'");
  });

  it('appends the block to the posted body and never lets capture fail the run (FR-005)', () => {
    expect(wf).toMatch(/\+ usageBlock/);
    expect(wf).toMatch(/catch \(e\) \{ core\.warning\(`Usage capture skipped/);
  });

  if (slug !== 'ba-enrich') {
    it('keeps the src/ distribution copy byte-identical (verify-mirror M5)', () => {
      expect(read(`src/${rel}`)).toBe(wf);
    });
  }
});

describe('copilot-agent-ba.yml runtime label', () => {
  it('labels azure-openai runs rather than hardcoding copilot-default', () => {
    const wf = read('.github/workflows/copilot-agent-ba.yml');
    expect(wf).toContain("runtime: runtimeEndpoint ? 'azure-openai' : 'copilot-default'");
    expect(wf).not.toMatch(/runtime: 'copilot-default',/);
  });
});

describe('dev-agent-runner.cjs runtime label', () => {
  it('reports azure-openai as the usage runtime when RUNTIME_ENDPOINT is set', () => {
    const runner = read('.github/scripts/dev-agent-runner.cjs');
    expect(runner).toContain("process.env.RUNTIME_ENDPOINT ? 'azure-openai'");
  });
});
