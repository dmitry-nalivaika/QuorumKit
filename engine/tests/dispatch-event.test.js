import { describe, it, expect, vi } from 'vitest';
import { normaliseDispatchEvent, runOrchestrator } from '../orchestrator/index.js';
import { matchEvent } from '../orchestrator/router.js';

const bugPipeline = {
  name: 'bug-fix-pipeline',
  version: '1',
  trigger: { event: 'issues.labeled', labels: ['triaged', 'type:bug'] },
  steps: [{ name: 'dev', agent: 'dev' }],
};

function clientWith(issue) {
  return { getIssue: vi.fn().mockResolvedValue(issue) };
}

describe('normaliseDispatchEvent — workflow_dispatch → synthetic issues.labeled', () => {
  it('re-reads labels from the live issue and produces an issues.labeled event', async () => {
    const client = clientWith({
      number: 369,
      labels: [{ name: 'type:bug' }, { name: 'priority:low' }, 'triaged'],
    });
    const event = await normaliseDispatchEvent({
      client, owner: 'o', repo: 'r',
      payload: { inputs: { issue_number: '369' }, ref: 'refs/heads/main' },
    });

    expect(client.getIssue).toHaveBeenCalledWith('o', 'r', 369);
    expect(event).toEqual({
      type: 'issues.labeled',
      labels: ['type:bug', 'priority:low', 'triaged'],
      issueNumber: 369,
      ref: 'main',
    });
  });

  it('produces an event that the router matches to the bug-fix pipeline', async () => {
    const client = clientWith({ number: 7, labels: [{ name: 'type:bug' }, { name: 'triaged' }] });
    const event = await normaliseDispatchEvent({
      client, owner: 'o', repo: 'r', payload: { inputs: { issue_number: '7' } },
    });
    expect(matchEvent(event, [bugPipeline])?.name).toBe('bug-fix-pipeline');
  });

  it('prefers the repository default branch for ref, falling back to main', async () => {
    const client = clientWith({ number: 1, labels: [] });
    const a = await normaliseDispatchEvent({
      client, owner: 'o', repo: 'r',
      payload: { inputs: { issue_number: '1' }, repository: { default_branch: 'trunk' }, ref: 'refs/heads/x' },
    });
    const b = await normaliseDispatchEvent({
      client, owner: 'o', repo: 'r', payload: { inputs: { issue_number: '1' } },
    });
    expect(a.ref).toBe('trunk');
    expect(b.ref).toBe('main');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['non-numeric', 'abc'],
    ['zero', '0'],
    ['negative', '-4'],
    ['injection-like', '12; rm -rf /'],
  ])('returns null without calling the API when issue_number is %s', async (_n, value) => {
    const client = clientWith({ number: 1, labels: [] });
    const event = await normaliseDispatchEvent({
      client, owner: 'o', repo: 'r', payload: { inputs: { issue_number: value } },
    });
    expect(event).toBeNull();
    expect(client.getIssue).not.toHaveBeenCalled();
  });

  it('returns null when the target is a pull request', async () => {
    const client = clientWith({ number: 5, labels: [{ name: 'triaged' }], pull_request: { url: 'x' } });
    const event = await normaliseDispatchEvent({
      client, owner: 'o', repo: 'r', payload: { inputs: { issue_number: '5' } },
    });
    expect(event).toBeNull();
  });
});

describe('dispatch-driven run through runOrchestrator', () => {
  function makeClient() {
    return {
      listComments: vi.fn().mockResolvedValue([]),
      createComment: vi.fn().mockResolvedValue({ id: 1 }),
      triggerWorkflow: vi.fn().mockResolvedValue(undefined),
      getCollaboratorPermission: vi.fn().mockResolvedValue('write'),
    };
  }

  it('starts the bug-fix pipeline and invokes the dev agent', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['type:bug', 'triaged', 'agent:dev'],
      issueNumber: 369,
      ref: 'main',
    };
    await runOrchestrator({ client, event, pipelines: [bugPipeline], owner: 'o', repo: 'r', aiTool: 'copilot' });

    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'o', 'r', 'copilot-agent-dev.yml', 'main', expect.any(Object)
    );
  });

  it('is idempotent: a second dispatch on an active run does not start another run', async () => {
    const client = makeClient();
    const event = { type: 'issues.labeled', labels: ['type:bug', 'triaged'], issueNumber: 369, ref: 'main' };
    await runOrchestrator({ client, event, pipelines: [bugPipeline], owner: 'o', repo: 'r', aiTool: 'copilot' });

    // Feed the state comment the first run wrote back as the issue's comment history.
    const stateComments = client.createComment.mock.calls
      .filter(c => typeof c[3] === 'string' && c[3].includes('apm-pipeline-state'))
      .map((c, i) => ({ id: i + 1, body: c[3], created_at: new Date().toISOString(), user: { login: 'github-actions[bot]' } }));
    const client2 = makeClient();
    client2.listComments.mockResolvedValue(stateComments);

    await runOrchestrator({ client: client2, event, pipelines: [bugPipeline], owner: 'o', repo: 'r', aiTool: 'copilot' });
    expect(client2.triggerWorkflow).not.toHaveBeenCalled();
  });
});
