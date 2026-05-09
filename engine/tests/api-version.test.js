/**
 * T-10 — apiVersion validator (FR-013, ADR-047)
 *
 * The engine declares its supported API version via the constant
 * `ENGINE_API_VERSION`. Pipelines may declare `apiVersion: 'X.Y'` at the top
 * level. If the pipeline `apiVersion` is newer than the engine's, loading
 * MUST fail with an actionable error mentioning both versions.
 *
 * Loader requirements:
 *   - js-yaml `yaml.load` with the default safe schema (no custom tags).
 *   - Tag-aware loading (`!!js/function`, etc.) MUST be rejected.
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPipelines } from '../orchestrator/pipeline-loader.js';
import {
  ENGINE_API_VERSION,
  isApiVersionSupported,
  parseApiVersion,
} from '../orchestrator/api-version.js';

async function withTmpDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'apm-pipelines-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('parseApiVersion', () => {
  it('parses valid major.minor strings', () => {
    expect(parseApiVersion('1.0')).toEqual({ major: 1, minor: 0 });
    expect(parseApiVersion('3.7')).toEqual({ major: 3, minor: 7 });
  });
  it('rejects invalid strings', () => {
    expect(parseApiVersion('foo')).toBeNull();
    expect(parseApiVersion('1')).toBeNull();
    expect(parseApiVersion('1.2.3')).toBeNull();
    expect(parseApiVersion(null)).toBeNull();
    expect(parseApiVersion(undefined)).toBeNull();
  });
});

describe('isApiVersionSupported', () => {
  it('accepts equal versions', () => {
    expect(isApiVersionSupported('1.0', '1.0')).toBe(true);
  });
  it('accepts pipeline minor lower than engine', () => {
    expect(isApiVersionSupported('1.5', '1.7')).toBe(true);
  });
  it('rejects pipeline minor higher than engine', () => {
    expect(isApiVersionSupported('1.8', '1.5')).toBe(false);
  });
  it('rejects pipeline major higher than engine', () => {
    expect(isApiVersionSupported('2.0', '1.99')).toBe(false);
  });
  it('treats missing pipeline apiVersion as compatible', () => {
    expect(isApiVersionSupported(null, ENGINE_API_VERSION)).toBe(true);
    expect(isApiVersionSupported(undefined, ENGINE_API_VERSION)).toBe(true);
  });
});

function validV1Yaml(extraTopLines = '') {
  return (
    `${extraTopLines}` +
    `name: test-pipeline\n` +
    `version: '1'\n` +
    `trigger:\n` +
    `  event: issues.opened\n` +
    `  labels: [type:feature]\n` +
    `steps:\n` +
    `  - name: only\n` +
    `    agent: dev-agent\n`
  );
}

describe('loadPipelines + apiVersion gate', () => {
  it('loads a pipeline whose apiVersion matches the engine', async () => {
    await withTmpDir(async (dir) => {
      const yml = validV1Yaml(`apiVersion: '${ENGINE_API_VERSION}'\n`);
      await writeFile(join(dir, 'ok.yml'), yml, 'utf8');
      const { valid, errors } = await loadPipelines(dir);
      expect(errors).toEqual([]);
      expect(valid).toHaveLength(1);
      expect(valid[0].name).toBe('test-pipeline');
    });
  });

  it('rejects a pipeline whose apiVersion is newer than the engine', async () => {
    await withTmpDir(async (dir) => {
      const yml = validV1Yaml(`apiVersion: '99.0'\n`);
      await writeFile(join(dir, 'future.yml'), yml, 'utf8');
      const { valid, errors } = await loadPipelines(dir);
      expect(valid).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/apiVersion/i);
      expect(errors[0].message).toMatch(/99\.0/);
      expect(errors[0].message).toMatch(new RegExp(ENGINE_API_VERSION.replace('.', '\\.')));
      expect(errors[0].message).toMatch(/bump|upgrade|update.*action/i);
    });
  });

  it('rejects a pipeline with malformed apiVersion', async () => {
    await withTmpDir(async (dir) => {
      const yml = validV1Yaml(`apiVersion: 'not-a-version'\n`);
      await writeFile(join(dir, 'bad.yml'), yml, 'utf8');
      const { valid, errors } = await loadPipelines(dir);
      expect(valid).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/apiVersion/i);
    });
  });

  it('rejects a pipeline that uses a custom YAML tag (FR-013 safe-load)', async () => {
    await withTmpDir(async (dir) => {
      // !!js/function is the canonical js-yaml tag-aware exploit vector.
      const yml =
        `name: evil\nversion: '1'\n` +
        `trigger: { event: issues.opened, labels: [x] }\n` +
        `steps:\n  - name: only\n    agent: !!js/function 'function () { return 1; }'\n`;
      await writeFile(join(dir, 'evil.yml'), yml, 'utf8');
      const { valid, errors } = await loadPipelines(dir);
      // Either the YAML parser refuses the tag (preferred) or the validator
      // rejects the resulting structure. Either way, the pipeline must NOT
      // load and an error must be reported.
      expect(valid).toEqual([]);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
