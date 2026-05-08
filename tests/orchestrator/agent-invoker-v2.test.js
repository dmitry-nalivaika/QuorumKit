import { describe, it, expect, vi } from 'vitest';
import { invokeAgentV2 } from '../../scripts/orchestrator/agent-invoker.js';

const fastClock = { now: () => 0, sleep: vi.fn(async () => {}) };
const COPILOT_RT = { kind: 'copilot', endpoint: 'https://x', credential_ref: 'GITHUB_TOKEN' };
const CLAUDE_RT  = { kind: 'claude',  endpoint: 'https://y', credential_ref: 'ANTHROPIC_API_KEY' };

function makeClient() {
  return { triggerWorkflow: vi.fn().mockResolvedValue(undefined) };
}

describe('agent-invoker.invokeAgentV2', () => {
  it('routes copilot kind to runtimes/copilot.js (copilot-agent-*.yml)', async () => {
    const client = makeClient();
    const r = await invokeAgentV2({
      client, owner: 'o', repo: 'r', agent: 'qa-agent', ref: 'main',
      issueNumber: 1, runId: 'run', step: 'qa', iteration: 1,
      runtime: COPILOT_RT, runtimeName: 'copilot-default',
      env: { GITHUB_TOKEN: 'x' }, clock: fastClock,
    });
    expect(r.workflow).toBe('copilot-agent-qa-agent.yml');
    expect(r.runtimeName).toBe('copilot-default');
  });

  it('routes claude kind to runtimes/claude.js (agent-*.yml)', async () => {
    const client = makeClient();
    const r = await invokeAgentV2({
      client, owner: 'o', repo: 'r', agent: 'dev-agent', ref: 'main',
      issueNumber: 1, runtime: CLAUDE_RT, runtimeName: 'claude-default',
      env: { ANTHROPIC_API_KEY: 'x' }, clock: fastClock,
    });
    expect(r.workflow).toBe('agent-dev-agent.yml');
  });

  it('rejects reserved kinds with RUNTIME_KIND_NOT_ENABLED (ADR-005)', async () => {
    const client = makeClient();
    await expect(invokeAgentV2({
      client, owner: 'o', repo: 'r', agent: 'qa-agent', ref: 'main',
      issueNumber: 1, runtime: { kind: 'azure-openai', endpoint: 'x', credential_ref: 'K' },
      env: { K: 'x' }, clock: fastClock,
    })).rejects.toMatchObject({ code: 'RUNTIME_KIND_NOT_ENABLED', kind: 'azure-openai' });
  });

  it('passes runtime-credential-missing through unchanged (does NOT remap to runtime-error)', async () => {
    const client = makeClient();
    let err;
    try {
      await invokeAgentV2({
        client, owner: 'o', repo: 'r', agent: 'qa-agent', ref: 'main',
        issueNumber: 1, runtime: COPILOT_RT, env: {}, clock: fastClock,
      });
    } catch (e) { err = e; }
    expect(err.code).toBe('runtime-credential-missing');
    expect(err.credential_ref).toBe('GITHUB_TOKEN');
  });

  it('remaps retry-exhausted transient failures to runtime-error (FR-030)', async () => {
    const client = { triggerWorkflow: vi.fn().mockRejectedValue({ status: 503 }) };
    let err;
    try {
      await invokeAgentV2({
        client, owner: 'o', repo: 'r', agent: 'qa-agent', ref: 'main',
        issueNumber: 1, runtime: COPILOT_RT, env: { GITHUB_TOKEN: 'x' }, clock: fastClock,
      });
    } catch (e) { err = e; }
    expect(err.code).toBe('runtime-error');
    expect(err.cause).toMatchObject({ status: 503 });
  });
});
