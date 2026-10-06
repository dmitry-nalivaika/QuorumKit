/**
 * engine/tests/agent-workflow-runtime.test.js
 *
 * Regression guards for #326, #327, #328 (Docs, Release and Tech-Debt agent runs failing).
 *
 * GitHub Models was retired on 2026-07-30. Eight inline agent workflows still fell back to
 * `https://models.inference.ai.azure.com/chat/completions` whenever no `runtime_endpoint` input was
 * supplied (every push / schedule / issue_comment trigger), and that host no longer resolves. Only
 * triage and ba-enrich read `default_runtime` from src/runtimes.yml. These tests pin that every
 * agent workflow resolves its runtime from the registry and has no hardcoded fallback host.
 *
 * `.github/` copies must stay byte-identical to the `src/.github/` mirrors (ADR-006).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => readFileSync(resolve(ROOT, rel), 'utf8');

const RETIRED_HOST = 'models.inference.ai.azure.com';
// dev is dispatched by the Orchestrator and runs through dev-agent-runner.cjs (checked separately).
const INLINE_AGENTS = readdirSync(resolve(ROOT, '.github/workflows'))
  .filter(n => /^copilot-agent-.+\.yml$/.test(n) && n !== 'copilot-agent-dev.yml');

const stripComments = text => text
  .split('\n')
  .filter(l => !/^\s*(#|\/\/)/.test(l))
  .join('\n');

const agentScript = rel => {
  const doc = yaml.load(read(rel));
  const step = Object.values(doc.jobs).flatMap(j => j.steps).find(s => s.id === 'agent');
  return { doc, step };
};

describe('agent workflows have no retired GitHub Models fallback', () => {
  it('finds the inline agent workflows', () => {
    expect(INLINE_AGENTS.length).toBeGreaterThanOrEqual(10);
  });

  for (const name of INLINE_AGENTS) {
    it(`${name}: no executable reference to ${RETIRED_HOST}`, () => {
      expect(stripComments(read(`.github/workflows/${name}`))).not.toContain(RETIRED_HOST);
    });

    it(`${name}: .github copy matches the src/.github mirror`, () => {
      expect(read(`.github/workflows/${name}`)).toBe(read(`src/.github/workflows/${name}`));
    });
  }

  it('dev-agent-runner.cjs has no retired host and matches its mirror', () => {
    const text = read('.github/scripts/dev-agent-runner.cjs');
    expect(stripComments(text)).not.toContain(RETIRED_HOST);
    expect(text).toBe(read('src/.github/scripts/dev-agent-runner.cjs'));
  });
});

describe('agent workflows resolve the runtime from src/runtimes.yml', () => {
  for (const name of INLINE_AGENTS) {
    const rel = `.github/workflows/${name}`;

    it(`${name}: reads default_runtime and credential_ref`, () => {
      const { step } = agentScript(rel);
      expect(step.with.script).toContain("readSafe('src/runtimes.yml')");
      expect(step.with.script).toMatch(/\^default_runtime:/);
      expect(step.with.script).toMatch(/runtimeCredentialRef === 'AZURE_OPENAI_API_KEY' \? process\.env\.AZURE_OPENAI_API_KEY/);
    });

    it(`${name}: exposes AZURE_OPENAI_API_KEY and does not default RUNTIME_CREDENTIAL to GITHUB_TOKEN`, () => {
      const { step } = agentScript(rel);
      expect(step.env).toHaveProperty('AZURE_OPENAI_API_KEY');
      // A non-empty GITHUB_TOKEN here would always win over the runtime's credential_ref (401 from Azure).
      expect(String(step.env.RUNTIME_CREDENTIAL)).not.toMatch(/\|\|\s*secrets\.GITHUB_TOKEN/);
    });

    it(`${name}: aborts when no endpoint resolves instead of calling a default host`, () => {
      const { step } = agentScript(rel);
      expect(step.with.script).toMatch(/if \(!runtimeEndpoint\) \{[\s\S]*?report\.abort\([\s\S]*?return;/);
      expect(step.with.script).not.toMatch(/const requestUrl = !runtimeEndpoint/);
    });
  }

  it('the resolver yields the registry default (Azure Foundry) when no input is supplied', () => {
    const { step } = agentScript('.github/workflows/copilot-agent-qa.yml');
    const script = step.with.script;
    const snippet = script.slice(script.indexOf('const runtimesYaml'), script.indexOf('if (!runtimeCredential)'));
    const env = { AZURE_OPENAI_API_KEY: 'azure-key', GITHUB_TOKEN: 'gh-token' };
    const out = new Function(
      'readSafe', 'process', 'report', 'console',
      `${snippet}; return { runtimeEndpoint, runtimeModel, runtimeCredential, defaultRuntimeName };`,
    )(rel => read(rel), { env }, { abort() {} }, { log() {} });

    const registry = yaml.load(read('src/runtimes.yml'));
    const def = registry.runtimes[registry.default_runtime];
    expect(out.defaultRuntimeName).toBe(registry.default_runtime);
    expect(out.runtimeEndpoint).toBe(def.endpoint);
    expect(out.runtimeModel).toBe(def.model);
    expect(out.runtimeEndpoint).toMatch(/\.services\.ai\.azure\.com\//);
    expect(out.runtimeCredential).toBe('azure-key');
  });
});
