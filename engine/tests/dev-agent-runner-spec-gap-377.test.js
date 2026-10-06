/**
 * dev-agent-runner.cjs — the automated Developer Agent can report `spec_gap` (#377).
 * specs/377-bug-fix-pipeline-spec-gate/spec.md — FR-005, FR-029, FR-030, FR-031, FR-032, FR-033.
 *
 * Review of PR #395 found the runner's `signal_outcome` accepted only
 * success|fail|needs-human|blocker, told the model to report only through `signal_outcome`, and
 * would post a second marker if the model also ran `agent-report.cjs` by hand (the Orchestrator
 * acts on the newest marker). So in CI a missing spec could never reach the BA step.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
import yaml from 'js-yaml';
import { normalise } from '../orchestrator/pipeline-loader.js';
import { resolveTransition } from '../orchestrator/router-v2.js';
import { parseApmMsg } from '../orchestrator/apm-msg-parser.js';

const requireCjs = createRequire(import.meta.url);
const ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const RUNNER_PATH = path.join(ROOT, '.github/scripts/dev-agent-runner.cjs');
const MIRROR_PATH = path.join(ROOT, 'src/.github/scripts/dev-agent-runner.cjs');
const MANIFEST = path.join(ROOT, '.github/agents/developer-agent.md');

const ENV = {
  ISSUE_NUMBER: '377', GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't',
  RUN_ID: 'run-uuid-377', STEP: 'dev', ITERATION: '1', RUNTIME_KIND: 'copilot', RUNTIME_NAME: 'copilot-default',
};
const RESULT_MARKER_RE = /<!--\s*apm:run_id=(\S+)\s+step=(\S+)\s+iteration=(\d+)\s+runtime=\S+\s+outcome=(\S+?)\s*-->/;

let tmpDir, prevCwd, savedEnv, origRequest, posted, runner;

function loadRunner() {
  for (const k of Object.keys(ENV)) process.env[k] = ENV[k];
  delete requireCjs.cache[requireCjs.resolve(RUNNER_PATH)];
  return requireCjs(RUNNER_PATH);
}

beforeEach(() => {
  prevCwd = process.cwd();
  savedEnv = { ...process.env };
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-377-'));
  fs.mkdirSync(path.join(tmpDir, '.github/agents'), { recursive: true });
  fs.copyFileSync(MANIFEST, path.join(tmpDir, '.github/agents/developer-agent.md'));
  process.chdir(tmpDir);

  posted = [];
  const https = requireCjs('https');
  origRequest = https.request;
  https.request = (_opts, cb) => {
    const req = new EventEmitter();
    let body = '';
    req.write = d => { body += d; };
    req.end = () => {
      posted.push(JSON.parse(body).body);
      const res = new EventEmitter();
      res.statusCode = 201;
      cb(res);
      res.emit('data', '{}');
      res.emit('end');
    };
    return req;
  };
  runner = loadRunner();
});

afterEach(() => {
  requireCjs('https').request = origRequest;
  process.chdir(prevCwd);
  for (const k of Object.keys(ENV)) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const signalTool = () => runner.toolDefs.find(t => t.name === 'signal_outcome');

describe('signal_outcome accepts spec_gap (FR-029, FR-033)', () => {
  it('lists spec_gap among the accepted outcomes', () => {
    expect(signalTool().schema.properties.outcome.enum).toEqual(
      expect.arrayContaining(['success', 'fail', 'needs-human', 'blocker', 'spec_gap']),
    );
  });

  it('posts a fail footprint whose apm-msg and result marker both say spec_gap', async () => {
    const result = await runner.executeTool('signal_outcome', {
      outcome: 'spec_gap', summary: 'Spec missing for issue #377 at specs/377-*/spec.md.',
    });
    expect(result).toBe('Outcome spec_gap signalled.');
    expect(posted).toHaveLength(1);

    const body = posted[0];
    expect(body).toContain('<!-- agent-footprint: fail -->');
    const marker = body.match(RESULT_MARKER_RE);
    expect(marker?.slice(1)).toEqual(['run-uuid-377', 'dev', '1', 'spec_gap']);

    const parsed = parseApmMsg(body);
    expect(parsed.ok).toBe(true);
    expect(parsed.message.outcome).toBe('spec_gap');
  });

  it('is not rewritten into blocker or needs-human', async () => {
    await runner.executeTool('signal_outcome', { outcome: 'spec_gap', summary: 'no spec' });
    expect(posted[0]).not.toMatch(/outcome=(blocker|needs-human)/);
    expect(posted[0]).not.toMatch(/"outcome": "(blocker|needs-human)"/);
  });

  it('routes dev -> ba in the bug-fix pipeline (the report the Orchestrator reads)', async () => {
    await runner.executeTool('signal_outcome', { outcome: 'spec_gap', summary: 'no spec' });
    const outcome = posted[0].match(RESULT_MARKER_RE)[4];
    const bug = normalise(yaml.load(fs.readFileSync(path.join(ROOT, 'src/pipelines/bug-fix-pipeline.yml'), 'utf8')));
    expect(resolveTransition(bug, 'dev', outcome)).toEqual({ to: 'ba', isBackward: true });
  });

  it('rejects an outcome that is not in the accepted list and posts nothing', async () => {
    const result = await runner.executeTool('signal_outcome', { outcome: 'maybe', summary: 'x' });
    expect(result).toMatch(/^ERROR/);
    expect(posted).toHaveLength(0);
  });
});

