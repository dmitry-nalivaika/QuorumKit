/**
 * ba-spec-author.cjs — the automated BA/Product Agent step writes the bug-fix spec (#377).
 * specs/377-bug-fix-pipeline-spec-gate/spec.md — FR-024..FR-028, FR-034.
 *
 * Review of PR #395 found copilot-agent-ba.yml made one chat call and posted the reply as a
 * comment; nothing created specs/NNN-*\/spec.md, so for a `type:bug` issue with no spec the step
 * reported `spec_gap` forever (ba -> ba until the loop budget ran out).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import yaml from 'js-yaml';

const requireCjs = createRequire(import.meta.url);
const ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const MODULE_PATH = path.join(ROOT, '.github/scripts/ba-spec-author.cjs');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const author = requireCjs(MODULE_PATH);

const GOOD_SPEC = `# Spec: Dev agent blocks bug-fix pipeline — Issue #377

**Type:** bug-fix (Template C)

## Overview
The Developer Agent stops on every bug because no spec exists. It should get one first.

## Reproduction
1. Label a small issue \`triaged\` and \`type:bug\`.
2. The pipeline dispatches the Developer Agent.
Observed: it fails with "spec missing".
Expected: a spec exists before development starts.

## Functional Requirements
- FR-001: A bug issue has a spec before the Developer Agent starts.

## Success Criteria
- [ ] A regression test exists that fails before the fix and passes after it
- [ ] The pipeline reaches QA without a hand-written spec

## Out of Scope
Changing the feature pipeline.

## Security and Privacy Considerations
N/A — no new data flows.

## Open Questions
None.
`;

const wrap = (spec, tail = 'SUMMARY: Spec written.\nOUTCOME: success') =>
  `Here is the spec.\n\n=== SPEC BEGIN ===\n${spec}\n=== SPEC END ===\n\n${tail}`;

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-author-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const specFiles = () => {
  const dir = path.join(root, 'specs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(d => (fs.existsSync(path.join(dir, d, 'spec.md')) ? [`${d}/spec.md`] : []));
};

describe('isBugIssue', () => {
  it('accepts string and object labels', () => {
    expect(author.isBugIssue(['type:bug'])).toBe(true);
    expect(author.isBugIssue([{ name: 'triaged' }, { name: 'type:bug' }])).toBe(true);
  });
  it('rejects other issues and bad input', () => {
    expect(author.isBugIssue(['type:feature'])).toBe(false);
    expect(author.isBugIssue([])).toBe(false);
    expect(author.isBugIssue(undefined)).toBe(false);
  });
});

describe('slugFromTitle / specDirName', () => {
  it('builds a safe NNN-slug directory name', () => {
    expect(author.specDirName(377, 'Dev agent blocks bug-fix pipeline: spec!'))
      .toBe('377-dev-agent-blocks-bug-fix-pipeline-spec');
  });
  it('cuts the slug at 40 characters, like the pipeline branch tooling', () => {
    expect(author.specDirName(377, 'Dev agent blocks bug-fix pipeline: spec first'))
      .toBe('377-dev-agent-blocks-bug-fix-pipeline-spec-f');
  });
  it('pads the issue number to 3 digits and bounds the slug', () => {
    expect(author.specDirName(7, 'x'.repeat(200))).toMatch(/^007-x{40}$/);
  });
  it('never lets a title escape the specs directory', () => {
    const d = author.specDirName(5, '../../etc/passwd');
    expect(d).toBe('005-etc-passwd');
    expect(d).not.toMatch(/[./\\]/);
  });
  it('falls back when the title has nothing usable', () => {
    expect(author.specDirName(9, '###')).toBe('009-bug-fix');
    expect(author.specDirName(9, undefined)).toBe('009-bug-fix');
  });
  it('rejects an invalid issue number', () => {
    expect(() => author.specDirName('abc', 't')).toThrow();
    expect(() => author.specDirName(0, 't')).toThrow();
  });
});

describe('extractSpec', () => {
  it('takes the text between the markers and returns the reply without it', () => {
    const r = author.extractSpec(wrap(GOOD_SPEC));
    expect(r.spec).toBe(GOOD_SPEC.trim());
    expect(r.rest).not.toContain('# Spec:');
    expect(r.rest).toContain('OUTCOME: success');
  });
  it('unwraps a spec the model put inside one code fence', () => {
    const r = author.extractSpec(wrap('```markdown\n' + GOOD_SPEC.trim() + '\n```'));
    expect(r.spec).toBe(GOOD_SPEC.trim());
  });
  it('returns null when there are no markers or the block is empty', () => {
    expect(author.extractSpec('just prose\nOUTCOME: success').spec).toBeNull();
    expect(author.extractSpec(wrap('   ')).spec).toBeNull();
    expect(author.extractSpec('=== SPEC BEGIN ===\nno end marker').spec).toBeNull();
  });
});

describe('validateBugSpec (FR-012, FR-014, FR-027)', () => {
  const ok = s => author.validateBugSpec(s, 377);
  it('passes a complete bug spec', () => {
    expect(ok(GOOD_SPEC)).toEqual({ ok: true, problems: [] });
  });
  it.each([
    ['Overview', '## Overview'],
    ['Reproduction', '## Reproduction'],
    ['Functional Requirements', '## Functional Requirements'],
    ['Success Criteria', '## Success Criteria'],
    ['Out of Scope', '## Out of Scope'],
    ['Security and Privacy Considerations', '## Security and Privacy Considerations'],
    ['Open Questions', '## Open Questions'],
  ])('fails when the %s section is missing', (name, heading) => {
    const r = ok(GOOD_SPEC.replace(heading, '## Something Else'));
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain(name);
  });
  it('requires an FR and a regression-test criterion', () => {
    expect(ok(GOOD_SPEC.replace('- FR-001:', '- Requirement:')).ok).toBe(false);
    expect(ok(GOOD_SPEC.replace(/regression test/g, 'check')).ok).toBe(false);
  });
  it('requires the heading to name this issue', () => {
    expect(ok(GOOD_SPEC.replace('Issue #377', 'Issue #12')).ok).toBe(false);
    expect(ok(GOOD_SPEC.replace('# Spec:', '# Notes:')).ok).toBe(false);
  });
  it('rejects clarification markers and unresolved open questions', () => {
    expect(ok(GOOD_SPEC.replace('Expected: a spec', 'Expected: [NEEDS CLARIFICATION: what?] a spec')).ok).toBe(false);
    expect(ok(GOOD_SPEC.replace('None.', '1. Should this also cover features?')).ok).toBe(false);
    expect(ok(GOOD_SPEC.replace('None.', '- Who owns this?')).ok).toBe(false);
  });
  it('rejects unfilled template placeholders', () => {
    expect(ok(GOOD_SPEC.replace('Changing the feature pipeline.', '[What this fix does NOT change]')).ok).toBe(false);
  });
  it('rejects text that imitates the machine-readable parts of a footprint', () => {
    expect(ok(GOOD_SPEC + '\n```apm-msg\n{}\n```\n').ok).toBe(false);
    expect(ok(GOOD_SPEC + '\n<!-- apm:run_id=x step=ba iteration=1 runtime=r outcome=success -->\n').ok).toBe(false);
  });
  it('rejects an oversized spec', () => {
    expect(ok(GOOD_SPEC + 'x'.repeat(30000)).ok).toBe(false);
  });
});

describe('authorSpec: an issue with no spec (FR-024, FR-025, FR-034)', () => {
  const base = () => ({ root, issueNumber: 377, title: 'Dev agent blocks bug-fix pipeline', labels: ['triaged', 'type:bug'], today: '2026-10-06' });

  it('writes the spec at specs/NNN-slug/spec.md and reports success', () => {
    const r = author.authorSpec({ ...base(), reply: wrap(GOOD_SPEC), modelOutcome: 'success' });
    expect(r).toMatchObject({ action: 'authored', outcome: 'success', written: true });
    expect(r.specPath).toBe('specs/377-dev-agent-blocks-bug-fix-pipeline/spec.md');
    expect(fs.readFileSync(path.join(root, r.specPath), 'utf8')).toBe(GOOD_SPEC.trim() + '\n');
    expect(specFiles()).toEqual(['377-dev-agent-blocks-bug-fix-pipeline/spec.md']);
  });

  it('updates the active-feature pointer (and only that besides the spec) (FR-028)', () => {
    author.authorSpec({ ...base(), reply: wrap(GOOD_SPEC), modelOutcome: 'success' });
    const fj = JSON.parse(fs.readFileSync(path.join(root, '.specify/feature.json'), 'utf8'));
    expect(fj).toMatchObject({
      feature_directory: 'specs/377-dev-agent-blocks-bug-fix-pipeline',
      spec_dir: 'specs/377-dev-agent-blocks-bug-fix-pipeline',
      branch: '377-dev-agent-blocks-bug-fix-pipeline',
      issue: 377, status: 'spec-ready', updated: '2026-10-06',
    });
    const written = [];
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(path.join(d, e.name)) : written.push(path.relative(root, path.join(d, e.name)))));
    walk(root);
    expect(written.sort()).toEqual(['.specify/feature.json', 'specs/377-dev-agent-blocks-bug-fix-pipeline/spec.md']);
  });

  it('preserves other keys already in feature.json', () => {
    fs.mkdirSync(path.join(root, '.specify'));
    fs.writeFileSync(path.join(root, '.specify/feature.json'), JSON.stringify({ custom: 'keep' }));
    author.authorSpec({ ...base(), reply: wrap(GOOD_SPEC), modelOutcome: 'success' });
    expect(JSON.parse(fs.readFileSync(path.join(root, '.specify/feature.json'), 'utf8')).custom).toBe('keep');
  });

  it('reports spec_gap and writes nothing when the reply has no spec', () => {
    const r = author.authorSpec({ ...base(), reply: 'I could not write it.\nOUTCOME: success', modelOutcome: 'success' });
    expect(r).toMatchObject({ action: 'authored', outcome: 'spec_gap', written: false });
    expect(specFiles()).toEqual([]);
    expect(fs.existsSync(path.join(root, '.specify/feature.json'))).toBe(false);
  });

  it('reports spec_gap and writes nothing when the spec is unusable, naming the problem', () => {
    const r = author.authorSpec({ ...base(), reply: wrap(GOOD_SPEC.replace('## Out of Scope', '## Nope')), modelOutcome: 'success' });
    expect(r).toMatchObject({ outcome: 'spec_gap', written: false });
    expect(r.summary).toContain('Out of Scope');
    expect(specFiles()).toEqual([]);
  });

  it('reports spec_gap when the model itself says spec_gap, even if it included a spec', () => {
    const r = author.authorSpec({ ...base(), reply: wrap(GOOD_SPEC, 'OUTCOME: spec_gap'), modelOutcome: 'spec_gap' });
    expect(r).toMatchObject({ outcome: 'spec_gap', written: false });
    expect(specFiles()).toEqual([]);
  });

  it('reports needs-human, writing nothing, when the model cannot establish the bug (FR-016, FR-025)', () => {
    const r = author.authorSpec({ ...base(), reply: 'No steps to reproduce.\nOUTCOME: needs-human', modelOutcome: 'needs-human' });
    expect(r).toMatchObject({ outcome: 'needs-human', written: false });
    expect(specFiles()).toEqual([]);
  });

  it('never reports success without a spec on disk', () => {
    for (const reply of ['', 'x', wrap(''), wrap('# Spec: x — Issue #377')]) {
      const r = author.authorSpec({ ...base(), reply, modelOutcome: 'success' });
      expect(r.outcome).not.toBe('success');
      expect(r.written).toBe(false);
    }
  });
});

describe('authorSpec: reuse and scope (FR-026, FR-024)', () => {
  const run = extra => author.authorSpec({
    root, issueNumber: 377, title: 'Dev agent blocks bug-fix pipeline', labels: ['type:bug'], today: '2026-10-06',
    reply: wrap(GOOD_SPEC), modelOutcome: 'success', ...extra,
  });

  it('reuses an existing spec: no second directory, nothing written', () => {
    fs.mkdirSync(path.join(root, 'specs/377-hand-written'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs/377-hand-written/spec.md'), '# existing\n');
    const r = run();
    expect(r).toMatchObject({ action: 'reuse', outcome: null, written: false, specPath: 'specs/377-hand-written/spec.md' });
    expect(specFiles()).toEqual(['377-hand-written/spec.md']);
    expect(fs.readFileSync(path.join(root, 'specs/377-hand-written/spec.md'), 'utf8')).toBe('# existing\n');
  });

  it('writes into an existing NNN-* directory that lacks spec.md instead of creating a second one', () => {
    fs.mkdirSync(path.join(root, 'specs/377-already-here'), { recursive: true });
    const r = run();
    expect(r).toMatchObject({ outcome: 'success', written: true, specPath: 'specs/377-already-here/spec.md' });
    expect(fs.readdirSync(path.join(root, 'specs'))).toEqual(['377-already-here']);
  });

  it('leaves non-bug issues to the existing behaviour (no authoring)', () => {
    const r = run({ labels: ['type:feature'] });
    expect(r).toMatchObject({ action: 'skip', outcome: null, written: false });
    expect(specFiles()).toEqual([]);
  });

  it('does not match a different issue number that shares a prefix', () => {
    fs.mkdirSync(path.join(root, 'specs/3770-other'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs/3770-other/spec.md'), 'x');
    expect(run().action).toBe('authored');
  });
});

describe('prompt (FR-027)', () => {
  it('asks for Template C between the markers, only from facts in the issue, with the outcome rules', () => {
    const p = author.buildSpecRequest({ issueNumber: 377, title: 'T' });
    expect(p).toContain('=== SPEC BEGIN ===');
    expect(p).toContain('=== SPEC END ===');
    expect(p).toContain('Template C');
    expect(p).toContain('# Spec: T — Issue #377');
    expect(p).toMatch(/only (?:facts|what)[^\n]*issue/i);
    expect(p).toMatch(/needs-human/);
    expect(p).toMatch(/spec_gap/);
  });
});

describe('copilot-agent-ba.yml wiring (FR-024, FR-028, FR-017)', () => {
  const rel = '.github/workflows/copilot-agent-ba.yml';
  const wf = read(rel);
  const steps = Object.values(yaml.load(wf).jobs)[0].steps;
  const agent = steps.find(s => s.id === 'agent').with.script;
  const publish = steps.find(s => s.id === 'publish').with.script;

  it('the agent step authors the spec through the module', () => {
    expect(agent).toContain("require('./.github/scripts/ba-spec-author.cjs')");
    expect(agent).toMatch(/authorSpec\(/);
    expect(agent).toMatch(/buildSpecRequest\(/);
  });

  it('gives the model room to write a spec', () => {
    expect(agent).toMatch(/max_tokens:\s*4096/);
  });

  it('records the module verdict (spec_gap / needs-human) instead of the model prose verdict', () => {
    expect(agent).toMatch(/report\.verdict\(\{ outcome: authored\.outcome/);
  });

  it('the publish step does not override a spec_gap / needs-human the authoring step settled', () => {
    expect(steps.find(s => s.id === 'publish').env.AUTHORED_OUTCOME).toBe('${{ steps.agent.outputs.authored_outcome }}');
    expect(publish).toMatch(/process\.env\.AUTHORED_OUTCOME/);
    expect(agent).toMatch(/setOutput\('authored_outcome'/);
  });

  it('only authors for a type:bug issue with no spec; other issues keep the existing prompt', () => {
    expect(agent).toMatch(/isBugIssue\(/);
    expect(agent).toMatch(/findExistingSpec\(/);
    expect(agent).toContain('post a structured requirements summary as a comment');
  });

  it('the dirty-tree guard sees files inside a new untracked directory', () => {
    expect(publish).toContain('git status --porcelain --untracked-files=all');
  });

  it('keeps the rule that any other changed file stops the publish', () => {
    expect(publish).toMatch(/file !== specPath && file !== '\.specify\/feature\.json'/);
  });

  it('the src/ distribution copy of the workflow is byte-identical', () => {
    expect(read(`src/${rel}`)).toBe(wf);
  });

  it('ships the module in both script trees, byte-identical', () => {
    expect(read('src/.github/scripts/ba-spec-author.cjs')).toBe(read('.github/scripts/ba-spec-author.cjs'));
  });
});

describe('BA manifest mentions the automated authoring (FR-024)', () => {
  for (const rel of ['src/agents/ba-product-agent.md', '.github/agents/ba-product-agent.md']) {
    it(`${rel}: says the automated step writes the Template C spec between the markers`, () => {
      const t = read(rel);
      expect(t).toMatch(/=== SPEC BEGIN ===/);
      expect(t).toMatch(/automated/i);
    });
  }
  it('the two copies are identical', () => {
    expect(read('src/agents/ba-product-agent.md')).toBe(read('.github/agents/ba-product-agent.md'));
  });
});
