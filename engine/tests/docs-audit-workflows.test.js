/**
 * Structural guards for the scheduled documentation audit workflows (Issue #331).
 *
 * Both runtimes share one engine (docs-audit.cjs) and differ only in how the judge is called (FR-020).
 * The audit is read-only (FR-017), runs on a schedule (FR-001/002), and leaves the per-merge Docs Agent
 * untouched (FR-018). The checklist lives only in docs-agent.md (FR-005).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => readFileSync(resolve(ROOT, rel), 'utf8');
const load = rel => yaml.load(read(rel));

const COPILOT = 'src/.github/workflows/copilot-agent-docs-audit.yml';
const CLAUDE = 'src/.github/workflows/agent-docs-audit.yml';
const stripComments = text => text.split('\n').filter(l => !/^\s*(#|\/\/)/.test(l)).join('\n');
const steps = doc => doc.jobs['docs-audit'].steps;

describe.each([['Copilot', COPILOT], ['Claude', CLAUDE]])('T015/T016 %s audit workflow', (_n, rel) => {
  const doc = load(rel);
  const text = read(rel);

  it('runs weekly on Mondays and on demand, with no merge or comment trigger (FR-001/002)', () => {
    expect(Object.keys(doc.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(doc.on.schedule).toEqual([{ cron: '0 6 * * 1' }]);
  });

  it('has least privilege: no content or PR write (FR-017)', () => {
    expect(doc.permissions.contents).toBe('read');
    expect(doc.permissions.issues).toBe('write');
    expect(doc.permissions['pull-requests']).toBeUndefined();
    expect(Object.values(doc.permissions)).not.toContain('admin');
  });

  it('queues runs in their own concurrency group, separate from the per-merge docs workflow (FR-018)', () => {
    expect(doc.concurrency).toEqual({ group: 'docs-audit', 'cancel-in-progress': false });
  });

  it('bounds its runtime and writes outputs outside the work tree', () => {
    expect(doc.jobs['docs-audit']['timeout-minutes']).toBeLessThanOrEqual(30);
    expect(text).toContain('$RUNNER_TEMP/docs-audit');
    expect(text).not.toMatch(/--out\s+(\.|docs|specs)\b/);
  });

  it('never commits, pushes or opens a PR', () => {
    const code = stripComments(text);
    expect(code).not.toMatch(/git (commit|push|add)\b/);
    expect(code).not.toMatch(/gh pr create/);
    expect(code).not.toMatch(/createPullRequest|git\.createRef|repos\.createOrUpdateFileContents/);
  });

  it('collects with the shared engine, then publishes only through runAudit/publishFromFiles', () => {
    expect(text).toContain('.github/scripts/docs-audit.cjs collect');
    expect(text).toContain('audit.runAudit');
    expect(text).toContain('audit.publishFromFiles');
  });

  it('records a failure summary that says it is not a clean result (FR-016)', () => {
    const last = steps(doc).at(-1);
    expect(last.if).toBe('failure()');
    expect(read(rel)).toMatch(/AUDIT FAILED[\s\S]*not a clean result/);
  });

  it('pins third-party actions to commit SHAs', () => {
    for (const s of steps(doc).filter(x => x.uses)) expect(s.uses).toMatch(/@[0-9a-f]{40}$/);
  });
});

describe('T015 Copilot runtime resolution is identical to the sibling docs workflow', () => {
  const sibling = read('src/.github/workflows/copilot-agent-docs.yml');
  const mine = read(COPILOT);
  const block = t => t.slice(t.indexOf('// ADR-332: resolve the runtime'), t.indexOf("const authHeaders = { 'api-key': runtimeCredential };"));

  it('copies the registry-driven resolver and allowlists byte for byte', () => {
    expect(block(mine).length).toBeGreaterThan(1000);
    expect(block(mine)).toBe(block(sibling));
  });

  it('has no retired GitHub Models host', () => {
    expect(stripComments(mine)).not.toContain('models.inference.ai.azure.com');
  });

  it('keeps the same dispatch inputs for runtime selection', () => {
    const a = load(COPILOT).on.workflow_dispatch.inputs;
    const b = load('src/.github/workflows/copilot-agent-docs.yml').on.workflow_dispatch.inputs;
    for (const k of ['runtime_endpoint', 'runtime_model', 'runtime_credential_ref', 'runtime_api_version']) expect(a[k]).toEqual(b[k]);
  });

  it('exposes AZURE_OPENAI_API_KEY without defaulting RUNTIME_CREDENTIAL to GITHUB_TOKEN', () => {
    const agent = steps(load(COPILOT)).find(s => s.id === 'agent');
    expect(agent.env).toHaveProperty('AZURE_OPENAI_API_KEY');
    expect(String(agent.env.RUNTIME_CREDENTIAL)).not.toMatch(/\|\|\s*secrets\.GITHUB_TOKEN/);
  });
});

describe('T016 Claude judge is confined', () => {
  const doc = load(CLAUDE);
  const judge = steps(doc).find(s => String(s.uses).startsWith('anthropics/claude-code-action'));

  it('may only read, and write only the findings file, with no shell', () => {
    const args = judge.with.claude_args;
    expect(args).toMatch(/--allowedTools\s+"?Read,Glob,Grep,Write\(/);
    // Write is scoped to the one findings file under the runner temp dir, never granted bare.
    expect(args).not.toMatch(/\bWrite(?!\()/);
    expect(args).toContain('docs-audit/judge.json)');
    expect(args).toContain('${{ runner.temp }}');
    expect(args).not.toMatch(/Bash|Edit|MultiEdit|NotebookEdit/);
  });

  it('records the work tree, ignored files included, before the judge runs', () => {
    const names = steps(doc).map(s => s.name);
    const snap = steps(doc).find(s => /snapshot/i.test(s.name || ''));
    expect(snap).toBeDefined();
    expect(names.indexOf(snap.name)).toBeLessThan(names.indexOf(judge.name));
    expect(snap.run).toContain('git status --porcelain --ignored');
    expect(snap.run).toContain('$RUNNER_TEMP');
  });

  it('compares against that snapshot right after the judge, so a gitignored file cannot be written unnoticed', () => {
    const names = steps(doc).map(s => s.name);
    const check = steps(doc)[names.indexOf(judge.name) + 1];
    expect(check.name).toBe('Confirm the working tree is unchanged (read-only audit)');
    expect(check.run).toContain('git status --porcelain --ignored');
    expect(check.run).toMatch(/diff\b/);
    expect(check.run).toContain('exit 1');
  });

  it('is followed by a check that the work tree is unchanged', () => {
    const names = steps(doc).map(s => s.name);
    expect(names.indexOf('Confirm the working tree is unchanged (read-only audit)')).toBe(names.indexOf(judge.name) + 1);
  });
});

describe('T017 mirrors and ignore rules', () => {
  it('the Copilot workflow and the engine are byte-identical in src/.github and .github (ADR-006)', () => {
    expect(read('.github/workflows/copilot-agent-docs-audit.yml')).toBe(read(COPILOT));
    expect(read('.github/scripts/docs-audit.cjs')).toBe(read('src/.github/scripts/docs-audit.cjs'));
  });

  it('the Claude variant is generated, so it is gitignored in .github like its siblings', () => {
    expect(read('.gitignore')).toContain('.github/workflows/agent-docs-audit.yml');
    expect(existsSync(resolve(ROOT, '.github/workflows/agent-docs-audit.yml'))).toBe(false);
  });

  it('docs-agent.md is byte-identical in src/agents and .github/agents (M6)', () => {
    expect(read('.github/agents/docs-agent.md')).toBe(read('src/agents/docs-agent.md'));
  });

  it('the engine still passes node --check and has no new dependency', () => {
    execFileSync('node', ['--check', resolve(ROOT, 'src/.github/scripts/docs-audit.cjs')]);
    const requires = [...read('src/.github/scripts/docs-audit.cjs').matchAll(/require\('([^']+)'\)/g)].map(m => m[1]);
    for (const r of requires) expect(['fs', 'path', 'crypto', './agent-report.cjs']).toContain(r);
  });
});

describe('T018 the per-merge Docs Agent is unchanged (FR-018)', () => {
  it.each(['src/.github/workflows/copilot-agent-docs.yml', 'src/.github/workflows/agent-docs.yml'])('%s keeps its triggers and does not mention the audit', rel => {
    const doc = load(rel);
    expect(Object.keys(doc.on)).toEqual(expect.arrayContaining(['push', 'issue_comment']));
    expect(doc.on.schedule).toBeUndefined();
    expect(read(rel)).not.toMatch(/docs-audit/);
  });

  it('no other workflow reads the audit output directory or edits the work tree for it', () => {
    for (const rel of [COPILOT, CLAUDE]) expect(stripComments(read(rel))).not.toMatch(/contents:\s*write/);
  });
});

describe('T020 the audit prompt points at docs-agent.md and does not restate the checklist (FR-005)', () => {
  const agent = read('src/agents/docs-agent.md');
  const CHECKLIST_ITEMS = [
    'README "Features" section updated',
    'All **public** functions, classes, and methods have a doc comment',
    'a new ADR file',
    'All markdown links in docs that reference other files are valid',
    'Version numbers in docs match the current project version',
  ];

  it('docs-agent.md still owns every checklist item', () => {
    for (const item of CHECKLIST_ITEMS) expect(agent).toContain(item);
  });

  it.each([COPILOT, CLAUDE])('%s does not copy a checklist item', rel => {
    const text = read(rel);
    for (const item of CHECKLIST_ITEMS) expect(text).not.toContain(item);
  });

  it('the Claude prompt and the Copilot system prompt both load docs-agent.md', () => {
    expect(read(CLAUDE)).toContain('.claude/agents/docs-agent.md');
    expect(read(COPILOT)).toContain(".github/agents/docs-agent.md");
  });

  it('docs-agent.md defines Scheduled Audit Mode: current-state reading, category map, output contract (FR-006)', () => {
    expect(agent).toContain('## Scheduled Audit Mode');
    expect(agent).toMatch(/read it as "the current state of the repository"/);
    for (const c of ['readme', 'cross-reference', 'changelog', 'architecture']) expect(agent).toContain(`\`${c}\``);
    expect(agent).toContain('DOCS-BLOCKER | DOCS-SUGGESTION');
    expect(agent).toContain('Match by issue number, never by slug');
    expect(agent).toMatch(/You do not edit files, open PRs, create issues or post comments in this mode/);
  });

  it('the audit mode adds no rule that contradicts the Hard Constraints', () => {
    const mode = agent.slice(agent.indexOf('## Scheduled Audit Mode'), agent.indexOf('## Documentation Audit Checklist'));
    expect(mode).not.toMatch(/MUST open a Documentation PR/);
    expect(agent.indexOf('## Hard Constraints')).toBeGreaterThan(agent.indexOf('## Scheduled Audit Mode'));
  });
});
