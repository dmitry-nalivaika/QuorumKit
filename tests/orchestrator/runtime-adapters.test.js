import { describe, it, expect, vi } from 'vitest';
import * as copilot from '../../scripts/orchestrator/runtimes/copilot.js';
import * as claude from '../../scripts/orchestrator/runtimes/claude.js';

const fastClock = { now: () => 0, sleep: vi.fn(async () => {}) };

function makeClient() {
  return { triggerWorkflow: vi.fn().mockResolvedValue(undefined) };
}

const COPILOT_RT = { kind: 'copilot', endpoint: 'https://models.github.ai', credential_ref: 'GITHUB_TOKEN' };
const CLAUDE_RT  = { kind: 'claude',  endpoint: 'https://api.anthropic.com', credential_ref: 'ANTHROPIC_API_KEY' };

describe('runtimes/copilot', () => {
  it('exports requiredPermissions including models:read', () => {
    expect(copilot.requiredPermissions.models).toBe('read');
    expect(copilot.requiredPermissions.issues).toBe('write');
  });

  it('dispatches copilot-agent-<slug>.yml with the expected inputs', async () => {
    const client = makeClient();
    const r = await copilot.invoke({
      client, owner: 'o', repo: 'r', agent: 'qa-agent', ref: 'main',
      issueNumber: 10, runId: 'run-1', step: 'qa', iteration: 2,
      runtime: COPILOT_RT, runtimeName: 'copilot-default',
      env: { GITHUB_TOKEN: 'redacted' }, clock: fastClock,
    });
    expect(r).toEqual({ dispatched: true, retries: 0, workflow: 'copilot-agent-qa-agent.yml' });
    expect(client.triggerWorkflow).toHaveBeenCalledWith('o', 'r', 'copilot-agent-qa-agent.yml', 'main', expect.objectContaining({
      issue_number: '10', run_id: 'run-1', step: 'qa', iteration: '2', runtime: 'copilot-default',
    }));
  });

  it('throws runtime-credential-missing when env var is absent — without leaking value', async () => {
    const client = makeClient();
    let err;
    try {
      await copilot.invoke({
        client, owner: 'o', repo: 'r', agent: 'dev-agent', ref: 'main', issueNumber: 1,
        runtime: COPILOT_RT, env: {}, clock: fastClock,
      });
    } catch (e) { err = e; }
    expect(err.code).toBe('runtime-credential-missing');
    expect(err.credential_ref).toBe('GITHUB_TOKEN'); // name only, never a value
    expect(client.triggerWorkflow).not.toHaveBeenCalled();
  });

  it('throws runtime-credential-missing with detail "(none declared)" when credential_ref absent', async () => {
    const client = makeClient();
    let err;
    try {
      await copilot.invoke({
        client, owner: 'o', repo: 'r', agent: 'dev-agent', ref: 'main', issueNumber: 1,
        runtime: { kind: 'copilot', endpoint: 'x' }, env: {}, clock: fastClock,
      });
    } catch (e) { err = e; }
    expect(err.code).toBe('runtime-credential-missing');
    expect(err.credential_ref).toBe('(none declared)');
  });

  it('retries on transient 503 then surfaces success with retries count', async () => {
    const client = {
      triggerWorkflow: vi.fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValue(undefined),
    };
    const r = await copilot.invoke({
      client, owner: 'o', repo: 'r', agent: 'qa-agent', ref: 'main', issueNumber: 1,
      runtime: COPILOT_RT, env: { GITHUB_TOKEN: 'x' }, clock: fastClock,
    });
    expect(r.retries).toBe(1);
    expect(client.triggerWorkflow).toHaveBeenCalledTimes(2);
  });
});

describe('runtimes/claude', () => {
  it('does NOT request models:read scope', () => {
    expect(claude.requiredPermissions.models).toBeUndefined();
  });

  it('dispatches agent-<slug>.yml (Claude convention, ADR-002)', async () => {
    const client = makeClient();
    await claude.invoke({
      client, owner: 'o', repo: 'r', agent: 'dev-agent', ref: 'main',
      issueNumber: 7, runId: 'run-9', step: 'dev', iteration: 1,
      runtime: CLAUDE_RT, runtimeName: 'claude-default',
      env: { ANTHROPIC_API_KEY: 'redacted' }, clock: fastClock,
    });
    expect(client.triggerWorkflow).toHaveBeenCalledWith('o', 'r', 'agent-dev-agent.yml', 'main', expect.any(Object));
  });

  it('flags missing ANTHROPIC_API_KEY as runtime-credential-missing', async () => {
    const client = makeClient();
    await expect(claude.invoke({
      client, owner: 'o', repo: 'r', agent: 'dev-agent', ref: 'main', issueNumber: 1,
      runtime: CLAUDE_RT, env: {}, clock: fastClock,
    })).rejects.toMatchObject({ code: 'runtime-credential-missing', credential_ref: 'ANTHROPIC_API_KEY' });
  });
});
