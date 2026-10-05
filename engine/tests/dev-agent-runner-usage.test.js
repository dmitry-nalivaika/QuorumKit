/**
 * dev-agent-runner.cjs — usage capture in the signal_outcome apm-msg block.
 * Issue #335, ADR-335 — FR-001, FR-002, FR-003, FR-005, FR-015.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { parseApmMsg } from '../orchestrator/apm-msg-parser.js';

const requireCjs = createRequire(import.meta.url);
const RUNNER_PATH = path.resolve(new URL(import.meta.url).pathname, '../../../.github/scripts/dev-agent-runner.cjs');

const BASE_ENV = {
  GITHUB_REPOSITORY: 'o/r', ISSUE_NUMBER: '7', GITHUB_TOKEN: 'test-token',
  RUN_ID: 'run-1', STEP: 'dev', ITERATION: '2', RUNTIME_KIND: 'copilot', RUNTIME_NAME: 'copilot-default',
};

let tmpDir, savedEnv, origRequest, posted;

function loadRunner(envOverrides = {}) {
  const env = { ...BASE_ENV, ...envOverrides };
  for (const k of Object.keys(BASE_ENV)) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  delete requireCjs.cache[requireCjs.resolve(RUNNER_PATH)];
  return requireCjs(RUNNER_PATH);
}

function commentBody() {
  return JSON.parse(posted[0].body).body;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-usage-'));
  fs.mkdirSync(path.join(tmpDir, 'src'));
  fs.writeFileSync(path.join(tmpDir, 'src/model-pricing.yml'),
    'pricing:\n  gpt-4o:\n    prompt_per_1k_usd: 0.0025\n    completion_per_1k_usd: 0.01\n');
  process.chdir(tmpDir);
  savedEnv = { ...process.env };

  posted = [];
  const https = requireCjs('https');
  origRequest = https.request;
  https.request = (_opts, cb) => {
    const req = new EventEmitter();
    let body = '';
    req.write = d => { body += d; };
    req.end = () => {
      posted.push({ body });
      const res = new EventEmitter();
      res.statusCode = 201;
      cb(res);
      res.emit('data', '{}');
      res.emit('end');
    };
    return req;
  };
});

afterEach(() => {
  requireCjs('https').request = origRequest;
  process.env = savedEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('signal_outcome apm-msg block with usage', () => {
  it('includes a schema-valid usage object with estimated cost when usage was recorded', async () => {
    const runner = loadRunner();
    runner.recordUsage('gpt-4o', 1000, 500);
    runner.recordUsage('gpt-4o', 1000, 500);
    await runner.executeTool('signal_outcome', { outcome: 'success', summary: 'Done.' });

    const parsed = parseApmMsg(commentBody());
    expect(parsed.ok).toBe(true);
    expect(parsed.message.runId).toBe('run-1');
    expect(parsed.message.iteration).toBe(2);
    expect(parsed.message.usage).toEqual({
      runtime: 'copilot-default', model: 'gpt-4o',
      prompt_tokens: 2000, completion_tokens: 1000, total_tokens: 3000,
      estimated_cost_usd: 0.005 + 0.01,
    });
  });

  it('reports estimated_cost_usd: null when the model has no pricing entry', async () => {
    const runner = loadRunner();
    runner.recordUsage('mystery-model', 10, 5);
    await runner.executeTool('signal_outcome', { outcome: 'success', summary: 'Done.' });
    const parsed = parseApmMsg(commentBody());
    expect(parsed.ok).toBe(true);
    expect(parsed.message.usage.estimated_cost_usd).toBeNull();
    expect(parsed.message.usage.total_tokens).toBe(15);
  });

  it('omits usage entirely when no API response reported any (FR-005)', async () => {
    const runner = loadRunner();
    runner.recordUsage('gpt-4o', undefined, undefined);
    await runner.executeTool('signal_outcome', { outcome: 'success', summary: 'Done.' });
    const parsed = parseApmMsg(commentBody());
    expect(parsed.ok).toBe(true);
    expect(parsed.message.usage).toBeUndefined();
  });

  it('posts no apm-msg block when RUN_ID is unset (not orchestrator-driven)', async () => {
    const runner = loadRunner({ RUN_ID: undefined });
    runner.recordUsage('gpt-4o', 1, 1);
    await runner.executeTool('signal_outcome', { outcome: 'success', summary: 'Done.' });
    expect(commentBody()).not.toContain('```apm-msg');
  });

  it('keeps the block schema-valid for long summaries containing backticks', async () => {
    const runner = loadRunner();
    await runner.executeTool('signal_outcome', { outcome: 'fail', summary: 'x`y```z'.repeat(100) });
    const parsed = parseApmMsg(commentBody());
    expect(parsed.ok).toBe(true);
    expect(parsed.message.summary.length).toBeLessThanOrEqual(280);
  });

  it('records Claude-style usage via recordUsage and never includes prompt content (FR-015)', async () => {
    const runner = loadRunner({ RUNTIME_KIND: 'claude' });
    runner.recordUsage('claude-opus-4-5', 3, 4);
    await runner.executeTool('signal_outcome', { outcome: 'success', summary: 'Done.' });
    const { usage } = parseApmMsg(commentBody()).message;
    expect(Object.keys(usage).sort()).toEqual(
      ['completion_tokens', 'estimated_cost_usd', 'model', 'prompt_tokens', 'runtime', 'total_tokens']);
  });
});
