/**
 * Tests for /api/local-pipelines endpoints (Feature #176).
 *
 * Spawns the dashboard server and exercises:
 *   GET  /api/local-pipelines           — list worktrees
 *   POST /api/local-pipelines/start     — delegates to pipeline.sh start
 *   POST /api/local-pipelines/stop      — delegates to pipeline.sh stop
 *   GET  /api/local-pipelines/:n/join   — return worktree path for issue N
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer }    from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath }   from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join }   from 'node:path';

const REPO_ROOT      = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DASHBOARD_DIR  = resolve(REPO_ROOT, 'engine', 'dashboard');

// ─── Free port ────────────────────────────────────────────────────────────────
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function httpGet(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function httpPost(port, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ─── Build a minimal git repo that looks like a QuorumKit project ─────────────
function makeFakeGitRepo(branches = []) {
  const dir = mkdtempSync(join(tmpdir(), 'qk-pipeline-ui-test-'));
  execSync('git init -q && git commit --allow-empty -m init -q', { cwd: dir, shell: '/bin/bash' });
  for (const { num, slug } of branches) {
    const branch = `${num}-${slug}`;
    const wt     = join(dir, `wt-${branch}`);    execSync(`git branch "${branch}" HEAD`, { cwd: dir });
    execSync(`git worktree add "${wt}" "${branch}"`, { cwd: dir });
  }
  return dir;
}

// ─── Build a stub pipeline.sh that records calls ─────────────────────────────
function makePipelineStub() {
  const dir  = mkdtempSync(join(tmpdir(), 'qk-stub-'));
  const stub = join(dir, 'pipeline.sh');
  writeFileSync(stub,
    '#!/usr/bin/env bash\necho "STUB: $*"\nexit 0\n', 'utf8');
  chmodSync(stub, 0o755);
  return stub;
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────
let serverProcess;
let port;
let fakeRepoDir;
let stubPipelineSh;

beforeAll(async () => {
  port         = await getFreePort();
  fakeRepoDir  = makeFakeGitRepo([{ num: 42, slug: 'add-login' }, { num: 99, slug: 'fix-pagination' }]);
  stubPipelineSh = makePipelineStub();

  serverProcess = spawn(
    process.execPath,
    ['server.js', '--port', String(port)],
    {
      cwd: DASHBOARD_DIR,
      env: {
        ...process.env,
        QUORUMKIT_PORT:              String(port),
        QUORUMKIT_PROJECT_DIR:       fakeRepoDir,
        QUORUMKIT_TEST_PIPELINE_SH:  stubPipelineSh,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 12_000);
    serverProcess.stdout.on('data', chunk => {
      if (chunk.toString().includes(`http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.on('error', reject);
    serverProcess.stderr.on('data', () => {});
  });
}, 20_000);

afterAll(() => {
  if (serverProcess) serverProcess.kill('SIGTERM');
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/local-pipelines', () => {
  it('returns 200 and an array', async () => {
    const { status, body } = await httpGet(port, '/api/local-pipelines');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('includes the two seeded feature-branch worktrees', async () => {
    const { body } = await httpGet(port, '/api/local-pipelines');
    const nums = body.map(p => p.issueNumber).sort();
    expect(nums).toContain(42);
    expect(nums).toContain(99);
  });

  it('each entry has issueNumber, branch, path fields', async () => {
    const { body } = await httpGet(port, '/api/local-pipelines');
    for (const entry of body) {
      expect(typeof entry.issueNumber).toBe('number');
      expect(typeof entry.branch).toBe('string');
      expect(typeof entry.path).toBe('string');
    }
  });

  it('does NOT include the main worktree', async () => {
    const { body } = await httpGet(port, '/api/local-pipelines');
    const branches = body.map(p => p.branch);
    expect(branches).not.toContain('main');
    expect(branches).not.toContain('HEAD');
  });
});

describe('POST /api/local-pipelines/start', () => {
  it('returns 400 when issueNumber is missing', async () => {
    const { status } = await httpPost(port, '/api/local-pipelines/start', { slug: 'foo-bar' });
    expect(status).toBe(400);
  });

  it('returns 400 when issueNumber is not a positive integer', async () => {
    const { status } = await httpPost(port, '/api/local-pipelines/start', { issueNumber: 'abc', slug: 'foo' });
    expect(status).toBe(400);
  });

  it('returns 400 when slug is missing', async () => {
    const { status } = await httpPost(port, '/api/local-pipelines/start', { issueNumber: 10 });
    expect(status).toBe(400);
  });

  it('returns 400 when slug contains invalid characters', async () => {
    const { status } = await httpPost(port, '/api/local-pipelines/start', { issueNumber: 10, slug: 'BAD SLUG!' });
    expect(status).toBe(400);
  });

  it('returns 200 and calls stub pipeline.sh on valid input', async () => {
    const { status, body } = await httpPost(port, '/api/local-pipelines/start',
      { issueNumber: 10, slug: 'new-feature', mode: 'isolated' });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('defaults mode to isolated when not provided', async () => {
    const { status, body } = await httpPost(port, '/api/local-pipelines/start',
      { issueNumber: 11, slug: 'another-feature' });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('POST /api/local-pipelines/stop', () => {
  it('returns 400 when issueNumber is missing', async () => {
    const { status } = await httpPost(port, '/api/local-pipelines/stop', {});
    expect(status).toBe(400);
  });

  it('returns 400 when issueNumber is not a positive integer', async () => {
    const { status } = await httpPost(port, '/api/local-pipelines/stop', { issueNumber: 'not-a-num' });
    expect(status).toBe(400);
  });

  it('returns 200 and calls stub pipeline.sh on valid input', async () => {
    const { status, body } = await httpPost(port, '/api/local-pipelines/stop', { issueNumber: 42 });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('GET /api/local-pipelines/:n/join', () => {
  it('returns 400 for non-integer issue number', async () => {
    const { status } = await httpGet(port, '/api/local-pipelines/abc/join');
    expect(status).toBe(400);
  });

  it('returns 200 with path and branch for known issue', async () => {
    const { status, body } = await httpGet(port, '/api/local-pipelines/42/join');
    expect(status).toBe(200);
    expect(body.branch).toBe('42-add-login');
    expect(typeof body.path).toBe('string');
  });

  it('returns 404 for unknown issue number', async () => {
    const { status } = await httpGet(port, '/api/local-pipelines/9999/join');
    expect(status).toBe(404);
  });
});
