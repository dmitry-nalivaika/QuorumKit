/**
 * GET /api/cost-tokens — cross-feature Cost & Tokens rollup (Issue #335, US-3, FR-009 to FR-014).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer }  from 'node:http';
import { spawn }         from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT     = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DASHBOARD_DIR = resolve(REPO_ROOT, 'engine', 'dashboard');

function getFreePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => res(port)); });
    srv.on('error', rej);
  });
}

// Emits one JSON array per page (like `gh api --paginate`) and records its argv.
function makeGhStub(pages) {
  const dir  = mkdtempSync(join(tmpdir(), 'qk-gh-stub-'));
  const stub = join(dir, 'gh');
  const argvLog = join(dir, 'argv.log');
  const payload = pages.map(p => JSON.stringify(p)).join('\n').replace(/'/g, "'\\''");
  writeFileSync(stub, `#!/usr/bin/env bash\necho "$@" >> '${argvLog}'\ncat <<'PAGES_EOF'\n${payload}\nPAGES_EOF\n`, 'utf8');
  chmodSync(stub, 0o755);
  return { stub, argvLog };
}

const apm = (id, issue, agent, usage, extra = {}) => ({
  id,
  issue_url: `https://api.github.com/repos/o/r/issues/${issue}`,
  html_url: `https://github.com/o/r/issues/${issue}#issuecomment-${id}`,
  created_at: '2026-05-25T10:00:00Z',
  body: 'reply text\n\n```apm-msg\n' + JSON.stringify({
    version: '2', step: 's', agent, summary: 'ok', timestamp: '2026-05-25T10:00:00Z',
    ...(usage ? { usage } : {}), ...extra,
  }) + '\n```',
});
const U = (total, cost) => ({ runtime: 'azure-openai', model: 'gpt-4o', prompt_tokens: total - 1, completion_tokens: 1, total_tokens: total, estimated_cost_usd: cost });
const plain = (id, issue) => ({ id, issue_url: `https://api.github.com/repos/o/r/issues/${issue}`, html_url: '', created_at: '2026-05-25T10:00:00Z', body: 'just a human comment, no block' });

let proc, port, argvLog;

beforeAll(async () => {
  port = await getFreePort();
  const gh = makeGhStub([
    [apm(1, 42, 'dev-agent', U(1000, 0.01)), apm(2, 42, 'qa-agent', undefined), plain(3, 42)],
    [apm(4, 7, 'dev-agent', U(500, null)), apm(5, 7, 'qa-agent', U(200, 0.002)), apm(6, 99, 'ba-agent', U(300, 0.003), { issue: '042', pipeline_id: '042' })],
  ]);
  argvLog = gh.argvLog;
  proc = spawn(process.execPath, ['server.js', '--port', String(port)], {
    cwd: DASHBOARD_DIR,
    env: { ...process.env, QUORUMKIT_PORT: String(port), QUORUMKIT_REPO_URL: 'https://github.com/o/r', QUORUMKIT_TEST_GH_BIN: gh.stub, QUORUMKIT_PIPELINES_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Server start timeout')), 12_000);
    proc.stdout.on('data', c => { if (c.toString().includes(`http://localhost:${port}`)) { clearTimeout(t); res(); } });
    proc.on('error', rej);
    proc.stderr.on('data', () => {});
  });
}, 20_000);

afterAll(() => { if (proc) proc.kill('SIGTERM'); });

const get = p => fetch(`http://127.0.0.1:${port}${p}`);

describe('GET /api/cost-tokens', () => {
  it('rolls usage up per feature across every page of repo-wide comments', async () => {
    const body = await (await get('/api/cost-tokens')).json();
    expect(Object.keys(body.byFeature).sort()).toEqual(['42', '7']);
    expect(body.byFeature['42']).toMatchObject({ totalTokens: 1300, estimatedCostUsd: 0.013, trackedInvocations: 2, untrackedInvocations: 1, partial: true });
    expect(body.byFeature['7']).toMatchObject({ totalTokens: 700, estimatedCostUsd: 0.002, costUnknownInvocations: 1, partial: true });
  });

  it('prefers the apm-msg issue/pipeline_id over the comment location when grouping', async () => {
    const body = await (await get('/api/cost-tokens')).json();
    expect(body.byFeature['99']).toBeUndefined();
    expect(body.byAgent['ba-agent']).toMatchObject({ totalTokens: 300, trackedInvocations: 1 });
  });

  it('rolls usage up per agent across features and totals everything', async () => {
    const body = await (await get('/api/cost-tokens')).json();
    expect(body.byAgent['dev-agent']).toMatchObject({ totalTokens: 1500, estimatedCostUsd: 0.01, trackedInvocations: 2, costUnknownInvocations: 1 });
    expect(body.byAgent['qa-agent']).toMatchObject({ totalTokens: 200, untrackedInvocations: 1 });
    expect(body.total).toMatchObject({ totalTokens: 2000, partial: true });
    expect(body.disclaimer).toMatch(/estimate/i);
  });

  it('ignores comments without an apm-msg block and reports scan metadata', async () => {
    const { meta } = await (await get('/api/cost-tokens')).json();
    expect(meta).toMatchObject({ days: 90, scannedComments: 6, structuredEvents: 5 });
    expect(Number.isNaN(Date.parse(meta.since))).toBe(false);
  });

  it('issues only a read request against the repo-wide comments endpoint (FR-009, FR-012)', async () => {
    await get('/api/cost-tokens?days=30');
    const calls = readFileSync(argvLog, 'utf8').trim().split('\n');
    for (const call of calls) {
      expect(call).toMatch(/^api repos\/[^/\s]+\/[^/\s]+\/issues\/comments\?per_page=100&since=\S+ --paginate$/);
      expect(call).not.toMatch(/-X|--method|-f |-F |--input/);
    }
  });

  it('honours the days window and rejects invalid values', async () => {
    const { meta } = await (await get('/api/cost-tokens?days=30')).json();
    expect(meta.days).toBe(30);
    for (const bad of ['0', '-1', 'abc', '1.5', '366']) {
      expect((await get(`/api/cost-tokens?days=${bad}`)).status).toBe(400);
    }
  });

  it('exposes no write path (Constitution §IX)', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await fetch(`http://127.0.0.1:${port}/api/cost-tokens`, { method });
      expect(res.status).toBe(404);
    }
  });
});
