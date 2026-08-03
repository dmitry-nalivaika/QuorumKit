/**
 * engine/tests/engine-package.test.js — Issue #283
 *
 * Verifies the `quorumkit-engine` npm package manifest correctly declares the
 * new `bin` CLI entry points and packages `dashboard/` for consumer projects,
 * while excluding vendor/local artefacts that should never ship (AD-1, AD-3,
 * FR-001, FR-005).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ENGINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('engine/package.json — npm packaging manifest', () => {
  const pkg = JSON.parse(readFileSync(join(ENGINE_DIR, 'package.json'), 'utf8'));

  it('declares a bin entry point for quorumkit-engine', () => {
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin['quorumkit-engine']).toBe('bin/quorumkit-engine.js');
  });

  it('declares a bin entry point for quorumkit-dashboard (AD-2 npm-script usage)', () => {
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin['quorumkit-dashboard']).toBe('bin/quorumkit-dashboard.js');
  });

  it('includes dashboard/ and bin/ in the files allowlist', () => {
    expect(pkg.files).toContain('dashboard/');
    expect(pkg.files).toContain('bin/');
  });

  describe('npm pack --dry-run output', () => {
    // Plant throwaway vendor/log/local-config artefacts under dashboard/ so
    // this test actually exercises the .npmignore exclusion rules, rather
    // than trivially passing because those paths happen not to exist.
    const fakeNodeModulesDir = join(ENGINE_DIR, 'dashboard', 'node_modules', 'fake-pkg');
    const fakeLogFile        = join(ENGINE_DIR, 'dashboard', 'debug.log');
    const fakeConfigFile     = join(ENGINE_DIR, 'dashboard', '.apm-project.json');

    afterEach(() => {
      // Only remove the throwaway fake sub-package, never the whole
      // dashboard/node_modules/ directory — real deps (e.g. `ws`) may be
      // installed there and are needed by other test files in this run.
      rmSync(fakeNodeModulesDir, { recursive: true, force: true });
      if (existsSync(fakeLogFile)) rmSync(fakeLogFile, { force: true });
      if (existsSync(fakeConfigFile)) rmSync(fakeConfigFile, { force: true });
    });

    it('excludes dashboard/node_modules/, *.log, and local config artefacts', () => {
      mkdirSync(fakeNodeModulesDir, { recursive: true });
      writeFileSync(join(fakeNodeModulesDir, 'index.js'), '// fake vendor file\n', 'utf8');
      writeFileSync(fakeLogFile, 'debug output\n', 'utf8');
      writeFileSync(fakeConfigFile, '{"localPath":"/tmp/whatever"}', 'utf8');

      const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: ENGINE_DIR,
        encoding: 'utf8',
      });
      const [{ files }] = JSON.parse(output);
      const paths = files.map(f => f.path);

      // dashboard/ itself must be packaged (real files like server.js)
      expect(paths.some(p => p === 'dashboard/server.js')).toBe(true);
      // but never the throwaway vendor/log/config artefacts
      expect(paths.some(p => p.includes('dashboard/node_modules/'))).toBe(false);
      expect(paths.some(p => p.endsWith('.log'))).toBe(false);
      expect(paths.some(p => p.includes('.apm-project.json'))).toBe(false);
    });
  });
});
