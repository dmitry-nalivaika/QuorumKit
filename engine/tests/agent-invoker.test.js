import { describe, it, expect, vi } from 'vitest';
import { invokeAgent } from '../orchestrator/agent-invoker.js';

function makeClient() {
  return { triggerWorkflow: vi.fn().mockResolvedValue(undefined) };
}

describe('agent-invoker.invokeAgent', () => {
  it('triggers copilot-agent-{slug}.yml when aiTool is copilot', async () => {
    const client = makeClient();
    await invokeAgent(client, 'owner', 'repo', 'triage-agent', 42, null, 'copilot');
    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'owner', 'repo', 'copilot-agent-triage-agent.yml', 'main', expect.any(Object)
    );
  });

  it('triggers agent-{slug}.yml when aiTool is claude', async () => {
    const client = makeClient();
    await invokeAgent(client, 'owner', 'repo', 'triage-agent', 42, null, 'claude');
    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'owner', 'repo', 'agent-triage-agent.yml', 'main', expect.any(Object)
    );
  });

  it('defaults to copilot when aiTool is undefined', async () => {
    const client = makeClient();
    await invokeAgent(client, 'owner', 'repo', 'triage-agent', 42, null, undefined);
    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'owner', 'repo', 'copilot-agent-triage-agent.yml', 'main', expect.any(Object)
    );
  });

  it('throws an error with INVALID_AI_TOOL reason when aiTool is unrecognised', async () => {
    const client = makeClient();
    await expect(
      invokeAgent(client, 'owner', 'repo', 'triage-agent', 42, null, 'openai')
    ).rejects.toThrow(/INVALID_AI_TOOL/);
  });
});
