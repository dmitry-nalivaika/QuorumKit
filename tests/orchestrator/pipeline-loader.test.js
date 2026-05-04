import { describe, it, expect, beforeAll } from 'vitest';
import { loadPipelines } from '../../scripts/orchestrator/pipeline-loader.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

describe('pipeline-loader', () => {
  it('loads a valid pipeline file and returns it in the valid array', async () => {
    const { valid, errors } = await loadPipelines(path.join(FIXTURES, 'pipelines-valid'));
    expect(valid).toHaveLength(1);
    expect(valid[0].name).toBe('feature-pipeline');
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid pipeline and leaves valid ones active', async () => {
    const { valid, errors } = await loadPipelines(path.join(FIXTURES, 'pipelines-mixed'));
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toMatch(/invalid-pipeline\.yml/);
    expect(errors[0].message).toBeTruthy();
  });

  it('returns empty arrays when the pipelines directory does not exist', async () => {
    const { valid, errors } = await loadPipelines(path.join(FIXTURES, 'nonexistent'));
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('returns empty arrays when the directory is empty', async () => {
    const { valid, errors } = await loadPipelines(path.join(FIXTURES, 'pipelines-empty'));
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});
