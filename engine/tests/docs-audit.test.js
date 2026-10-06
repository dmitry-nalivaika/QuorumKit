/**
 * docs-audit.cjs: periodic full-set documentation audit (Issue #331).
 *
 * The engine does everything that must be identical under Claude and Copilot (FR-020): the doc set,
 * deterministic checks, finding validation, fingerprints, de-duplication, the tracking issue and the
 * quiet-when-clean rule. The model only judges (README/CHANGELOG currency, ADR need) and never publishes.
 * GitHub and the network are injected, so nothing here touches the real API.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const requireCjs = createRequire(import.meta.url);
const audit = requireCjs(path.join(ROOT, '.github/scripts/docs-audit.cjs'));

let dir;
const write = (rel, text) => {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};
const makeRepo = files => Object.entries(files).forEach(([k, v]) => write(k, v));

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audit-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const finding = (o = {}) => ({
  category: 'readme', severity: 'DOCS-SUGGESTION', file: 'README.md', section: 'Features',
  description: 'The feature list does not mention the audit.', ...o,
});

// ---------------------------------------------------------------------------------------------
describe('T001 collectDocSet', () => {
  it('returns root documents, docs/, specs/ and ADRs, and skips node_modules and .git', () => {
    makeRepo({
      'README.md': '# R', 'CHANGELOG.md': '# C', 'notes.txt': 'x',
      'docs/guide.md': '# G', 'docs/architecture/adr-001-x.md': '# A',
      'specs/001-a/spec.md': '# S', 'node_modules/pkg/README.md': '# no', '.git/x.md': '# no',
      'src/agents/a.md': '# agent',
    });
    expect(audit.collectDocSet(dir)).toEqual([
      'CHANGELOG.md', 'README.md', 'docs/architecture/adr-001-x.md', 'docs/guide.md', 'specs/001-a/spec.md',
    ]);
  });

  it('works for a repository that only has a README (no failure for missing categories)', () => {
    makeRepo({ 'README.md': '# Only' });
    expect(audit.collectDocSet(dir)).toEqual(['README.md']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('T002 checkLinks (relative links and anchors)', () => {
  it('finds a broken relative link in a file no recent change touched, with file and section', () => {
    makeRepo({ 'docs/old.md': '# Old\n\n## Setup\n\nSee [guide](./missing.md).\n' });
    const f = audit.checkLinks({ root: dir, files: ['docs/old.md'], ignorePatterns: [] }).findings;
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      category: 'cross-reference', severity: 'DOCS-BLOCKER', file: 'docs/old.md', section: 'Setup',
    });
    expect(f[0].description).toContain('./missing.md');
    expect(f[0].rule).toBe('link:./missing.md');
  });

  it('accepts existing files, directories and root-relative links', () => {
    makeRepo({
      'README.md': '# R\n[a](docs/a.md) [d](docs) [r](/docs/a.md)\n', 'docs/a.md': '# A\n',
    });
    expect(audit.checkLinks({ root: dir, files: ['README.md'], ignorePatterns: [] }).findings).toEqual([]);
  });

  it('validates anchors with GitHub slugs, including duplicates and punctuation', () => {
    makeRepo({
      'README.md': '# R\n[ok](./b.md#my-heading-1) [dup](./b.md#my-heading) [bad](./b.md#nope) [self](#r)\n',
      'b.md': '# B\n## My Heading!\n## My Heading!\n',
    });
    const f = audit.checkLinks({ root: dir, files: ['README.md'], ignorePatterns: [] }).findings;
    expect(f.map(x => x.rule)).toEqual(['link:./b.md#nope']);
  });

  it('ignores links inside fenced code and inline code', () => {
    makeRepo({ 'README.md': '# R\n```md\n[x](./nope.md)\n```\nInline `[y](./nope2.md)` here.\n' });
    expect(audit.checkLinks({ root: dir, files: ['README.md'], ignorePatterns: [] }).findings).toEqual([]);
  });

  it('honours the repository link-check ignore patterns (FR-019)', () => {
    makeRepo({ 'README.md': '# R\n[x](./generated/out.md) [y](#conflict-existing-x)\n' });
    const ignorePatterns = [{ pattern: 'generated/' }, { pattern: '^#conflict-existing-' }];
    expect(audit.checkLinks({ root: dir, files: ['README.md'], ignorePatterns }).findings).toEqual([]);
  });

  it('uses "line N" when no heading precedes the link', () => {
    makeRepo({ 'x.md': 'intro\n\n[a](./gone.md)\n' });
    const f = audit.checkLinks({ root: dir, files: ['x.md'], ignorePatterns: [] }).findings;
    expect(f[0].section).toBe('line 3');
  });

  it('returns external links for the network check without reporting them itself', () => {
    makeRepo({ 'README.md': '# R\n[w](https://example.com/a) [m](mailto:a@b.c)\n' });
    const r = audit.checkLinks({ root: dir, files: ['README.md'], ignorePatterns: [] });
    expect(r.findings).toEqual([]);
    expect(r.external).toEqual([{ url: 'https://example.com/a', file: 'README.md', section: 'R', line: 2 }]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('T003 checkExternalLinks (FR-019: no single transient failure)', () => {
  const link = (url = 'https://example.com/x') => ({ url, file: 'README.md', section: 'R', line: 2 });
  const res = status => ({ status });
  const opts = fetchImpl => ({ fetchImpl, sleep: async () => {}, ignorePatterns: [], retries: 3 });

  it('reports a link that is definitively gone (404 on every attempt)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(404));
    const f = await audit.checkExternalLinks([link()], opts(fetchImpl));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ category: 'cross-reference', severity: 'DOCS-SUGGESTION', rule: 'link:https://example.com/x' });
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('does not report when a later attempt succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(404)).mockResolvedValue(res(200));
    expect(await audit.checkExternalLinks([link()], opts(fetchImpl))).toEqual([]);
  });

  it.each([429, 500, 502, 503])('never reports a transient status %i', async status => {
    expect(await audit.checkExternalLinks([link()], opts(vi.fn().mockResolvedValue(res(status))))).toEqual([]);
  });

  it('never reports timeouts or connection resets', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    expect(await audit.checkExternalLinks([link()], opts(fetchImpl))).toEqual([]);
  });

  it('reports a host that does not resolve (ENOTFOUND on every attempt)', async () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const f = await audit.checkExternalLinks([link('https://nope.invalid/')], opts(vi.fn().mockRejectedValue(err)));
    expect(f).toHaveLength(1);
  });

  it('skips ignored URLs and checks each distinct URL once but reports every place it is used', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(404));
    const links = [link('https://a.test/x'), { ...link('https://a.test/x'), file: 'docs/b.md' }, link('https://skip.test/y')];
    const f = await audit.checkExternalLinks(links, { ...opts(fetchImpl), ignorePatterns: [{ pattern: '^https://skip\\.test' }] });
    expect(f.map(x => x.file).sort()).toEqual(['README.md', 'docs/b.md']);
    const urls = new Set(fetchImpl.mock.calls.map(c => c[0]));
    expect([...urls]).toEqual(['https://a.test/x']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('T004/T005 collectFacts and version findings', () => {
  it('matches specs to ADRs by issue number, not by slug', async () => {
    makeRepo({
      'specs/010-first/spec.md': '# Spec: First\n\n## Overview\n\nDoes a thing.\n',
      'specs/020-second/spec.md': '# Spec: Second\n\n## Overview\n\nDoes another thing with a new dependency.\n',
      'specs/030-third/spec.md': '# Spec: Third\n',
      'docs/architecture/adr-010-completely-different-slug.md': '# ADR-010\n',
    });
    const states = { 20: 'closed', 30: 'open' };
    const facts = await audit.collectFacts(dir, { getIssueState: async n => states[n] ?? null });
    expect(facts.adrs.map(a => a.nnn)).toEqual(['010']);
    expect(facts.adrCandidates.map(c => c.nnn)).toEqual(['020']);
    expect(facts.adrCandidates[0]).toMatchObject({ specFile: 'specs/020-second/spec.md', title: 'Spec: Second' });
    expect(facts.adrCandidates[0].excerpt).toContain('new dependency');
    expect(facts.skipped.map(s => s.nnn).sort()).toEqual(['030']);
  });

  it('records a lookup that failed as unchecked, never as a skip (FR-016)', async () => {
    makeRepo({ 'specs/040-x/spec.md': '# X\n', 'specs/050-y/spec.md': '# Y\n' });
    const states = { 50: 'open' };
    const facts = await audit.collectFacts(dir, { getIssueState: async n => states[n] ?? null });
    expect(facts.adrCandidates).toEqual([]);
    expect(facts.unchecked).toEqual([{ nnn: '040', reason: 'issue state lookup failed' }]);
    expect(facts.skipped.map(s => s.nnn)).toEqual(['050']);
  });

  it('records every spec as unchecked when no lookup is available at all', async () => {
    makeRepo({ 'specs/040-x/spec.md': '# X\n' });
    const facts = await audit.collectFacts(dir, {});
    expect(facts.unchecked.map(s => s.nnn)).toEqual(['040']);
  });

  it('any state other than open or closed (including an unexpected value) is unchecked, never a silent skip', async () => {
    makeRepo({ 'specs/040-x/spec.md': '# X\n' });
    const facts = await audit.collectFacts(dir, { getIssueState: async () => 'missing' });
    expect(facts.skipped).toEqual([]);
    expect(facts.unchecked.map(s => s.nnn)).toEqual(['040']);
  });

  it('reads versions from package.json, quorumkit.yml and the latest CHANGELOG release', async () => {
    makeRepo({
      'quorumkit.yml': 'name: x\nversion: 3.3.2\n',
      'engine/package.json': '{"version":"3.3.2"}',
      'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n\n## [3.3.2] — 2026-10-06\n\n## [3.3.1] — x\n',
    });
    const facts = await audit.collectFacts(dir, { getIssueState: async () => null });
    expect(facts.versions).toEqual({ 'quorumkit.yml': '3.3.2', 'engine/package.json': '3.3.2', changelogLatest: '3.3.2' });
    expect(audit.versionFindings(facts, dir)).toEqual([]);
  });

  it('reports a CHANGELOG that lags the project version (quorumkit.yml); a disagreeing package.json is a fact for the judge, not a finding', async () => {
    makeRepo({
      'quorumkit.yml': 'version: 3.4.0\n',
      'engine/package.json': '{"version":"3.3.2"}',
      'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n\n## [3.3.2] — 2026-10-06\n',
    });
    const facts = await audit.collectFacts(dir, { getIssueState: async () => null });
    const f = audit.versionFindings(facts, dir);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ category: 'changelog', file: 'CHANGELOG.md', severity: 'DOCS-SUGGESTION', rule: 'version-lag' });
    expect(f[0].section).toBe('line 5');
    expect(f[0].description).toContain('3.4.0');
    expect(f[0].description).toContain('3.3.2');
  });

  it('has no version findings in a repository with no version source', async () => {
    makeRepo({ 'README.md': '# R\n' });
    const facts = await audit.collectFacts(dir, { getIssueState: async () => null });
    expect(audit.versionFindings(facts, dir)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('T006 validateFindings', () => {
  beforeEach(() => {
    makeRepo({
      'README.md': '# Proj\n\n## Features\n\ntext\n\n## `Usage` guide\n',
      'specs/020-second/spec.md': '# Spec\n\n## Overview\n\nx\n',
    });
  });
  const ctx = () => ({ root: dir, candidates: [{ nnn: '020' }] });

  it('accepts a complete finding and canonicalises the section to the real heading', () => {
    const { valid, rejected } = audit.validateFindings([finding({ section: '## features' })], ctx());
    expect(rejected).toEqual([]);
    expect(valid[0]).toMatchObject({ file: 'README.md', section: 'Features', category: 'readme' });
    expect(valid[0].fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  it('resolves a heading written with code formatting', () => {
    const { valid } = audit.validateFindings([finding({ section: 'Usage guide' })], ctx());
    expect(valid[0].section).toBe('Usage guide');
  });

  it.each([
    ['unknown category', { category: 'code' }],
    ['unknown severity', { severity: 'HIGH' }],
    ['no file', { file: '' }],
    ['file that does not exist', { file: 'docs/ghost.md' }],
    ['path traversal', { file: '../../etc/passwd' }],
    ['absolute path', { file: '/etc/passwd' }],
    ['no section', { section: '' }],
    ['heading that is not in the file', { section: 'Invented heading' }],
    ['line beyond the end of the file', { section: 'line 999' }],
    ['no description', { description: '   ' }],
  ])('rejects %s', (_name, patch) => {
    const { valid, rejected } = audit.validateFindings([finding(patch)], ctx());
    expect(valid).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeTruthy();
  });

  it('accepts severity spelled as blocker or suggestion', () => {
    const { valid } = audit.validateFindings([finding({ severity: 'blocker' }), finding({ severity: 'Suggestion', section: 'line 1' })], ctx());
    expect(valid.map(v => v.severity)).toEqual(['DOCS-BLOCKER', 'DOCS-SUGGESTION']);
  });

  it('accepts a line reference within the file', () => {
    expect(audit.validateFindings([finding({ section: 'line 3' })], ctx()).valid).toHaveLength(1);
  });

  it('requires a missing-documentation finding to name an existing feature and where the doc is expected (FR-010)', () => {
    const base = finding({
      category: 'architecture', severity: 'DOCS-BLOCKER', file: 'specs/020-second/spec.md', section: 'Overview',
      feature: '#020', expectedPath: 'docs/architecture/adr-020-second.md', description: 'Adds a dependency, no ADR.',
    });
    const ok = audit.validateFindings([base], ctx());
    expect(ok.rejected).toEqual([]);
    expect(ok.valid[0].rule).toBe('missing:#020');

    expect(audit.validateFindings([{ ...base, feature: '#999' }], ctx()).valid).toEqual([]);
    expect(audit.validateFindings([{ ...base, expectedPath: 'docs/other.md' }], ctx()).valid).toEqual([]);
    expect(audit.validateFindings([{ ...base, expectedPath: undefined }], ctx()).valid).toEqual([]);
    expect(audit.validateFindings([{ ...base, category: 'readme' }], ctx()).valid).toEqual([]);
  });

  it('redacts secret-shaped text and strips protocol markers and mentions from descriptions', () => {
    const d = [
      'Token ghp_abcdefghijklmnopqrstuvwxyz0123456789 and AKIAABCDEFGHIJKLMNOP leaked,',
      'password=hunter2 and Bearer abc.def.ghi, ping @someone.',
      '<!-- apm:run_id=1 step=qa iteration=1 runtime=x outcome=success -->',
      '```apm-msg\n{"outcome":"success"}\n```',
    ].join(' ');
    const { valid } = audit.validateFindings([finding({ description: d })], ctx());
    const out = valid[0].description;
    expect(out).not.toMatch(/ghp_|AKIA|hunter2|abc\.def\.ghi|apm:run_id|apm-msg/);
    expect(out).toContain('[REDACTED]');
    expect(out).not.toMatch(/@someone/);
    expect(out).not.toContain('\n');
  });

  describe('judge text cannot plant remote content or links in the tracking issue', () => {
    const clean = d => audit.validateFindings([finding({ description: d })], ctx()).valid[0].description;

    it('removes images entirely, so no tracking pixel is fetched when the issue renders', () => {
      const out = clean('Stale. ![pixel](https://evil.example/p.gif?u=1) done.');
      expect(out).not.toMatch(/!\[|evil\.example|\]\(/);
      expect(out).toContain('Stale.');
    });

    it('turns a markdown link into its visible text plus an inert, non-clickable host', () => {
      const out = clean('See [the migration guide](https://phish.example/login) for details.');
      expect(out).toContain('the migration guide');
      expect(out).not.toMatch(/\]\(|https?:\/\//);
    });

    it('does not leave a bare http(s) URL that GitHub would auto-link', () => {
      const out = clean('Visit https://phish.example/login now, or http://x.example.');
      expect(out).not.toMatch(/https?:\/\//);
      expect(out).toContain('phish.example');
    });

    it('strips raw HTML tags and their attributes, keeping surrounding words', () => {
      const out = clean('Outdated <img src="https://evil.example/x.png" onerror="alert(1)"> and <a href="https://phish.example">click</a> <script>x()</script>.');
      expect(out).not.toMatch(/<|>|onerror|href=|src=/);
      expect(out).toContain('Outdated');
      expect(out).toContain('click');
    });

    it('also neutralises reference-style links and autolinks', () => {
      const out = clean('Read [guide][1] or <https://phish.example/a>.\n\n[1]: https://phish.example/b');
      expect(out).not.toMatch(/https?:\/\/|\]:/);
    });

    it('keeps inline code that names a path or a command', () => {
      expect(clean('Run `npm test` and see `docs/guide.md`.')).toContain('`npm test`');
    });

    it('leaves a URL inside a code span alone, because GitHub does not link code', () => {
      expect(clean('External link `https://example.com/a` was unreachable.')).toContain('`https://example.com/a`');
    });

    it('an unbalanced backtick cannot be used to hide a link from the filter', () => {
      const out = clean('Odd ` then [click](https://phish.example/x) here.');
      expect(out).not.toMatch(/\]\(|https?:\/\//);
      expect(out).not.toContain('`');
    });

    it('an escaped backtick does not open a code span that would hide a link', () => {
      const out = clean('Start \\`[click](https://phish.example/x)\\` end.');
      expect(out).not.toMatch(/\]\(|https?:\/\//);
    });

    it('the external-link finding names the URL in a code span so it stays readable but is not clickable', async () => {
      const [f] = await audit.checkExternalLinks(
        [{ url: 'https://example.com/x', file: 'README.md', section: 'R', line: 2 }],
        { fetchImpl: async () => ({ status: 404 }), sleep: async () => {}, ignorePatterns: [], retries: 3 },
      );
      expect(f.description).toContain('`https://example.com/x`');
    });
  });

  it('caps the description length', () => {
    const { valid } = audit.validateFindings([finding({ description: 'x'.repeat(5000) })], ctx());
    expect(valid[0].description.length).toBeLessThanOrEqual(500);
  });

  it('drops non-objects and collapses identical findings', () => {
    const { valid, rejected } = audit.validateFindings([finding(), finding(), 'text', null, 42], ctx());
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(3);
  });

  it('merges different findings that share category, file and section so none is lost', () => {
    const { valid } = audit.validateFindings([
      finding({ description: 'First problem.' }), finding({ description: 'Second problem.' }),
    ], ctx());
    expect(valid).toHaveLength(1);
    expect(valid[0].description).toContain('First problem.');
    expect(valid[0].description).toContain('Second problem.');
  });
});

// ---------------------------------------------------------------------------------------------
describe('T007 fingerprint', () => {
  const a = { category: 'readme', file: 'README.md', section: 'Features', rule: 'stale-feature-list' };

  it('is stable and 12 hex characters', () => {
    expect(audit.fingerprint(a)).toBe(audit.fingerprint({ ...a }));
    expect(audit.fingerprint(a)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('ignores description rewording and heading case', () => {
    expect(audit.fingerprint({ ...a, description: 'one', section: 'FEATURES' })).toBe(audit.fingerprint({ ...a, description: 'two' }));
  });

  it('changes with category, file, section or rule', () => {
    const base = audit.fingerprint(a);
    for (const p of [{ category: 'changelog' }, { file: 'docs/x.md' }, { section: 'Usage' }, { rule: 'other' }]) {
      expect(audit.fingerprint({ ...a, ...p })).not.toBe(base);
    }
  });

  it('a model finding is identified by category, file and section only, so rewording never makes it new (spec assumption)', () => {
    makeRepo({ 'README.md': '# P\n\n## Features\n' });
    const run = description => audit.validateFindings([finding({ description })], { root: dir, candidates: [] }).valid[0].fingerprint;
    expect(run('README lists a removed feature.')).toBe(run('A completely different sentence about the same section.'));
  });
});

// ---------------------------------------------------------------------------------------------
describe('T008 renderReport', () => {
  const mk = (n, o = {}) => Array.from({ length: n }, (_, i) => ({
    ...finding({ section: `S${i}`, description: `Finding number ${i} ${'x'.repeat(200)}` }),
    rule: `r${i}`, fingerprint: String(i).padStart(12, '0'), ...o,
  }));

  it('groups by category, blockers first, with a fingerprint marker and traceability on every line', () => {
    const fs_ = [
      { ...finding({ category: 'changelog', file: 'CHANGELOG.md', section: 'Unreleased' }), rule: 'a', fingerprint: 'aaaaaaaaaaaa' },
      { ...finding({ severity: 'DOCS-BLOCKER' }), rule: 'b', fingerprint: 'bbbbbbbbbbbb' },
      { ...finding({ section: 'Z' }), rule: 'c', fingerprint: 'cccccccccccc' },
    ];
    const { bodies } = audit.renderReport(fs_, { runUrl: 'https://x/run/1', date: '2026-10-06' });
    expect(bodies).toHaveLength(1);
    const b = bodies[0];
    expect(b.indexOf('### README')).toBeLessThan(b.indexOf('### CHANGELOG'));
    expect(b.indexOf('DOCS-BLOCKER')).toBeLessThan(b.indexOf('DOCS-SUGGESTION'));
    expect(b).toContain('<!-- docs-audit:fp=bbbbbbbbbbbb -->');
    expect(b).toContain('`README.md`');
    expect(b).toContain('https://x/run/1');
  });

  it('names the feature and expected location for missing documentation (FR-010)', () => {
    const f = { ...finding({ category: 'architecture', file: 'specs/020-s/spec.md', section: 'Overview', feature: '#020', expectedPath: 'docs/architecture/adr-020-s.md' }), rule: 'missing:#020', fingerprint: 'dddddddddddd' };
    const { bodies } = audit.renderReport([f], { runUrl: 'u', date: 'd' });
    expect(bodies[0]).toContain('#020');
    expect(bodies[0]).toContain('docs/architecture/adr-020-s.md');
  });

  it('splits a very large report across comments, says so, and drops nothing (US-2)', () => {
    const fs_ = mk(400);
    const { bodies } = audit.renderReport(fs_, { runUrl: 'u', date: 'd', maxChars: 10000 });
    expect(bodies.length).toBeGreaterThan(1);
    bodies.forEach((b, i) => {
      expect(b.length).toBeLessThanOrEqual(10000);
      expect(b).toContain(`Part ${i + 1} of ${bodies.length}`);
    });
    const joined = bodies.join('\n');
    for (const f of fs_) expect(joined).toContain(`docs-audit:fp=${f.fingerprint}`);
  });

  it('puts the tracking marker only in the first body when asked', () => {
    const { bodies } = audit.renderReport(mk(300), { runUrl: 'u', date: 'd', maxChars: 8000, tracking: true });
    expect(bodies[0]).toContain('<!-- docs-audit:tracking -->');
    expect(bodies.slice(1).some(b => b.includes('docs-audit:tracking'))).toBe(false);
  });

  it('lists findings that are no longer detected with a resolved marker', () => {
    const { bodies } = audit.renderReport(mk(1), { runUrl: 'u', date: 'd', resolved: [{ fingerprint: 'eeeeeeeeeeee', label: '`docs/a.md` › Setup: old thing' }] });
    expect(bodies[0]).toContain('No longer detected');
    expect(bodies[0]).toContain('docs/a.md');
    expect(bodies[0]).toContain('<!-- docs-audit:resolved=eeeeeeeeeeee -->');
  });
});

// ---------------------------------------------------------------------------------------------
describe('T009 findTrackingIssue and known findings', () => {
  const issue = (number, o = {}) => ({ number, body: '<!-- docs-audit:tracking -->\nbody', state: 'open', ...o });
  const gh = (issues, comments = []) => ({
    paginate: vi.fn(async fn => (fn.__kind === 'issues' ? issues : comments)),
    rest: {
      issues: {
        listForRepo: Object.assign(vi.fn(), { __kind: 'issues' }),
        listComments: Object.assign(vi.fn(), { __kind: 'comments' }),
      },
    },
  });

  it('adopts the oldest open issue that has the label and the marker', async () => {
    const r = await audit.findTrackingIssue(gh([issue(9), issue(5), issue(7)]), 'o', 'r');
    expect(r.number).toBe(5);
  });

  it('ignores pull requests and labelled issues without the marker', async () => {
    const r = await audit.findTrackingIssue(gh([issue(3, { pull_request: {} }), issue(4, { body: 'someone else' })]), 'o', 'r');
    expect(r).toBeNull();
  });

  it('asks only for open issues with the docs-drift label', async () => {
    const g = gh([]);
    await audit.findTrackingIssue(g, 'o', 'r');
    expect(g.paginate.mock.calls[0][1]).toMatchObject({ owner: 'o', repo: 'r', labels: 'docs-drift', state: 'open' });
  });

  it('replays fingerprints in order: reported, resolved, reported again', () => {
    const body = 'x <!-- docs-audit:fp=aaaaaaaaaaaa --> y\n- `a.md` › S: one <!-- docs-audit:fp=bbbbbbbbbbbb -->';
    const bot = { type: 'Bot', login: 'github-actions[bot]' };
    const comments = [
      { user: bot, body: '<!-- docs-audit:resolved=aaaaaaaaaaaa -->' },
      { user: bot, body: '<!-- docs-audit:fp=aaaaaaaaaaaa -->' },
      { user: bot, body: '<!-- docs-audit:resolved=bbbbbbbbbbbb -->' },
    ];
    const known = audit.knownFindings(body, comments);
    expect([...known.keys()].sort()).toEqual(['aaaaaaaaaaaa']);
  });

  it('keeps a label per fingerprint for the resolved list', () => {
    const known = audit.knownFindings('- `a.md` › S: one <!-- docs-audit:fp=bbbbbbbbbbbb -->', []);
    expect(known.get('bbbbbbbbbbbb')).toBe('`a.md` › S: one');
  });

  it('ignores fingerprints in comments by people (a pasted marker cannot suppress a finding)', () => {
    const known = audit.knownFindings('', [{ user: { type: 'User', login: 'mallory' }, body: '<!-- docs-audit:fp=cccccccccccc -->' }]);
    expect(known.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('T010/T011 publish', () => {
  const bot = { type: 'Bot', login: 'github-actions[bot]' };
  const fp = (n, o = {}) => ({
    ...finding({ section: `S${n}`, description: `drift ${n}` }), rule: `r${n}`,
    fingerprint: String(n).padStart(12, '0'), ...o,
  });

  const makeGh = ({ issues = [], comments = [] } = {}) => {
    const calls = { create: [], comment: [], edit: [], close: [], labels: [] };
    return {
      calls,
      paginate: vi.fn(async fn => (fn.__kind === 'issues' ? issues : comments)),
      rest: {
        issues: {
          listForRepo: Object.assign(vi.fn(), { __kind: 'issues' }),
          listComments: Object.assign(vi.fn(), { __kind: 'comments' }),
          create: vi.fn(async a => { calls.create.push(a); return { data: { number: 77, html_url: 'https://x/77', labels: (a.labels || []).map(name => ({ name })) } }; }),
          createComment: vi.fn(async a => { calls.comment.push(a); return {}; }),
          update: vi.fn(async a => { calls.edit.push(a); return {}; }),
          addLabels: vi.fn(async a => { calls.labels.push(a); return {}; }),
        },
      },
    };
  };
  const run = (gh, findings, extra = {}) => audit.publish({
    github: gh, owner: 'o', repo: 'r', findings, scanned: 12, runUrl: 'https://x/run/1',
    log: { info: vi.fn(), warn: vi.fn() }, summary: vi.fn(), now: new Date('2026-10-06T06:00:00Z'), ...extra,
  });
  const trackingIssue = (o = {}) => ({ number: 40, state: 'open', body: '<!-- docs-audit:tracking -->\n- x <!-- docs-audit:fp=000000000001 -->', ...o });
  const noPosts = gh => {
    expect(gh.calls.create).toEqual([]);
    expect(gh.calls.comment).toEqual([]);
    expect(gh.calls.edit).toEqual([]);
    expect(gh.calls.close).toEqual([]);
    expect(gh.calls.labels).toEqual([]);
  };

  it('US-3: no findings posts nothing anywhere, even with an open tracking issue, and logs the clean run (FR-013, FR-014)', async () => {
    const gh = makeGh({ issues: [trackingIssue()] });
    const log = { info: vi.fn(), warn: vi.fn() };
    const summary = vi.fn();
    const r = await run(gh, [], { log, summary });
    expect(r).toMatchObject({ action: 'none', reason: 'clean' });
    noPosts(gh);
    expect(log.info.mock.calls.flat().join(' ')).toMatch(/clean.*12 documentation files.*0 findings/i);
    expect(summary.mock.calls.flat().join(' ')).toMatch(/clean/i);
  });

  it('US-3: three consecutive clean audits create zero issues and zero comments', async () => {
    const gh = makeGh();
    for (let i = 0; i < 3; i++) await run(gh, []);
    noPosts(gh);
  });

  it('US-2: creates one tracking issue with the label and marker when none exists', async () => {
    const gh = makeGh();
    const r = await run(gh, [fp(1), fp(2)]);
    expect(r).toMatchObject({ action: 'created', issue: 77 });
    expect(gh.calls.create).toHaveLength(1);
    const c = gh.calls.create[0];
    expect(c.labels).toContain('docs-drift');
    expect(c.title).toMatch(/2026-10-06/);
    expect(c.body).toContain('<!-- docs-audit:tracking -->');
    expect(c.body).toContain('docs-audit:fp=000000000001');
    expect(c.body).toContain('docs-audit:fp=000000000002');
  });

  it('adds the label afterwards if GitHub silently dropped it, so the issue can be found next time (FR-011)', async () => {
    const gh = makeGh();
    gh.rest.issues.create = vi.fn(async a => { gh.calls.create.push(a); return { data: { number: 77, html_url: 'u', labels: [] } }; });
    await run(gh, [fp(1)]);
    expect(gh.calls.labels[0]).toMatchObject({ issue_number: 77, labels: ['docs-drift'] });
  });

  it('US-2: comments on the existing tracking issue instead of creating a second one', async () => {
    const gh = makeGh({ issues: [trackingIssue()] });
    const r = await run(gh, [fp(1), fp(2)]);
    expect(r).toMatchObject({ action: 'commented', issue: 40 });
    expect(gh.calls.create).toEqual([]);
    const reports = gh.calls.comment.filter(c => !c.body.includes('agent-footprint'));
    expect(reports).toHaveLength(1);
    expect(reports[0].issue_number).toBe(40);
    expect(gh.calls.comment.every(c => c.issue_number === 40)).toBe(true);
  });

  it('US-4: an unchanged repository adds nothing on the second run', async () => {
    const first = makeGh();
    await run(first, [fp(1), fp(2)]);
    const body = first.calls.create[0].body;
    const second = makeGh({ issues: [{ number: 77, state: 'open', body }] });
    const r = await run(second, [fp(1), fp(2)]);
    expect(r).toMatchObject({ action: 'none', reason: 'already-reported' });
    noPosts(second);
  });

  it('US-4: reports only the new findings, and lists the ones no longer detected', async () => {
    const gh = makeGh({
      issues: [trackingIssue({ body: '<!-- docs-audit:tracking -->\n- `README.md` › S1: drift 1 <!-- docs-audit:fp=000000000001 -->\n- `README.md` › S9: gone <!-- docs-audit:fp=000000000009 -->' })],
    });
    await run(gh, [fp(1), fp(2)]);
    const body = gh.calls.comment[0].body;
    expect(body).toContain('docs-audit:fp=000000000002');
    expect(body).not.toContain('docs-audit:fp=000000000001');
    expect(body).toContain('No longer detected');
    expect(body).toContain('docs-audit:resolved=000000000009');
  });

  it('US-4: a resolved finding is not announced again, and one that comes back is reported again', async () => {
    const resolvedComment = { user: bot, body: '<!-- docs-audit:resolved=000000000001 -->' };
    const gh = makeGh({ issues: [trackingIssue()], comments: [resolvedComment] });
    const r = await run(gh, [fp(1)]);
    expect(r.action).toBe('commented');
    expect(gh.calls.comment[0].body).toContain('docs-audit:fp=000000000001');
    expect(gh.calls.comment[0].body).not.toContain('No longer detected');
  });

  it('US-4: only fixed findings and nothing new posts nothing (a status ping would break US-3)', async () => {
    const gh = makeGh({ issues: [trackingIssue()] });
    const r = await run(gh, [fp(1)], {});
    expect(r.action).toBe('none');
    const gh2 = makeGh({ issues: [trackingIssue({ body: '<!-- docs-audit:tracking -->\n- a <!-- docs-audit:fp=000000000005 -->' })] });
    expect((await run(gh2, [])).reason).toBe('clean');
    noPosts(gh2);
  });

  it('US-4: after a maintainer closes the issue and drift remains, a new issue is created', async () => {
    const gh = makeGh({ issues: [] });
    const r = await run(gh, [fp(1)]);
    expect(r.action).toBe('created');
    expect(gh.calls.create).toHaveLength(1);
  });

  it('never edits or closes an existing tracking issue (FR-013, out of scope)', async () => {
    const gh = makeGh({ issues: [trackingIssue()] });
    await run(gh, [fp(2)]);
    await run(makeGh({ issues: [trackingIssue()] }), []);
    expect(gh.calls.edit).toEqual([]);
    expect(gh.calls.close).toEqual([]);
  });

  it('#335: the complete footprint carries the judge usage when the run recorded some, and omits it otherwise', async () => {
    const usage = { runtime: 'azure-foundry-standard', model: 'gpt-5.2-codex', prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, estimated_cost_usd: null };
    const withUsage = makeGh();
    await run(withUsage, [fp(1)], { usage });
    const done = withUsage.calls.comment.map(c => c.body).find(b => b.includes('agent-footprint: complete'));
    expect(done).toContain('"usage"');
    expect(done).toContain('"total_tokens": 120');

    const without = makeGh();
    await run(without, [fp(1)]);
    const done2 = without.calls.comment.map(c => c.body).find(b => b.includes('agent-footprint: complete'));
    expect(done2).not.toContain('"usage"');
  });

  it('#335: a malformed usage value is ignored rather than breaking the report', async () => {
    const gh = makeGh();
    const r = await run(gh, [fp(1)], { usage: { total_tokens: 'lots' } });
    expect(r.action).toBe('created');
    expect(gh.calls.comment.map(c => c.body).join('\n')).not.toContain('"usage"');
  });

  it('#335: publishFromFiles passes usage through to the footprint', async () => {
    makeRepo({ 'README.md': '# Proj\n\n## Features\n\nText.\n' });
    const out = path.join(dir, '..', path.basename(dir) + '-usage-out');
    await audit.collect({ root: dir, out, getIssueState: async () => null, fetchImpl: async () => ({ status: 200 }), sleep: async () => {}, log: { info() {}, warn() {} } });
    const judge = path.join(out, 'judge.json');
    fs.writeFileSync(judge, JSON.stringify([finding()]));
    const gh = makeGh();
    const usage = { runtime: 'r', model: 'm', prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, estimated_cost_usd: null };
    await audit.publishFromFiles({ github: gh, owner: 'o', repo: 'r', dir: out, judgeFile: judge, root: dir, runUrl: 'u', log: { info() {}, warn() {} }, summary: async () => {}, usage });
    fs.rmSync(out, { recursive: true, force: true });
    expect(gh.calls.comment.map(c => c.body).join('\n')).toContain('"total_tokens": 3');
  });

  it('US-2: posts a very large first report as an issue plus continuation comments, saying so', async () => {
    const gh = makeGh();
    const many = Array.from({ length: 500 }, (_, i) => fp(i + 1, { description: 'x'.repeat(300) }));
    await run(gh, many, { maxChars: 12000 });
    expect(gh.calls.create).toHaveLength(1);
    expect(gh.calls.comment.length).toBeGreaterThan(0);
    expect(gh.calls.create[0].body).toMatch(/Part 1 of \d+/);
    const all = [gh.calls.create[0].body, ...gh.calls.comment.map(c => c.body)].join('\n');
    for (const f of many) expect(all).toContain(`docs-audit:fp=${f.fingerprint}`);
  });

  it('FR-021: leaves a footprint on the issue only when it posts a report, with no result marker', async () => {
    const gh = makeGh();
    await run(gh, [fp(1)]);
    const posted = gh.calls.comment.map(c => c.body);
    const start = posted.find(b => b.includes('agent-footprint: start'));
    const done = posted.find(b => b.includes('agent-footprint: complete'));
    expect(start).toBeTruthy();
    expect(done).toBeTruthy();
    expect(done).toContain('docs-agent');
    expect(posted.join('\n')).not.toContain('apm:run_id');

    const quiet = makeGh({ issues: [trackingIssue()] });
    await run(quiet, []);
    noPosts(quiet);
  });

  it('a failing GitHub call fails the run (no silent success)', async () => {
    const gh = makeGh();
    gh.rest.issues.create = vi.fn().mockRejectedValue(new Error('HTTP 403'));
    await expect(run(gh, [fp(1)])).rejects.toThrow(/403/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('T012/T013 failure visibility and the run record', () => {
  it('runAudit writes a FAILED summary, never the clean message, and rethrows', async () => {
    const summary = vi.fn();
    const log = { info: vi.fn(), warn: vi.fn() };
    await expect(audit.runAudit({
      steps: async () => { throw new Error('boom'); }, summary, log,
    })).rejects.toThrow('boom');
    const text = summary.mock.calls.flat().join('\n');
    expect(text).toMatch(/AUDIT FAILED/);
    expect(text).toMatch(/not a clean result/i);
    expect(text).not.toMatch(/\bclean\b(?! result)/i);
  });

  it('runAudit passes the result through when the audit works', async () => {
    const r = await audit.runAudit({ steps: async () => ({ action: 'none', reason: 'clean' }), summary: vi.fn(), log: { info: vi.fn(), warn: vi.fn() } });
    expect(r.reason).toBe('clean');
  });

  it('the clean record states what was covered, so it can be verified without being announced', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const gh = { paginate: vi.fn(async () => []), rest: { issues: { listForRepo: Object.assign(vi.fn(), { __kind: 'issues' }), listComments: vi.fn() } } };
    await audit.publish({ github: gh, owner: 'o', repo: 'r', findings: [], scanned: 91, runUrl: 'u', log, summary: vi.fn(), now: new Date() });
    expect(log.info.mock.calls.flat().join(' ')).toContain('91 documentation files');
  });
});

// ---------------------------------------------------------------------------------------------
describe('T014 parseJudgeOutput', () => {
  it('reads a bare JSON array', () => {
    expect(audit.parseJudgeOutput('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('reads the array out of prose and a json fence', () => {
    expect(audit.parseJudgeOutput('Here you go:\n```json\n[{"a":1},{"b":2}]\n```\nThanks')).toHaveLength(2);
  });

  it('treats an empty array as a valid "no drift" answer', () => {
    expect(audit.parseJudgeOutput('[]')).toEqual([]);
  });

  it.each(['', 'no drift found', '{"a":1}', '[1,2', 'OUTCOME: success'])('throws on %j rather than treating it as clean', text => {
    expect(() => audit.parseJudgeOutput(text)).toThrow();
  });
});

describe('FR-016 a check that could not run must not look like "no drift"', () => {
  const quiet = { info: vi.fn(), warn: vi.fn() };

  it('collect throws when an ADR candidate lookup failed, and says which specs were not checked', async () => {
    makeRepo({ 'README.md': '# R\n', 'specs/040-x/spec.md': '# X\n' });
    await expect(audit.collect({
      root: dir, getIssueState: async () => null, fetchImpl: async () => ({ status: 200 }), sleep: async () => {}, log: quiet,
    })).rejects.toThrow(/040/);
  });

  it('collect writes no output files when it fails, so a later step cannot publish a clean record', async () => {
    makeRepo({ 'README.md': '# R\n', 'specs/040-x/spec.md': '# X\n' });
    const out = path.join(dir, '..', path.basename(dir) + '-failed-out');
    await expect(audit.collect({
      root: dir, out, getIssueState: async () => null, fetchImpl: async () => ({ status: 200 }), sleep: async () => {}, log: quiet,
    })).rejects.toThrow();
    const wrote = fs.existsSync(out);
    fs.rmSync(out, { recursive: true, force: true });
    expect(wrote).toBe(false);
  });

  it('the CLI fails with no GITHUB_TOKEN when specs need a lookup, and never reports clean', async () => {
    makeRepo({ 'README.md': '# R\n', 'specs/040-x/spec.md': '# X\n' });
    const out = path.join(dir, '..', path.basename(dir) + '-cli-out');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(audit.main(['collect', '--root', dir, '--out', out], {})).rejects.toThrow(/could not be checked/i);
    const printed = logSpy.mock.calls.flat().join('\n');
    logSpy.mockRestore();
    fs.rmSync(out, { recursive: true, force: true });
    expect(printed).not.toMatch(/clean/i);
  });

  it('a repository where every spec has an ADR needs no lookup and still collects', async () => {
    makeRepo({ 'README.md': '# R\n', 'specs/010-a/spec.md': '# A\n', 'docs/architecture/adr-010-a.md': '# ADR\n' });
    const r = await audit.collect({
      root: dir, getIssueState: async () => null, fetchImpl: async () => ({ status: 200 }), sleep: async () => {}, log: quiet,
    });
    expect(r.facts.unchecked).toEqual([]);
  });
});

describe('end to end: collect then validate on a small repository', () => {
  it('finds drift in an untouched file, stays consistent across two runs, and writes nothing into the work tree', async () => {
    makeRepo({
      'README.md': '# Proj\n\n## Features\n\nSee [guide](docs/guide.md).\n',
      'docs/guide.md': '# Guide\n\n## Install\n\nSee [old](./removed.md).\n',
    });
    const before = audit.collectDocSet(dir).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
    const out = path.join(dir, '..', path.basename(dir) + '-out');
    const run1 = await audit.collect({ root: dir, out, getIssueState: async () => null, fetchImpl: async () => ({ status: 200 }), sleep: async () => {} });
    const run2 = await audit.collect({ root: dir, out, getIssueState: async () => null, fetchImpl: async () => ({ status: 200 }), sleep: async () => {} });
    fs.rmSync(out, { recursive: true, force: true });

    expect(run1.findings).toHaveLength(1);
    expect(run1.findings[0]).toMatchObject({ file: 'docs/guide.md', section: 'Install' });
    expect(run2.findings.map(f => f.fingerprint)).toEqual(run1.findings.map(f => f.fingerprint));
    expect(run1.scanned).toBe(2);
    const after = audit.collectDocSet(dir).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
    expect(after).toEqual(before);
  });
});
