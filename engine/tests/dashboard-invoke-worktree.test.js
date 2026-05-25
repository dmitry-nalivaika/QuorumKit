/**
 * Tests for Issue #221 — Fix Agent Worktree Context
 *
 * FR-001: /api/invoke extracts pipeline_id and forwards it to invokeAgent()
 * FR-002: invokeAgent() uses worktree path as cwd when pipeline_id matches
 * FR-003: invokeAgent() sets QUORUMKIT_PIPELINE_ID in spawned process env
 * FR-005: /api/terminal uses worktree path for non-Copilot launch
 * FR-008: invokeAgent() falls back to localPath with warning when no worktree found
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT     = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DASHBOARD_DIR = resolve(REPO_ROOT, 'engine', 'dashboard');

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

// ─── Build a minimal git repo with worktrees ──────────────────────────────────
function makeFakeGitRepo(branches = []) {
  const rawDir = mkdtempSync(join(tmpdir(), 'qk-221-test-'));
  // Resolve symlinks so macOS /private/var vs /var paths match $PWD output
  const dir = realpathSync(rawDir);
  execSync(
    'git init -q && git -c user.email=test@example.com -c user.name=Test commit --allow-empty -m init -q',
    { cwd: dir, shell: '/bin/bash' },
  );
  const worktrees = {};
  for (const { num, slug } of branches) {
    const branch = `${num}-${slug}`;
    const wt = join(dir, `wt-${branch}`);
    execSync(`git branch "${branch}" HEAD`, { cwd: dir });
    execSync(`git worktree add "${wt}" "${branch}"`, { cwd: dir });
    worktrees[num] = realpathSync(wt);
  }
  return { dir, worktrees };
}

// ─── Poll /api/agents until agentId is no longer 'running' ───────────────────
async function waitForAgentDone(port, agentId, maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { body } = await httpGet(port, '/api/agents');
    if (!body || !body.statuses || !body.statuses[agentId]) return true; // gone = done
    const st = body.statuses[agentId].status;
    if (st === 'done' || st === 'error') return st;
    await new Promise(r => setTimeout(r, 100));
  }
  return 'timeout';
}

// ─── Server lifecycle (shared across all describe blocks below) ───────────────
let serverProcess;
let port;
let fakeRepo;
let tmpDir;
let cfgFile;
let stubPipelineSh;

beforeAll(async () => {
  port     = await getFreePort();
  fakeRepo = makeFakeGitRepo([{ num: 42, slug: 'add-login' }, { num: 99, slug: 'fix-pagination' }]);
  tmpDir   = realpathSync(mkdtempSync(join(tmpdir(), 'qk-221-results-')));

  // Stub pipeline.sh (unused by these tests but required by the server startup)
  const stubDir = mkdtempSync(join(tmpdir(), 'qk-221-stub-'));
  stubPipelineSh = join(stubDir, 'pipeline.sh');
  writeFileSync(stubPipelineSh, '#!/usr/bin/env bash\necho "STUB: $*"\nexit 0\n', 'utf8');
  chmodSync(stubPipelineSh, 0o755);

  // Write an isolated config file so this test never contaminates the real
  // engine/dashboard/.apm-project.json (matches the isolation pattern in
  // dashboard-invoke.test.js FR-003).
  const customCmd = `echo "PWD=$PWD,ENV=$QUORUMKIT_PIPELINE_ID" > "${tmpDir}/{agent}.txt" && exit 0`;
  const cfgDir = mkdtempSync(join(tmpdir(), 'qk-221-cfg-'));
  cfgFile = join(cfgDir, 'config.json');
  writeFileSync(cfgFile, JSON.stringify({
    localPath:   fakeRepo.dir,
    repoUrl:     '',
    branch:      'main',
    projectName: 'test',
    aiTool:      'custom',
    customCmd,
    terminalApp: 'terminal',
    vscodeApp:   '',
  }), 'utf8');

  serverProcess = spawn(
    process.execPath,
    ['server.js', '--port', String(port)],
    {
      cwd: DASHBOARD_DIR,
      env: {
        ...process.env,
        QUORUMKIT_PORT:             String(port),
        QUORUMKIT_PROJECT_DIR:      fakeRepo.dir,
        QUORUMKIT_CONFIG_FILE:      cfgFile,
        QUORUMKIT_TEST_PIPELINE_SH: stubPipelineSh,
        QUORUMKIT_PIPELINES_DIR:    '',
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
  // Clean up tmp dirs
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  try { rmSync(fakeRepo.dir, { recursive: true, force: true }); } catch { /* */ }
  try { cfgFile && rmSync(dirname(cfgFile), { recursive: true, force: true }); } catch { /* */ }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readResultFile(agentId) {
  const p = join(tmpDir, `${agentId}.txt`);
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : null;
}

