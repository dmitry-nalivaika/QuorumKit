/**
 * Tests for engine/bin/quorumkit-dashboard.js — the npm-packaged CLI entry
 * point for the dashboard server (Issue #283, US-2, AD-2).
 *
 * Covers:
 *   - Vendored-install project-dir resolution: process.cwd() is used as
 *     QUORUMKIT_PROJECT_DIR, distinct from QuorumKit's own repo root.
 *   - `--port <N>` flag parsing, matching dashboard/start.sh's existing
 *     behaviour, with QUORUMKIT_PROJECT_DIR (if already set by the caller)
 *     taking precedence over process.cwd().
 *   - A busy port (EADDRINUSE) yields a clear, actionable error message and
 *     a clean process exit with no orphaned background process.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN_PATH = resolve(REPO_ROOT, 'engine', 'bin', 'quorumkit-dashboard.js');

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolvePort(port));
    });
    srv.on('error', reject);
  });
}

// Fake consumer project: its own .git root, distinct from QuorumKit's repo.
function makeFakeConsumerProject() {
  const dir = mkdtempSync(join(tmpdir(), 'qk-vendored-consumer-'));
  mkdirSync(join(dir, '.git'), { recursive: true });
  return realpathSync(dir);
}

const spawnedProcesses = [];

function spawnDashboard(args, opts = {}) {
  const child = spawn(process.execPath, [BIN_PATH, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
    env: { ...process.env, ...(opts.env || {}) },
  });
  spawnedProcesses.push(child);
  return child;
}

afterEach(() => {
  while (spawnedProcesses.length) {
    const child = spawnedProcesses.pop();
    if (!child.killed) child.kill('SIGTERM');
  }
});

describe('engine/bin/quorumkit-dashboard.js', () => {
  async function waitForServerReady(child, port) {
    return new Promise((resolvePromise, reject) => {
      let buf = '';
      const timeout = setTimeout(() => reject(new Error(`Server start timeout. Output so far: ${buf}`)), 12_000);
      child.stdout.on('data', chunk => {
        buf += chunk.toString();
        if (buf.includes(`http://localhost:${port}`)) {
          clearTimeout(timeout);
          resolvePromise(buf);
        }
      });
      child.stderr.on('data', chunk => { buf += chunk.toString(); });
      child.on('error', err => { clearTimeout(timeout); reject(err); });
      child.on('exit', code => {
        clearTimeout(timeout);
        reject(new Error(`Process exited early with code ${code}. Output: ${buf}`));
      });
    });
  }

  it('resolves process.cwd() as QUORUMKIT_PROJECT_DIR, distinct from the QuorumKit repo', async () => {
    const consumerProject = makeFakeConsumerProject();
    const port = await getFreePort();

    const child = spawnDashboard(['--port', String(port)], { cwd: consumerProject });
    await waitForServerReady(child, port);

    const res = await fetch(`http://127.0.0.1:${port}/api/config`);
    const cfg = await res.json();

    expect(cfg.localPath).toBe(consumerProject);
    expect(cfg.localPath).not.toBe(REPO_ROOT);
  }, 15_000);

  it('honours a pre-set QUORUMKIT_PROJECT_DIR over process.cwd()', async () => {
    const consumerProject = makeFakeConsumerProject();
    const overrideProject = makeFakeConsumerProject();
    const port = await getFreePort();

    const child = spawnDashboard(['--port', String(port)], {
      cwd: consumerProject,
      env: { QUORUMKIT_PROJECT_DIR: overrideProject },
    });
    await waitForServerReady(child, port);

    const res = await fetch(`http://127.0.0.1:${port}/api/config`);
    const cfg = await res.json();

    expect(cfg.localPath).toBe(overrideProject);
    expect(cfg.localPath).not.toBe(consumerProject);
  }, 15_000);

  it('exits cleanly with an actionable error when the port is already in use', async () => {
    const consumerProject = makeFakeConsumerProject();
    const port = await getFreePort();

    // Occupy the port first.
    const blocker = createServer();
    await new Promise(resolvePromise => blocker.listen(port, '127.0.0.1', resolvePromise));

    try {
      const child = spawnDashboard(['--port', String(port)], { cwd: consumerProject });

      const { code, output } = await new Promise((resolvePromise, reject) => {
        let buf = '';
        const timeout = setTimeout(() => reject(new Error(`Process did not exit. Output: ${buf}`)), 12_000);
        child.stdout.on('data', chunk => { buf += chunk.toString(); });
        child.stderr.on('data', chunk => { buf += chunk.toString(); });
        child.on('exit', exitCode => {
          clearTimeout(timeout);
          resolvePromise({ code: exitCode, output: buf });
        });
        child.on('error', err => { clearTimeout(timeout); reject(err); });
      });

      expect(code).not.toBe(0);
      expect(output.toLowerCase()).toMatch(/eaddrinuse|already in use|port/);
    } finally {
      await new Promise(resolvePromise => blocker.close(resolvePromise));
    }
  }, 15_000);
});
