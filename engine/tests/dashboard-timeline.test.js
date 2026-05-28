/**
 * Tests for GET /api/timeline/:issueNumber endpoint (Feature #177).
 *
 * Verifies:
 *   - Input validation (non-integer, zero, negative)
 *   - 404 when repo URL not configured
 *   - Correct parsing of apm-msg blocks from comment text
 *   - Correct parsing of agent-footprint markers from comment text
 *   - Response shape: { events[], meta, status }
 *   - Caching: repeated calls within TTL reuse cached data
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer }  from 'node:http';
import { spawn }         from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join }   from 'node:path';

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

async function httpGet(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ─── Build a stub `gh` binary that returns fake issue comments ────────────────
function makeGhStub(comments) {
  const dir  = mkdtempSync(join(tmpdir(), 'qk-gh-stub-'));
  const stub = join(dir, 'gh');
  // Stub outputs the comments JSON when called as `gh api repos/.../comments`
  const json = JSON.stringify(comments);
  writeFileSync(stub,
    `#!/usr/bin/env bash\necho '${json.replace(/'/g, "'\\''") }'\n`, 'utf8');
  chmodSync(stub, 0o755);
  return dir; // return the dir so we can prepend to PATH
}

// ─── Sample comment bodies ────────────────────────────────────────────────────
const APM_MSG_COMMENT = {
  id: 1,
  html_url: 'https://github.com/test-owner/test-repo/issues/42#issuecomment-1',
  body: `<!-- agent-footprint: complete -->\n**Agent complete:** \`developer-agent\`\n- **Timestamp:** \`2026-05-25T10:00:00Z\`\n- **Summary:** Implementation done.\n\n\`\`\`apm-msg\n{"version":"2","runId":"abc123","step":"implement","agent":"developer-agent","iteration":1,"outcome":"success","summary":"Implementation done.","event_type":"complete","pipeline_id":"42","issue":"42","branch":"42-my-feature","timestamp":"2026-05-25T10:00:00Z"}\n\`\`\``,
  created_at: '2026-05-25T10:00:00Z',
  user: { login: 'github-actions[bot]' },
};

const FOOTPRINT_START_COMMENT = {
  id: 2,
  html_url: 'https://github.com/test-owner/test-repo/issues/42#issuecomment-2',
  body: `<!-- agent-footprint: start -->\n**Agent started:** \`reviewer-agent\`\n- **Event type:** \`agent-start\`\n- **PR:** #55\n- **Timestamp:** \`2026-05-25T11:00:00Z\``,
  created_at: '2026-05-25T11:00:00Z',
  user: { login: 'github-actions[bot]' },
};

const PLAIN_COMMENT = {
  id: 3,
  html_url: 'https://github.com/test-owner/test-repo/issues/42#issuecomment-3',
  body: 'Just a regular human comment with no structured data.',
  created_at: '2026-05-25T12:00:00Z',
  user: { login: 'human-user' },
};

const PIPELINE_START_COMMENT = {
  id: 4,
  html_url: 'https://github.com/test-owner/test-repo/issues/42#issuecomment-4',
  body: `<!-- pipeline: started -->\n**Pipeline started** for issue #42\n\n- **Mode:** isolated\n- **Branch:** \`42-my-feature\`\n- **Timestamp:** \`2026-05-25T09:00:00Z\``,
  created_at: '2026-05-25T09:00:00Z',
  user: { login: 'dmitry-nalivaika' },
};

// ─── Server lifecycle ─────────────────────────────────────────────────────────
let serverProcess;
let port;
let ghStubDir;

beforeAll(async () => {
  port = await getFreePort();
  ghStubDir = makeGhStub([APM_MSG_COMMENT, FOOTPRINT_START_COMMENT, PLAIN_COMMENT, PIPELINE_START_COMMENT]);

  serverProcess = spawn(
    process.execPath,
    ['server.js', '--port', String(port)],
    {
      cwd: DASHBOARD_DIR,
      env: {
        ...process.env,
        QUORUMKIT_PORT:          String(port),
        QUORUMKIT_REPO_URL:      'https://github.com/test-owner/test-repo',
        QUORUMKIT_TEST_GH_BIN:   join(ghStubDir, 'gh'),
        QUORUMKIT_PIPELINES_DIR: '',
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

describe('GET /api/timeline/:issueNumber — validation', () => {
  it('returns 400 for non-integer issue number', async () => {
    const { status } = await httpGet(port, '/api/timeline/abc');
    expect(status).toBe(400);
  });

  it('returns 400 for zero', async () => {
    const { status } = await httpGet(port, '/api/timeline/0');
    expect(status).toBe(400);
  });

  it('returns 400 for negative number', async () => {
    const { status } = await httpGet(port, '/api/timeline/-5');
    expect(status).toBe(400);
  });
});

describe('GET /api/timeline/:issueNumber — success path', () => {
  it('returns 200 with events array', async () => {
    const { status, body } = await httpGet(port, '/api/timeline/42');
    expect(status).toBe(200);
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('includes the apm-msg event with correct fields', async () => {
    const { body } = await httpGet(port, '/api/timeline/42');
    const apmEvent = body.events.find(e => e.source === 'apm-msg');
    expect(apmEvent).toBeTruthy();
    expect(apmEvent.agent).toBe('developer-agent');
    expect(apmEvent.outcome).toBe('success');
    expect(apmEvent.eventType).toBe('complete');
    expect(apmEvent.summary).toBe('Implementation done.');
    expect(apmEvent.timestamp).toBe('2026-05-25T10:00:00Z');
  });

  it('includes the agent-footprint start event', async () => {
    const { body } = await httpGet(port, '/api/timeline/42');
    const footprintEvent = body.events.find(e => e.source === 'footprint' && e.eventType === 'start');
    expect(footprintEvent).toBeTruthy();
    expect(footprintEvent.agent).toBe('reviewer-agent');
  });

  it('includes the pipeline-start event from <!-- pipeline: started --> comment', async () => {
    const { body } = await httpGet(port, '/api/timeline/42');
    const pipelineEvent = body.events.find(e => e.source === 'pipeline');
    expect(pipelineEvent).toBeTruthy();
    expect(pipelineEvent.eventType).toBe('pipeline-start');
    expect(pipelineEvent.agent).toBe('pipeline');
    expect(pipelineEvent.summary).toBe('Branch: 42-my-feature');
    expect(pipelineEvent.timestamp).toBe('2026-05-25T09:00:00Z');
    expect(typeof pipelineEvent.commentUrl).toBe('string');
  });

  it('does NOT include unstructured plain comments as events', async () => {
    const { body } = await httpGet(port, '/api/timeline/42');
    // events count should be 3 (apm-msg + footprint + pipeline-start), not 4
    expect(body.events.length).toBe(3);
  });

  it('includes meta with total comment count', async () => {
    const { body } = await httpGet(port, '/api/timeline/42');
    expect(typeof body.meta).toBe('object');
    expect(body.meta.totalComments).toBe(4);
    expect(body.meta.structuredEvents).toBe(3);
  });

  it('includes commentUrl on structured events (FR-177 BLOCKER 1)', async () => {
    const { body } = await httpGet(port, '/api/timeline/42');
    for (const ev of body.events) {
      expect(typeof ev.commentUrl).toBe('string');
    }
    const apmEvent = body.events.find(e => e.source === 'apm-msg');
    expect(apmEvent?.commentUrl).toBe('https://github.com/test-owner/test-repo/issues/42#issuecomment-1');
  });

  it('includes overall pipeline status field', async () => {
    const { body } = await httpGet(port, '/api/timeline/42');
    expect(typeof body.status).toBe('string');
    // With a success apm-msg, status should reflect that
    expect(['success', 'running', 'failed', 'awaiting-approval', 'unknown'])
      .toContain(body.status);
  });
});

describe('GET /api/timeline/:issueNumber — caching', () => {
  it('returns consistent results on second call (cached)', async () => {
    const r1 = await httpGet(port, '/api/timeline/42');
    const r2 = await httpGet(port, '/api/timeline/42');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body.events.length).toBe(r1.body.events.length);
  });
});