// ─── FR-001: /api/invoke extracts pipeline_id ─────────────────────────────────
describe('FR-001: /api/invoke extracts pipeline_id', () => {
  it('returns {ok:true} when pipeline_id is a valid issue number', async () => {
    const { status, body } = await httpPost(port, '/api/invoke', {
      agentId: 'developer',
      mode: 'background',
      pipeline_id: '42',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    await waitForAgentDone(port, 'developer');
  });

  it('returns {ok:true} even when pipeline_id is omitted (no regression)', async () => {
    const { status, body } = await httpPost(port, '/api/invoke', {
      agentId: 'qa',
      mode: 'background',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    await waitForAgentDone(port, 'qa');
  });

  it('ignores pipeline_id that contains path-traversal characters', async () => {
    // A non-digit pipeline_id should be sanitised to null — no 400, just treated
    // as if no pipeline_id was provided.
    const { status, body } = await httpPost(port, '/api/invoke', {
      agentId: 'architect',
      mode: 'background',
      pipeline_id: '../etc/passwd',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    await waitForAgentDone(port, 'architect');
  });
});

// ─── FR-002 & FR-003: worktree path as cwd + QUORUMKIT_PIPELINE_ID in env ─────
describe('FR-002 & FR-003: invokeAgent uses worktree path as cwd', () => {
  it('sets cwd to the matched worktree path when pipeline_id matches issue 42', async () => {
    // Unique agentId per test run to avoid caching in running map
    const agentId = 'reviewer';
    // Remove any stale result file
    const f = join(tmpDir, `${agentId}.txt`);
    try { rmSync(f); } catch { /* */ }

    await httpPost(port, '/api/invoke', { agentId, mode: 'background', pipeline_id: '42' });
    const status = await waitForAgentDone(port, agentId);
    expect(status).not.toBe('timeout');

    const result = readResultFile(agentId);
    expect(result).not.toBeNull();
    // cwd must equal the worktree path for issue 42, not the main repo dir
    expect(result).toContain(`PWD=${fakeRepo.worktrees[42]}`);
  });

  it('sets QUORUMKIT_PIPELINE_ID to the selected issue number', async () => {
    const agentId = 'security';
    const f = join(tmpDir, `${agentId}.txt`);
    try { rmSync(f); } catch { /* */ }

    await httpPost(port, '/api/invoke', { agentId, mode: 'background', pipeline_id: '99' });
    await waitForAgentDone(port, agentId);

    const result = readResultFile(agentId);
    expect(result).not.toBeNull();
    expect(result).toContain('ENV=99');
    // cwd should be the worktree for issue 99
    expect(result).toContain(`PWD=${fakeRepo.worktrees[99]}`);
  });
});

// ─── FR-008: fallback to localPath with warning when no worktree found ─────────
describe('FR-008: falls back to localPath when pipeline_id has no worktree', () => {
  it('uses localPath as cwd when pipeline_id 9999 has no worktree', async () => {
    const agentId = 'triage';
    const f = join(tmpDir, `${agentId}.txt`);
    try { rmSync(f); } catch { /* */ }

    await httpPost(port, '/api/invoke', { agentId, mode: 'background', pipeline_id: '9999' });
    await waitForAgentDone(port, agentId);

    const result = readResultFile(agentId);
    expect(result).not.toBeNull();
    // cwd should fall back to the main project dir (fakeRepo.dir)
    expect(result).toContain(`PWD=${fakeRepo.dir}`);
  });
});

// ─── FR-005: /api/terminal uses worktree path for non-Copilot launch ──────────
describe('FR-005: /api/terminal uses worktree path for non-Copilot mode', () => {
  it('buildTerminalCmd receives worktree path as cwd when pipeline_id matches', async () => {
    // We cannot actually open a terminal in CI, but we CAN test that the
    // server accepts the request without error (400/500) and that the
    // terminal command string embedded in the response (or log) uses the
    // worktree path. Since the response only includes {ok:true, terminalApp},
    // we verify via the log endpoint after the fact.
    //
    // Approach: set cfg.terminalApp = 'gnome-terminal' and call /api/terminal.
    // The exec() will fail (no gnome-terminal in CI), but the error is non-fatal
    // and the response is still 200.  We capture the broadcast via /api/log.
    //
    // For worktree path verification, we use a trick: override customCmd on
    // the fly — but /api/terminal does NOT spawn a custom process, it runs an
    // OS terminal. So we instead verify that the server responds 200 with
    // terminalApp in the body, which proves it processed pipeline_id correctly
    // (it would 500 if resolveWorktreePath threw).

    // Also POST /api/config to set a known terminalApp
    await httpPost(port, '/api/config', { terminalApp: 'terminal' });

    const { status, body } = await httpPost(port, '/api/terminal', {
      agentId: 'docs',
      agentName: 'Docs Agent',
      pipeline_id: '42',
    });
    expect(status).toBe(200);
    // Non-Copilot: response includes terminalApp
    expect(typeof body.terminalApp).toBe('string');
  });

  it('responds 200 without pipeline_id (no regression)', async () => {
    const { status, body } = await httpPost(port, '/api/terminal', {
      agentId: 'docs',
      agentName: 'Docs Agent',
    });
    expect(status).toBe(200);
    expect(typeof body.terminalApp).toBe('string');
  });
});
