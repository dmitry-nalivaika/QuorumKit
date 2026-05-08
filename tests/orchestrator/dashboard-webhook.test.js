/**
 * T-12 — Integration test: POST /webhook/pipeline-event
 *
 * Spawns the dashboard server on a random port, sends pipeline-event payloads,
 * and asserts correct HTTP responses. WebSocket broadcast is verified by
 * connecting a WS client before posting.
 *
 * SEC-HIGH-001: APM_WEBHOOK_SECRET is set in the server env; tests verify that
 * requests without / with a wrong X-APM-Webhook-Secret header are rejected 403.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { WebSocket } from 'ws';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DASHBOARD_DIR = resolve(REPO_ROOT, 'dashboard');

const TEST_WEBHOOK_SECRET = 'test-secret-abc123';

// ─── Find a free port ─────────────────────────────────────────────────────────
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
function httpPost(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = require('node:http').request(
      { hostname: '127.0.0.1', port, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } },
      res => {
        let raw = '';
        res.on('data', d => { raw += d; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Use native fetch when available (Node 18+), otherwise fall back to http helper
async function post(port, path, body, extraHeaders = {}) {
  if (typeof fetch !== 'undefined') {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text };
  }
  return httpPost(port, path, body, extraHeaders);
}

/** Convenience: post with the correct secret header */
function postAuth(port, path, body) {
  return post(port, path, body, { 'X-APM-Webhook-Secret': TEST_WEBHOOK_SECRET });
}

// ─── Server lifecycle ────────────────────────────────────────────────────────
let serverProcess;
let port;

beforeAll(async () => {
  port = await getFreePort();

  serverProcess = spawn(
    process.execPath,          // node binary
    ['server.js', '--port', String(port)],
    {
      cwd: DASHBOARD_DIR,
      env: { ...process.env, APM_PORT: String(port), APM_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  // Wait until the server is ready (it logs "http://localhost:PORT")
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10_000);
    serverProcess.stdout.on('data', chunk => {
      if (chunk.toString().includes(`http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.stderr.on('data', chunk => {
      // surface errors during startup
      const msg = chunk.toString();
      if (msg.includes('Error') || msg.includes('EADDRINUSE')) {
        clearTimeout(timeout);
        reject(new Error(msg));
      }
    });
    serverProcess.on('error', err => { clearTimeout(timeout); reject(err); });
  });
}, 15_000);

afterAll(() => {
  if (serverProcess) serverProcess.kill();
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('POST /webhook/pipeline-event', () => {
  it('returns 204 for a valid payload with correct secret', async () => {
    const { status } = await postAuth(port, '/webhook/pipeline-event', {
      runId: 'run-001',
      status: 'running',
      step: 'triage',
    });
    expect(status).toBe(204);
  });

  it('returns 403 when X-APM-Webhook-Secret header is missing', async () => {
    const { status, body } = await post(port, '/webhook/pipeline-event', {
      runId: 'run-001',
      status: 'running',
    });
    expect(status).toBe(403);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('Forbidden') });
  });

  it('returns 403 when X-APM-Webhook-Secret header is wrong', async () => {
    const { status, body } = await post(port, '/webhook/pipeline-event',
      { runId: 'run-001', status: 'running' },
      { 'X-APM-Webhook-Secret': 'wrong-secret' }
    );
    expect(status).toBe(403);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('Forbidden') });
  });

  it('returns 400 when runId is missing', async () => {
    const { status, body } = await postAuth(port, '/webhook/pipeline-event', {
      status: 'running',
    });
    expect(status).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('runId') });
  });

  it('returns 400 when status is missing', async () => {
    const { status, body } = await postAuth(port, '/webhook/pipeline-event', {
      runId: 'run-002',
    });
    expect(status).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ error: expect.stringContaining('status') });
  });

  it('returns 400 for a completely empty body', async () => {
    const { status } = await postAuth(port, '/webhook/pipeline-event', {});
    expect(status).toBe(400);
  });

  it('broadcasts a pipeline-event message over WebSocket', async () => {
    const received = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const timeout = setTimeout(() => { ws.close(); reject(new Error('WS timeout')); }, 5_000);

      ws.on('open', async () => {
        // Post immediately after WS is open so we catch the broadcast
        await postAuth(port, '/webhook/pipeline-event', {
          runId: 'run-ws-test',
          status: 'completed',
          step: 'release',
        });
      });

      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'pipeline-event' && msg.runId === 'run-ws-test') {
          clearTimeout(timeout);
          ws.close();
          resolve(msg);
        }
      });

      ws.on('error', err => { clearTimeout(timeout); reject(err); });
    });

    expect(received).toMatchObject({
      type: 'pipeline-event',
      runId: 'run-ws-test',
      status: 'completed',
      step: 'release',
    });
  });
});
