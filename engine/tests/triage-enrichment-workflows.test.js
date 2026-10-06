/**
 * engine/tests/triage-enrichment-workflows.test.js
 *
 * Static regression guards for the triage -> BA enrichment automation on the
 * Azure AI Foundry runtime (ADR-332, found while testing issue #363):
 *
 *   1. On non-dispatch triggers (e.g. `issues.opened`) RUNTIME_CREDENTIAL must be
 *      empty, NOT GITHUB_TOKEN, so the script falls through to the runtime's
 *      `credential_ref` (AZURE_OPENAI_API_KEY). A non-empty GITHUB_TOKEN always
 *      won and produced a 401 from Azure.
 *   2. Labels applied by GITHUB_TOKEN never trigger `issues.labeled` runs, so triage
 *      must dispatch the enrichment workflow itself when it routes to `agent:ba`.
 *
 * The `.github/` copies must stay byte-identical to the `src/.github/` mirrors (ADR-006).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => readFileSync(resolve(ROOT, rel), 'utf8');

const CREDENTIAL_WORKFLOWS = ['copilot-agent-triage.yml', 'copilot-agent-ba-enrich.yml'];

describe('RUNTIME_CREDENTIAL fallback (issues-event runs)', () => {
  for (const name of CREDENTIAL_WORKFLOWS) {
    it(`${name}: does not default RUNTIME_CREDENTIAL to GITHUB_TOKEN`, () => {
      const text = read(`.github/workflows/${name}`);
      const line = text.split('\n').find(l => /^\s+RUNTIME_CREDENTIAL:/.test(l));
      expect(line, 'RUNTIME_CREDENTIAL env line present').toBeDefined();
      expect(line).toContain("secrets.AZURE_OPENAI_API_KEY || ''");
      expect(line).not.toMatch(/\|\|\s*secrets\.GITHUB_TOKEN/);
    });

    it(`${name}: script resolves AZURE_OPENAI_API_KEY from runtimes.yml credential_ref`, () => {
      const text = read(`.github/workflows/${name}`);
      expect(text).toMatch(/runtimeCredentialRef === 'AZURE_OPENAI_API_KEY' \? process\.env\.AZURE_OPENAI_API_KEY/);
    });
  }
});

describe('triage dispatches BA enrichment directly', () => {
  const triage = read('.github/workflows/copilot-agent-triage.yml');

  it('grants actions: write so workflow_dispatch is permitted', () => {
    const perms = triage.slice(triage.indexOf('\npermissions:'), triage.indexOf('\njobs:'));
    expect(perms).toMatch(/actions:\s*write/);
  });

  it('dispatches copilot-agent-ba-enrich.yml with issue_number only when agent:ba was applied', () => {
    expect(triage).toMatch(/if \(labelsToApply\.includes\('agent:ba'\)\)/);
    expect(triage).toContain("workflow_id: 'copilot-agent-ba-enrich.yml'");
    expect(triage).toMatch(/inputs:\s*\{ issue_number: String\(issueNumber\) \}/);
  });

  it('dispatches after the triaged label is applied, and surfaces dispatch failure', () => {
    const triagedIdx  = triage.indexOf("labels:       ['triaged']");
    const dispatchIdx = triage.indexOf('createWorkflowDispatch');
    expect(triagedIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(triagedIdx);
    // report.abort() fails the job (core.setFailed) and records the error for the failure footprint.
    expect(triage).toMatch(/report\.abort\(`Could not dispatch BA enrichment/);
  });

  it('target workflow exists and accepts issue_number via workflow_dispatch', () => {
    const enrich = read('.github/workflows/copilot-agent-ba-enrich.yml');
    expect(enrich).toMatch(/workflow_dispatch:/);
    expect(enrich).toMatch(/issue_number:\s*\n\s+description:[^\n]*\n\s+required:\s*true/);
  });
});

describe('mirror parity (ADR-006)', () => {
  for (const name of CREDENTIAL_WORKFLOWS) {
    it(`${name}: .github copy equals src/.github mirror`, () => {
      expect(read(`.github/workflows/${name}`)).toBe(read(`src/.github/workflows/${name}`));
    });
  }
});

describe('orchestrator engine pin', () => {
  // The floating `v3` tag was left on v3.0.0 (May 2026), an engine that cannot route
  // v2 pipelines: every `triaged` + `type:bug` event ended in `no-rule-match`.
  // Pin to an exact release so a stale floating tag cannot silently downgrade routing.
  for (const rel of ['.github/workflows/orchestrator.yml', 'src/.github/workflows/orchestrator.yml']) {
    it(`${rel}: pins the engine to an exact release, not a floating major tag`, () => {
      const line = read(rel).split('\n').find(l => /uses:\s*dmitry-nalivaika\/quorumkit\/engine@/.test(l));
      expect(line, 'engine uses: line present').toBeDefined();
      expect(line).toMatch(/engine@v\d+\.\d+\.\d+\s/);
    });
  }
});

describe('bug-fix pipeline runtime', () => {
  // `runtime: copilot-default` on the dev step sent the Developer Agent to the legacy
  // GitHub Models host (models.inference.ai.azure.com), which no longer resolves
  // (ENOTFOUND), so every bug-fix run failed at step 1. Steps must inherit the
  // default runtime from src/runtimes.yml instead of overriding it.
  it('src/pipelines/bug-fix-pipeline.yml: dev step does not override the runtime', () => {
    const text = read('src/pipelines/bug-fix-pipeline.yml');
    expect(text).not.toMatch(/^\s+runtime:\s*copilot-default/m);
  });
});
