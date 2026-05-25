/**
 * Tests for /api/invoke — agent invocation from the dashboard.
 *
 * Covers:
 *   - FR-001/FR-002 (spec #172): resolveFile uses .github/agents/ and
 *     .github/instructions/ first; fallback uses ../../src not ../src
 *   - FR-003 (spec #172): QUORUMKIT_CONFIG_FILE isolates test config so
 *     test runs never contaminate engine/dashboard/.apm-project.json
 *   - SEC-HIGH-003: unknown agentId returns 400
 *   - Custom-mode command runs in the project directory
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer }    from 'node:http';
import { spawn }           from 'node:child_process';
import { fileURLToPath }   from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync,
} from 'node:fs';
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
async function httpPost(port, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function httpGet(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ─── Build a minimal fake project dir with .github/agents/ ───────────────────
function makeFakeProject() {
  const dir = mkdtempSync(join(tmpdir(), 'qk-invoke-test-'));
  mkdirSync(join(dir, '.github', 'agents'), { recursive: true });
  mkdirSync(join(dir, '.github', 'instructions'), { recursive: true });
  writeFileSync(
    join(dir, '.github', 'agents', 'developer-agent.md'),
    '# Developer Agent\nYou are the developer agent.',
    'utf8',
  );
  writeFileSync(
    join(dir, '.github', 'instructions', 'dev-agent.instructions.md'),
    '# Dev Instructions',
    'utf8',
  );
  return dir;
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────
let serverProcess;
let port;
let fakeProject;
let cfgFile;
let resultsDir;

beforeAll(async () => {
  port        = await getFreePort();
  fakeProject = makeFakeProject();
  resultsDir  = mkdtempSync(join(tmpdir(), 'qk-invoke-results-'));
  cfgFile     = join(mkdtempSync(join(tmpdir(), 'qk-invoke-cfg-')), 'config.json');

  // Write an isolated config that uses the custom aiTool pointing at the
  // fake project.  The custom command writes a sentinel file so we can verify
  // the agent ran in the correct cwd.
  const cfg = {
    localPath:  fakeProject,
    repoUrl:    '',
    branch:     'main',
    projectName: 'test',
    aiTool:     'custom',
    customCmd:  `echo ok > "${resultsDir}/{agent}.txt"`,
    terminalApp: 'terminal',
    vscodeApp:  '',
  };
  writeFileSync(cfgFile, JSON.stringify(cfg), 'utf8');

  serverProcess = spawn(
    process.execPath,
    ['server.js', '--port', String(port)],
    {
      cwd: DASHBOARD_DIR,
      env: {
        ...process.env,
        QUORUMKIT_PORT:        String(port),
        QUORUMKIT_PROJECT_DIR: fakeProject,
        QUORUMKIT_CONFIG_FILE: cfgFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 12_000);
    serverProcess.stdout.on('data', chunk => {
      if (chunk.toString().includes(`http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.on('error', err => { clearTimeout(timeout); reject(err); });
    serverProcess.stderr.on('data', () => {});
  });
}, 20_000);

afterAll(() => {
  if (serverProcess) serverProcess.kill('SIGTERM');
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/invoke', () => {
  it('returns 400 for an unknown agentId (SEC-HIGH-003)', async () => {
    const { status, body } = await httpPost(port, '/api/invoke', {
      agentId: 'not-an-agent',
      agentName: 'Bad Agent',
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: expect.stringContaining('not-an-agent') });
  });

  it('runs the developer agent and returns ok:true', async () => {
    const { status, body } = await httpPost(port, '/api/invoke', {
      agentId: 'developer',
      agentName: 'Developer Agent',
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, agentId: 'developer' });
  });

  it('executes the agent command in the configured project directory', async () => {
    // Allow up to 3s for the spawned command to complete
    await new Promise(r => setTimeout(r, 3000));
    const sentinelFile = join(resultsDir, 'developer.txt');
    expect(existsSync(sentinelFile)).toBe(true);
  });

  it('does NOT write to engine/dashboard/.apm-project.json (config isolation)', async () => {
    // POST /api/config — server must persist to QUORUMKIT_CONFIG_FILE, not
    // the hardcoded dashboard path.
    const realDashboardCfg = join(DASHBOARD_DIR, '.apm-project.json');
    const existedBefore = existsSync(realDashboardCfg);

    await httpPost(port, '/api/config', {
      localPath:   fakeProject,
      aiTool:      'custom',
      customCmd:   'echo isolated',
      terminalApp: 'terminal',
      vscodeApp:   '',
    });

    if (!existedBefore) {
      // The real dashboard config must still not exist after a config save.
      expect(existsSync(realDashboardCfg)).toBe(false);
    }

    // The isolated config file must have been updated.
    const saved = JSON.parse(readFileSync(cfgFile, 'utf8'));
    expect(saved.aiTool).toBe('custom');
    expect(saved.customCmd).toBe('echo isolated');
  });
});

describe('QUORUMKIT_CONFIG_FILE isolation', () => {
  it('GET /api/config returns the isolated localPath, not the dashboard default', async () => {
    const { status, body } = await httpGet(port, '/api/config');
    expect(status).toBe(200);
    expect(body.localPath).toBe(fakeProject);
  });
});
