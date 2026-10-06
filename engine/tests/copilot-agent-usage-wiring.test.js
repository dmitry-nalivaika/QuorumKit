/**
 * Usage capture for every inline chat/completions + Responses workflow (Issue #335, FR-001, FR-002, FR-004, FR-005, FR-015).
 *
 * Usage rides in the single apm-msg block that agent-report.cjs posts in the agent's own
 * complete/fail footprint (schema-valid, orchestrator-conformant). Workflows never write their own
 * apm-msg: they hand the response to the reporter and pass its `usage` output to the final step.
 * Structural checks only: embedded github-script bodies cannot run outside Actions.
 */
import { describe, it, expect } from 'vitest';
import fs   from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const REPO_ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const SLUGS = ['triage', 'ba', 'ba-enrich', 'architect', 'qa', 'reviewer', 'security', 'docs', 'release', 'tech-debt'];

describe.each(SLUGS)('copilot-agent-%s.yml usage wiring', slug => {
  const rel = `.github/workflows/copilot-agent-${slug}.yml`;
  const wf = read(rel);
  const steps = Object.values(yaml.load(wf).jobs)[0].steps;
  const agentStep  = steps.find(s => s.id === 'agent');
  const reportStep = steps.find(s => s.name === 'Report result');

  it('records the parsed LLM response with the reporter, labelled with the resolved runtime and model', () => {
    const script = agentStep.with.script;
    expect(script).toMatch(/report\.recordUsage\(\{ response: data, model: runtimeModel, runtime: defaultRuntimeName \|\| 'azure-openai' \}\)/);
    expect(script.indexOf('recordUsage')).toBeGreaterThan(script.indexOf('await res.json()'));
  });

  it('passes the usage step output to the final reporting step', () => {
    expect(reportStep.env.USAGE).toBe('${{ steps.agent.outputs.usage }}');
  });

  it('never writes its own apm-msg block (the reporter owns the protocol)', () => {
    expect(wf).not.toContain('usageApmBlock');
    expect(wf).not.toMatch(/```apm-msg/);
  });

  if (slug !== 'ba-enrich') {
    it('keeps the src/ distribution copy byte-identical (verify-mirror M5)', () => {
      expect(read(`src/${rel}`)).toBe(wf);
    });
  }
});

describe('dev-agent-runner.cjs usage capture', () => {
  const runner = read('.github/scripts/dev-agent-runner.cjs');

  it('records usage after every LLM call: chat, Responses and Anthropic loops', () => {
    expect(runner.match(/recordUsage\(/g).length).toBeGreaterThanOrEqual(4); // definition + 3 loops
    expect(runner).toContain('recordUsage(runtimeModel, data)');
    expect(runner).toContain('recordUsage(CLAUDE_MODEL,');
  });

  it('labels the usage runtime with the named runtime from the registry', () => {
    expect(runner).toContain('runtime: RUNTIME_NAME || RUNTIME_KIND');
  });

  it('does not hardcode the Claude model in the request', () => {
    expect(runner).toContain('model: CLAUDE_MODEL');
    expect(runner).not.toMatch(/model: 'claude-opus-4-5'/);
  });

  it('keeps the src/ distribution copies byte-identical', () => {
    for (const f of ['dev-agent-runner.cjs', 'model-pricing.cjs', 'agent-report.cjs']) {
      expect(read(`src/.github/scripts/${f}`)).toBe(read(`.github/scripts/${f}`));
    }
  });
});
