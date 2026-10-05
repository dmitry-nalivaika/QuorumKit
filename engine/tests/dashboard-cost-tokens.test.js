/**
 * GET /api/timeline/:issueNumber — costTokens rollup (Issue #335, FR-009 to FR-014).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer }  from 'node:http';
import { spawn }         from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
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

function makeGhStub(comments) {
  const dir  = mkdtempSync(join(tmpdir(), 'qk-gh-stub-'));
  const stub = join(dir, 'gh');
  writeFileSync(stub, `#!/usr/bin/env bash\necho '${JSON.stringify(comments).replace(/'/g, "'\\''")}'\n`, 'utf8');
  chmodSync(stub, 0o755);
  return stub;
}

const apmComment = (id, agent, usage) => ({
  id,
  html_url: `https://github.com/o/r/issues/42#issuecomment-${id}`,
  created_at: '2026-05-25T10:00:00Z',
  body: '```apm-msg\n' + JSON.stringify({
    version: '2', runId: 'r1', step: 's', agent, iteration: 1, outcome: 'success', summary: 'ok',
    timestamp: '2026-05-25T10:00:00Z', ...(usage ? { usage } : {}),
  }) + '\n```',
});

const U = (total, cost) => ({ runtime: 'copilot-default', model: 'gpt-4o', prompt_tokens: total - 1, completion_tokens: 1, total_tokens: total, estimated_cost_usd: cost });

let proc, port;

beforeAll(async () => {
  port = await getFreePort();
  const gh = makeGhStub([
    apmComment(1, 'dev-agent', U(1000, 0.01)),
    apmComment(2, 'dev-agent', U(500, null)),
    apmComment(3, 'qa-agent', undefined),
  ]);
  proc = spawn(process.execPath, ['server.js', '--port', String(port)], {
    cwd: DASHBOARD_DIR,
    env: { ...process.env, QUORUMKIT_PORT: String(port), QUORUMKIT_REPO_URL: 'https://github.com/o/r', QUORUMKIT_TEST_GH_BIN: gh, QUORUMKIT_PIPELINES_DIR: '' },
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

describe('GET /api/timeline/:n costTokens', () => {
  it('passes usage through on apm-msg events and omits it when absent', async () => {
    const body = await (await fetch(`http://127.0.0.1:${port}/api/timeline/42`)).json();
    const events = body.events.filter(e => e.source === 'apm-msg');
    expect(events[0].usage.total_tokens).toBe(1000);
    expect(events[2].usage).toBeNull();
  });

  it('returns a per-feature and per-agent rollup with partial flags', async () => {
    const { costTokens } = await (await fetch(`http://127.0.0.1:${port}/api/timeline/42`)).json();
    expect(costTokens.total).toMatchObject({ totalTokens: 1500, estimatedCostUsd: 0.01, trackedInvocations: 2, untrackedInvocations: 1, costUnknownInvocations: 1, partial: true });
    expect(costTokens.byAgent['dev-agent']).toMatchObject({ totalTokens: 1500, partial: true });
    expect(costTokens.byAgent['qa-agent']).toMatchObject({ totalTokens: 0, untrackedInvocations: 1 });
    expect(costTokens.disclaimer).toMatch(/estimate/i);
  });
});
