import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGitHubClient } from '../orchestrator/github-client.js';

function json(status, data, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

describe('github-client', () => {
  let fetchMock;
  let client;

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1);
    return { url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
  };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = createGitHubClient('tok');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('listComments returns a single short page and sends the token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, [{ id: 1 }, { id: 2 }]));
    const out = await client.listComments('o', 'r', 7);
    expect(out).toEqual([{ id: 1 }, { id: 2 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/repos/o/r/issues/7/comments');
    expect(String(url)).toContain('per_page=100');
    expect(init.headers.authorization).toBe('token tok');
  });

  it('listComments paginates until a short page', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    fetchMock
      .mockResolvedValueOnce(json(200, full))
      .mockResolvedValueOnce(json(200, [{ id: 100 }]));
    const out = await client.listComments('o', 'r', 7);
    expect(out).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('page=2');
  });

  it('createComment and updateComment return response data', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 9 }));
    expect(await client.createComment('o', 'r', 1, 'hi')).toEqual({ id: 9 });
    expect(lastCall()).toMatchObject({
      method: 'POST', body: { body: 'hi' },
      url: expect.stringContaining('/repos/o/r/issues/1/comments'),
    });

    fetchMock.mockResolvedValueOnce(json(200, { id: 10 }));
    expect(await client.updateComment('o', 'r', 10, 'new')).toEqual({ id: 10 });
    expect(lastCall()).toMatchObject({
      method: 'PATCH', body: { body: 'new' },
      url: expect.stringContaining('/repos/o/r/issues/comments/10'),
    });
  });

  it('addLabels skips empty input and posts non-empty labels', async () => {
    await client.addLabels('o', 'r', 1, []);
    await client.addLabels('o', 'r', 1, undefined);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(json(200, []));
    await client.addLabels('o', 'r', 1, ['status:needs-human']);
    expect(lastCall()).toMatchObject({
      method: 'POST',
      url: expect.stringContaining('/repos/o/r/issues/1/labels'),
      body: { labels: ['status:needs-human'] },
    });
  });

  it('triggerWorkflow dispatches with ref and inputs', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.triggerWorkflow('o', 'r', 'wf.yml', 'main', { a: '1' });
    expect(lastCall()).toMatchObject({
      method: 'POST',
      url: expect.stringContaining('/repos/o/r/actions/workflows/wf.yml/dispatches'),
      body: { ref: 'main', inputs: { a: '1' } },
    });
  });

  it('getCollaboratorPermission returns the permission level', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { permission: 'write' }));
    expect(await client.getCollaboratorPermission('o', 'r', 'u')).toBe('write');
    expect(lastCall().url).toContain('/repos/o/r/collaborators/u/permission');
  });

  it('retries retryable statuses with exponential back-off, then succeeds', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(json(503, { message: 'boom' }))
      .mockResolvedValueOnce(json(502, { message: 'boom' }))
      .mockResolvedValueOnce(json(201, { id: 1 }));
    const p = client.createComment('o', 'r', 1, 'x');
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await p).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('honours the Retry-After header on 429', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(json(429, { message: 'rate' }, { 'retry-after': '5' }))
      .mockResolvedValueOnce(json(201, { id: 2 }));
    const p = client.createComment('o', 'r', 1, 'x');
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ id: 2 });
  });

  it('does not retry non-retryable errors', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { message: 'nope' }));
    await expect(client.createComment('o', 'r', 1, 'x')).rejects.toThrow('nope');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after three attempts on persistent retryable errors', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => json(500, { message: 'down' }));
    const assertion = expect(client.createComment('o', 'r', 1, 'x')).rejects.toThrow('down');
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
