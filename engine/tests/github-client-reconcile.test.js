/**
 * github-client additions for the scheduled reconciler: removeLabel, listIssuesByLabel, listWorkflowRuns.
 * Octokit talks through global fetch, so the HTTP layer is stubbed there (no network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGitHubClient } from '../orchestrator/github-client.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

const urlOf = call => new URL(call[0] instanceof Request ? call[0].url : String(call[0]));

describe('removeLabel', () => {
  it('treats a missing label (404) as already removed', async () => {
    fetchMock.mockResolvedValue(json(404, { message: 'Label does not exist' }));
    await expect(createGitHubClient('t').removeLabel('o', 'r', 1, 'status:awaiting-agent')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rethrows other errors', async () => {
    fetchMock.mockResolvedValue(json(403, { message: 'forbidden' }));
    await expect(createGitHubClient('t').removeLabel('o', 'r', 1, 'x')).rejects.toThrow(/forbidden/);
  });
});

describe('listIssuesByLabel', () => {
  it('paginates through every page, asking for open issues with the label', async () => {
    const page = n => Array.from({ length: n }, (_, i) => ({ number: i + 1 }));
    fetchMock.mockResolvedValueOnce(json(200, page(100))).mockResolvedValueOnce(json(200, page(3)));
    const out = await createGitHubClient('t').listIssuesByLabel('o', 'r', 'status:awaiting-agent');
    expect(out).toHaveLength(103);
    const u = urlOf(fetchMock.mock.calls[1]);
    expect(u.pathname).toBe('/repos/o/r/issues');
    expect(u.searchParams.get('labels')).toBe('status:awaiting-agent');
    expect(u.searchParams.get('state')).toBe('open');
    expect(u.searchParams.get('page')).toBe('2');
  });
});

describe('listWorkflowRuns', () => {
  it('queries the workflow file with the created filter and unwraps workflow_runs', async () => {
    fetchMock.mockResolvedValue(json(200, { total_count: 1, workflow_runs: [{ id: 7 }] }));
    const out = await createGitHubClient('t').listWorkflowRuns('o', 'r', 'copilot-agent-dev.yml',
      { created: '>=2026-10-06T07:49:50Z', event: 'workflow_dispatch' });
    expect(out).toEqual([{ id: 7 }]);
    const u = urlOf(fetchMock.mock.calls[0]);
    expect(u.pathname).toBe('/repos/o/r/actions/workflows/copilot-agent-dev.yml/runs');
    expect(u.searchParams.get('created')).toBe('>=2026-10-06T07:49:50Z');
    expect(u.searchParams.get('event')).toBe('workflow_dispatch');
  });
});
