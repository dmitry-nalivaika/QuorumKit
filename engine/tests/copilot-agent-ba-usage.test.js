/**
 * copilot-agent-ba.yml — token usage wiring (Issue #335, FR-001, FR-002, FR-003, FR-005).
 * Structural checks only: the embedded github-script bodies cannot run outside Actions.
 */
import { describe, it, expect } from 'vitest';
import fs   from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const REPO_ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const WF = '.github/workflows/copilot-agent-ba.yml';
const steps = yaml.load(read(WF)).jobs.ba.steps;
const llmStep     = steps.find(s => s.name?.startsWith('Run BA / Product Agent'));
const publishStep = steps.find(s => s.name === 'Push spec branch and open PR');

describe('copilot-agent-ba.yml usage wiring', () => {
  it('gives the LLM step an id so its outputs can be referenced', () => {
    expect(llmStep.id).toBeTruthy();
  });

  it('exports the response usage as a step output computed with the pricing helper', () => {
    const script = llmStep.with.script;
    expect(script).toContain("core.setOutput('usage'");
    expect(script).toContain('data.usage');
    expect(script).toContain('model-pricing.cjs');
  });

  it('passes the usage output to the publish step and adds it to the apm-msg payload', () => {
    expect(publishStep.env.LLM_USAGE).toContain(`steps.${llmStep.id}.outputs.usage`);
    const script = publishStep.with.script;
    expect(script).toContain('process.env.LLM_USAGE');
    expect(script).toContain('apmPayload.usage = usage');
    expect(script).toMatch(/JSON\.stringify\(apmPayload/);
  });

  it('omits usage rather than fabricating it when the response had none', () => {
    expect(publishStep.with.script).toMatch(/if \(usage\)/);
  });

  it('keeps the src/ distribution copy byte-identical (verify-mirror M5)', () => {
    expect(read('src/.github/workflows/copilot-agent-ba.yml')).toBe(read(WF));
  });
});
