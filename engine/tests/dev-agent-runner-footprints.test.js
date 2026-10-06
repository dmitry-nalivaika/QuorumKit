/**
 * Runner-owned footprints. The model used to post `agent-start|complete|fail` comments with
 * `gh issue comment "...`developer-agent`..."` through /bin/sh, where backticks are command
 * substitution: every stamp came out with empty fields and no apm-msg block (#378 follow-up).
 * The runner now builds them itself and posts through the REST API.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const RUNNER_PATH = path.resolve(new URL(import.meta.url).pathname, '../../../.github/scripts/dev-agent-runner.cjs');
const MANIFEST = path.resolve(new URL(import.meta.url).pathname, '../../../.github/agents/developer-agent.md');
const requireCjs = createRequire(import.meta.url);

let tmpDir, prevCwd, runner;
const ENV = { ISSUE_NUMBER: '378', GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't', RUN_ID: 'run-uuid-1', STEP: 'dev', ITERATION: '2' };
const saved = {};

beforeEach(() => {
  prevCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-fp-'));
  process.chdir(tmpDir);
  for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  delete requireCjs.cache[requireCjs.resolve(RUNNER_PATH)];
  runner = requireCjs(RUNNER_PATH);
});
afterEach(() => {
  process.chdir(prevCwd);
  for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const parseMsg = body => JSON.parse(body.match(/```apm-msg\n([\s\S]*?)\n```/)[1]);

describe('buildFootprint', () => {
  it('start has every field filled and no apm-msg block', () => {
    const b = runner.buildFootprint('start', { branch: '378-fix', timestamp: '2026-10-06T10:00:00.000Z' });
    expect(b).toContain('<!-- agent-footprint: start -->');
    expect(b).toContain('**Agent started:** `developer-agent`');
    expect(b).toContain('- **Event type:** `agent-start`');
    expect(b).toContain('- **Issue / PR:** #378');
    expect(b).toContain('- **Branch:** `378-fix`');
    expect(b).toContain('- **Timestamp:** `2026-10-06T10:00:00.000Z`');
    expect(b).not.toContain('apm-msg');
  });

  it('complete carries a schema-valid apm-msg bound to the run, step and iteration', () => {
    const b = runner.buildFootprint('complete', { summary: 'Fixed it', outcome: 'success', prNumber: '12', branch: '378-fix', nextAction: 'QA Agent review requested' });
    expect(b).toContain('<!-- agent-footprint: complete -->');
    expect(b).toContain('- **Summary:** Fixed it');
    expect(parseMsg(b)).toMatchObject({
      version: '2', runId: 'run-uuid-1', step: 'dev', agent: 'dev-agent', iteration: 2,
      outcome: 'success', event_type: 'complete', issue: '378', pr: '12', branch: '378-fix',
    });
  });

  it('fail reports the error and the real outcome', () => {
    const b = runner.buildFootprint('fail', { summary: 'Spec not found', outcome: 'blocker' });
    expect(b).toContain('<!-- agent-footprint: fail -->');
    expect(b).toContain('- **Error:** Spec not found');
    expect(parseMsg(b)).toMatchObject({ outcome: 'blocker', event_type: 'fail', pr: null });
  });

  it('keeps summary within the 280-char schema limit and on one line', () => {
    const m = parseMsg(runner.buildFootprint('fail', { summary: 'x\n'.repeat(400) }));
    expect(m.summary.length).toBeLessThanOrEqual(280);
    expect(m.summary).not.toContain('\n');
  });

  it('is not subject to shell substitution because it never touches a shell', () => {
    const b = runner.buildFootprint('start', {});
    expect(b).toMatch(/`developer-agent`/);
    expect(b).toMatch(/`agent-start`/);
  });
});

describe('prompt', () => {
  it('removes the manifest sections that told the model to post footprints through the shell', () => {
    const stripped = runner.stripFootprintInstructions(fs.readFileSync(MANIFEST, 'utf8'));
    expect(stripped).not.toContain('Mandatory Footprint Steps');
    expect(stripped).not.toContain('gh issue comment');
    expect(stripped).not.toContain('agent-footprint: start');
    expect(stripped).toContain('## Capabilities');
    expect(stripped).toContain('## Inputs & Outputs');   // neighbouring sections survive
  });

  it('the shipped manifest still has the headings the stripper anchors on', () => {
    const md = fs.readFileSync(MANIFEST, 'utf8');
    expect(md).toMatch(/## Mandatory Footprint Steps[\s\S]*\n## Capabilities/);
    expect(md).toMatch(/## Agent Footprint[\s\S]*\n## Inputs & Outputs/);
  });

  it('tells the model not to post footprints itself or put backticks in shell commands', () => {
    const p = runner.buildSystemPrompt();
    expect(p).toContain('The runner posts the agent-start / agent-complete / agent-fail footprint comments');
    expect(p).toContain('never put backticks');
  });
});