describe('exactly one reported result per run (FR-030)', () => {
  it('ignores a second signal_outcome after the first', async () => {
    await runner.executeTool('signal_outcome', { outcome: 'spec_gap', summary: 'no spec' });
    const second = await runner.executeTool('signal_outcome', { outcome: 'blocker', summary: 'something else' });
    expect(second).toMatch(/already/i);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain('outcome=spec_gap');
  });

  it.each([
    'node .github/scripts/agent-report.cjs complete --agent dev --issue 377 --outcome spec_gap --summary-stdin',
    'node .github/scripts/agent-report.cjs fail --agent dev --issue 377 --summary "x"',
    'node ./.github/scripts/agent-report.cjs   start --agent dev --issue 377',
  ])('refuses to run a hand-posted report through run_command: %s', async command => {
    const result = await runner.executeTool('run_command', { command });
    expect(result).toMatch(/^ERROR/);
    expect(result).toMatch(/signal_outcome/);
    expect(posted).toHaveLength(0);
  });

  it('still runs ordinary commands', async () => {
    const result = await runner.executeTool('run_command', { command: 'echo ok' });
    expect(result).toBe('ok');
  });
});

describe('runner instructions (FR-031, FR-032)', () => {
  it('tells the model to report a missing spec as spec_gap via signal_outcome', () => {
    const p = runner.buildSystemPrompt();
    expect(p).toMatch(/missing spec[^\n]*`?spec_gap`?[^\n]*signal_outcome|signal_outcome[^\n]*spec_gap/i);
    expect(p).toMatch(/not\s+`?blocker`?/i);
  });

  it('lists spec_gap in the "call signal_outcome with one of" line', () => {
    const line = runner.buildSystemPrompt().split('\n').find(l => /call `signal_outcome` with one of/.test(l));
    expect(line).toBeDefined();
    expect(line).toContain('spec_gap');
  });

  it('still says the runner posts footprints and the model must not', () => {
    const p = runner.buildSystemPrompt();
    expect(p).toContain('Do NOT post them yourself');
    expect(p).toContain('Report your result only by calling `signal_outcome`');
  });

  it('does not contradict the agent definition: it names spec_gap as the missing-spec result', () => {
    const p = runner.buildSystemPrompt();
    expect(p).toMatch(/### Missing spec — report `spec_gap`, not `blocker`/);
  });

  it('the issue message asks for a spec check before any code', async () => {
    const https = requireCjs('https');
    https.request = (_o, cb) => {
      const req = new EventEmitter();
      req.write = () => {};
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = 200;
        cb(res);
        res.emit('data', JSON.stringify({ title: 'T', body: 'B' }));
        res.emit('end');
      };
      return req;
    };
    const msg = await runner.buildUserMessage();
    expect(msg).toMatch(/specs\/\d{3}-\*\/spec\.md/);
    expect(msg).toMatch(/spec_gap/);
  });
});

describe('manifest wording for the automated run (FR-009, FR-031)', () => {
  const COPIES = ['src/agents/developer-agent.md', '.github/agents/developer-agent.md'];
  for (const rel of COPIES) {
    it(`${rel}: says automated runs report through signal_outcome and must not also post by hand`, () => {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const section = text.slice(text.indexOf('### Missing spec'), text.indexOf('## Permitted Commands'));
      expect(section).toMatch(/signal_outcome/);
      expect(section).toMatch(/exactly one|only one|single/i);
    });
  }
  it('the two copies are identical', () => {
    expect(fs.readFileSync(path.join(ROOT, COPIES[0]), 'utf8')).toBe(fs.readFileSync(path.join(ROOT, COPIES[1]), 'utf8'));
  });
});

describe('mirror (FR-017)', () => {
  it('src/.github/scripts/dev-agent-runner.cjs is byte-identical', () => {
    expect(fs.readFileSync(MIRROR_PATH, 'utf8')).toBe(fs.readFileSync(RUNNER_PATH, 'utf8'));
  });
});
