/**
 * Regression test for Reviewer Agent BLOCKER on PR #324 (Issue #283, US-2):
 *
 * `engine/dashboard/server.js` has a hard runtime dependency on `ws`, but
 * `engine/package.json` (the actual published npm manifest) declared no
 * `dependencies` field. Combined with `engine/dashboard/.npmignore` correctly
 * excluding `dashboard/node_modules/` from the published tarball, a real
 * `npm install quorumkit-engine` never pulls in `ws`, so `npx quorumkit-engine
 * dashboard` crashes with `Cannot find module 'ws'` for every consumer.
 *
 * This test reproduces the bug end-to-end and guards against regressions:
 *   1. `npm pack` the real `engine/` package into a tarball (exactly what
 *      gets published).
 *   2. `npm install` that tarball into a fresh, isolated consumer directory
 *      that shares NO node_modules with this repo's own checkout.
 *   3. Run the installed `quorumkit-dashboard` bin from that isolated
 *      directory and confirm it actually starts and serves `/api/config`.
 *
 * This is intentionally slow (real npm pack + npm install) — it is the only
 * way to catch "works here because I already have the dep locally" bugs.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE_DIR = join(REPO_ROOT, 'engine');

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

const cleanupDirs = [];

afterAll(() => {
  while (cleanupDirs.length) {
    rmSync(cleanupDirs.pop(), { recursive: true, force: true });
  }
});

describe('isolated npm install of the published quorumkit-engine tarball', () => {
  it('starts the dashboard and serves /api/config with no shared node_modules (FR-002, FR-003, FR-006)', async () => {
    // ── 1. Pack the real engine/ package exactly as it would be published ──
    const packDestDir = mkdtempSync(join(tmpdir(), 'qk-pack-dest-'));
    cleanupDirs.push(packDestDir);
    const packOutput = execFileSync(
      'npm',
      ['pack', '--pack-destination', packDestDir, '--json'],
      { cwd: ENGINE_DIR, encoding: 'utf8' },
    );
    const [{ filename }] = JSON.parse(packOutput);
    const tarballPath = join(packDestDir, filename);

    // ── 2. Install the tarball into a fresh, isolated consumer directory ──
    const consumerDir = realpathSync(mkdtempSync(join(tmpdir(), 'qk-isolated-consumer-')));
    cleanupDirs.push(consumerDir);
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'qk-isolated-consumer-test', version: '1.0.0', private: true }),
    );
    execFileSync(
      'npm',
      ['install', tarballPath, '--no-audit', '--no-fund', '--no-save'],
      { cwd: consumerDir, encoding: 'utf8' },
    );

    // Sanity: the installed package must NOT carry its own dashboard/node_modules —
    // that's the whole point of the .npmignore exclusion (AD-3).
    const installedDashboardDir = join(consumerDir, 'node_modules', 'quorumkit-engine', 'dashboard');
    const dashboardEntries = readdirSync(installedDashboardDir);
    expect(dashboardEntries).not.toContain('node_modules');

    // ── 3. Run the installed bin from the isolated directory ───────────────
    const binPath = join(consumerDir, 'node_modules', 'quorumkit-engine', 'bin', 'quorumkit-dashboard.js');
    const port = await getFreePort();

    const child = spawn(process.execPath, [binPath, '--port', String(port)], {
      cwd: consumerDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    try {
      const output = await new Promise((resolvePromise, reject) => {
        let buf = '';
        const timeout = setTimeout(
          () => reject(new Error(`Server start timeout. Output so far: ${buf}`)),
          30_000,
        );
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
      expect(output).toContain(`http://localhost:${port}`);

      const res = await fetch(`http://127.0.0.1:${port}/api/config`);
      expect(res.ok).toBe(true);
      const cfg = await res.json();
      expect(cfg.localPath).toBe(consumerDir);
    } finally {
      if (!child.killed) child.kill('SIGTERM');
    }
  }, 60_000);
});
