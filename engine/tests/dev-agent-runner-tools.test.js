/**
 * Unit tests for dev-agent-runner.cjs tool executors
 *
 * Covers: replace_in_file (success, not-found, ambiguous),
 *         write_file size-shrink guard and force override.
 *
 * Issue #136
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { createRequire } from 'module';

// Absolute path so it survives chdir in beforeEach
const RUNNER_PATH = path.resolve(
  new URL(import.meta.url).pathname,
  '../../../.github/scripts/dev-agent-runner.cjs',
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
let tmpDir;
let executeTool;

function abs(rel) {
  return path.join(tmpDir, rel);
}

function rel(filename) {
  // Use relative paths so the sandbox check (which resolves against cwd/repoRoot)
  // works correctly on macOS where /var is a symlink to /private/var.
  return filename;
}

// The runner uses process.cwd() as repoRoot, so we chdir into tmpDir.
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'));
  process.chdir(tmpDir);

  // Re-require each time so the repoRoot closure picks up the new cwd.
  const requireCjs = createRequire(import.meta.url);
  // Clear require cache to get a fresh module with updated cwd.
  delete requireCjs.cache[requireCjs.resolve(RUNNER_PATH)];
  ({ executeTool } = requireCjs(RUNNER_PATH));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── replace_in_file ─────────────────────────────────────────────────────────
describe('replace_in_file', () => {
  it('(a) replaces a single occurrence and writes back', async () => {
    fs.writeFileSync(abs('target.txt'), 'line1\nOLD_VALUE\nline3\n', 'utf8');

    const result = await executeTool('replace_in_file', {
      path: rel('target.txt'),
      old_str: 'OLD_VALUE',
      new_str: 'NEW_VALUE',
    });

    expect(result).toMatch(/Replaced 1 occurrence/);
    expect(fs.readFileSync(abs('target.txt'), 'utf8')).toContain('NEW_VALUE');
    expect(fs.readFileSync(abs('target.txt'), 'utf8')).not.toContain('OLD_VALUE');
  });

  it('(b) returns an error when old_str is not found', async () => {
    fs.writeFileSync(abs('target.txt'), 'line1\nline2\n', 'utf8');

    const result = await executeTool('replace_in_file', {
      path: rel('target.txt'),
      old_str: 'DOES_NOT_EXIST',
      new_str: 'anything',
    });

    expect(result).toMatch(/ERROR.*old_str not found/);
  });

  it('(c) returns an error when old_str matches more than once', async () => {
    fs.writeFileSync(abs('target.txt'), 'dup\ndup\n', 'utf8');

    const result = await executeTool('replace_in_file', {
      path: rel('target.txt'),
      old_str: 'dup',
      new_str: 'unique',
    });

    expect(result).toMatch(/ERROR.*ambiguous match/);
  });

  it('returns an error when the file does not exist', async () => {
    const result = await executeTool('replace_in_file', {
      path: rel('nonexistent.txt'),
      old_str: 'x',
      new_str: 'y',
    });

    expect(result).toMatch(/ERROR.*file not found/);
  });

  it('treats $& in new_str as a literal string, not a back-reference', async () => {
    fs.writeFileSync(abs('target.txt'), 'hello world\n', 'utf8');

    const result = await executeTool('replace_in_file', {
      path: rel('target.txt'),
      old_str: 'world',
      new_str: '$&-literal',
    });

    expect(result).toMatch(/Replaced 1 occurrence/);
    // Must contain the literal '$&-literal', not 'world-literal'
    expect(fs.readFileSync(abs('target.txt'), 'utf8')).toBe('hello $&-literal\n');
  });
});

// ─── write_file size-shrink guard ────────────────────────────────────────────
describe('write_file size-shrink guard', () => {
  it('(d) refuses when new content is less than 50% of existing file size', async () => {
    // Create a 200-byte file
    const existing = 'x'.repeat(200);
    fs.writeFileSync(abs('large.txt'), existing, 'utf8');

    // Try to write only 50 bytes (25% of original)
    const result = await executeTool('write_file', {
      path: rel('large.txt'),
      content: 'x'.repeat(50),
    });

    expect(result).toMatch(/ERROR.*write_file would shrink/);
    // File must not be overwritten
    expect(fs.readFileSync(abs('large.txt'), 'utf8')).toBe(existing);
  });

  it('(e) force=true bypasses the size-shrink guard', async () => {
    fs.writeFileSync(abs('large.txt'), 'x'.repeat(200), 'utf8');

    const result = await executeTool('write_file', {
      path: rel('large.txt'),
      content: 'tiny',
      force: true,
    });

    expect(result).toMatch(/Wrote/);
    expect(fs.readFileSync(abs('large.txt'), 'utf8')).toBe('tiny');
  });

  it('allows writing a new file without the guard triggering', async () => {
    const result = await executeTool('write_file', {
      path: rel('new.txt'),
      content: 'hello',
    });

    expect(result).toMatch(/Wrote/);
    expect(fs.readFileSync(abs('new.txt'), 'utf8')).toBe('hello');
  });

  it('allows writing when new content is >= 50% of existing', async () => {
    fs.writeFileSync(abs('file.txt'), 'x'.repeat(100), 'utf8');

    const result = await executeTool('write_file', {
      path: rel('file.txt'),
      content: 'x'.repeat(60), // 60% of 100
    });

    expect(result).toMatch(/Wrote/);
  });
});
