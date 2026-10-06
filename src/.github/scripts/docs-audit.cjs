#!/usr/bin/env node
'use strict';
/**
 * docs-audit.cjs: periodic full-set documentation audit (Issue #331).
 *
 * Shared by the Claude and Copilot workflows (FR-020). Code decides everything that must not depend on
 * model behaviour: the documentation set, link checks, version facts, finding validation, fingerprints,
 * de-duplication, the tracking issue, quiet-when-clean and failure visibility. The model only judges
 * README/CHANGELOG currency and ADR need, and it never publishes: it writes a findings file that
 * `publishFromFiles` validates before anything reaches GitHub.
 *
 * Read-only with respect to the repository (FR-017). Writes only GitHub Issues / comments.
 *
 * CLI:  node docs-audit.cjs collect --out <dir>
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const report = require('./agent-report.cjs');

const CATEGORIES = ['readme', 'cross-reference', 'changelog', 'architecture'];
const CATEGORY_TITLES = {
  readme: 'README', 'cross-reference': 'Cross-references', changelog: 'CHANGELOG', architecture: 'Architecture',
};
const SEVERITIES = ['DOCS-BLOCKER', 'DOCS-SUGGESTION'];
const LABEL = 'docs-drift';
const TRACKING_MARKER = '<!-- docs-audit:tracking -->';
const DESCRIPTION_MAX = 500;
const MERGED_DESCRIPTION_MAX = 1500;
const COMMENT_MAX = 60000; // GitHub rejects bodies over 65536 characters
const SKIP_DIRS = new Set(['node_modules', '.git']);

// ---------------------------------------------------------------------------------------------
// Documentation set (FR-003)
// ---------------------------------------------------------------------------------------------
function walkMarkdown(root, rel, out) {
  let entries;
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walkMarkdown(root, r, out);
    else if (e.isFile() && /\.md$/i.test(e.name)) out.push(r);
  }
}

/** Root-level documents, docs/ (which holds the ADRs) and specs/. Sorted, posix-style, repo-relative. */
function collectDocSet(root) {
  const out = [];
  let top = [];
  try { top = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of top) if (e.isFile() && /\.md$/i.test(e.name)) out.push(e.name);
  walkMarkdown(root, 'docs', out);
  walkMarkdown(root, 'specs', out);
  return out.sort();
}

// ---------------------------------------------------------------------------------------------
// Markdown scanning
// ---------------------------------------------------------------------------------------------
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** Heading text as a reader sees it: no code ticks, emphasis, link syntax or inline html. */
function headingPlain(raw) {
  return String(raw)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+/g, '')
    .replace(/\*+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const normHeading = s => headingPlain(String(s).replace(/^#+\s*/, '')).toLowerCase();

/** GitHub anchor slug: lower-case, punctuation dropped, each space becomes a hyphen. */
function slugOf(plain) {
  return plain.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');
}

/**
 * Walk a document once. Returns the headings (outside code fences) and, per line, whether it is code
 * and the nearest heading above it.
 */
function parseDoc(text) {
  const lines = String(text).split(/\r?\n/);
  const headings = [];
  const isCode = new Array(lines.length).fill(false);
  const nearest = new Array(lines.length).fill('');
  let fence = null;
  let current = '';
  lines.forEach((line, i) => {
    const f = FENCE_RE.exec(line);
    if (fence) {
      isCode[i] = true;
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len && !line.trim().slice(f[1].length).trim()) fence = null;
    } else if (f) {
      isCode[i] = true;
      fence = { ch: f[1][0], len: f[1].length };
    } else {
      const h = HEADING_RE.exec(line);
      if (h) {
        current = headingPlain(h[2]);
        headings.push({ text: current, line: i + 1, level: h[1].length });
      }
    }
    nearest[i] = current;
  });
  return { lines, headings, isCode, nearest };
}

function slugsOf(doc) {
  const seen = new Map();
  const slugs = new Set();
  for (const h of doc.headings) {
    const base = slugOf(h.text);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    slugs.add(n === 0 ? base : `${base}-${n}`);
  }
  return slugs;
}

const readText = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; } };

function compileIgnore(patterns) {
  return (patterns || []).map(p => {
    try { return new RegExp(typeof p === 'string' ? p : p.pattern); } catch { return null; }
  }).filter(Boolean);
}
const isIgnored = (res, target) => res.some(re => re.test(target));

// ---------------------------------------------------------------------------------------------
// Relative links and anchors (FR-019, deterministic)
// ---------------------------------------------------------------------------------------------
const INLINE_LINK_RE = /!?\[(?:[^[\]]|\[[^\]]*\])*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const REF_DEF_RE = /^ {0,3}\[[^\]]+\]:[ \t]*<?(\S+?)>?(?:[ \t]+.*)?$/;

function extractLinks(doc) {
  const found = [];
  doc.lines.forEach((raw, i) => {
    if (doc.isCode[i]) return;
    const line = raw.replace(/(`+)[^`]*?\1/g, ' ');
    let m;
    INLINE_LINK_RE.lastIndex = 0;
    while ((m = INLINE_LINK_RE.exec(line)) !== null) found.push({ target: m[1], line: i + 1, section: doc.nearest[i] });
    const d = REF_DEF_RE.exec(line);
    if (d) found.push({ target: d[1], line: i + 1, section: doc.nearest[i] });
  });
  return found;
}

const sectionOrLine = (section, line) => section || `line ${line}`;

function checkLinks({ root, files, ignorePatterns }) {
  const ignore = compileIgnore(ignorePatterns);
  const findings = [];
  const external = [];
  const seen = new Set();
  const docCache = new Map();
  const docOf = rel => {
    if (!docCache.has(rel)) { const t = readText(root, rel); docCache.set(rel, t === null ? null : parseDoc(t)); }
    return docCache.get(rel);
  };
  const rootReal = (() => { try { return fs.realpathSync(root); } catch { return root; } })();

  for (const file of files) {
    const doc = docOf(file);
    if (!doc) continue;
    for (const l of extractLinks(doc)) {
      const target = l.target;
      if (isIgnored(ignore, target)) continue;
      if (/^https?:\/\//i.test(target)) { external.push({ url: target, file, section: l.section, line: l.line }); continue; }
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // mailto:, tel:, ftp: ...
      const hashAt = target.indexOf('#');
      let pathPart = hashAt === -1 ? target : target.slice(0, hashAt);
      const anchorRaw = hashAt === -1 ? '' : target.slice(hashAt + 1);
      pathPart = pathPart.split('?')[0];
      try { pathPart = decodeURIComponent(pathPart); } catch { /* keep as written */ }

      const targetRel = !pathPart
        ? file
        : pathPart.startsWith('/')
          ? path.posix.normalize(pathPart.slice(1))
          : path.posix.normalize(path.posix.join(path.posix.dirname(file), pathPart));
      const abs = path.join(root, targetRel);
      let problem = null;
      let real = null;
      try { real = fs.realpathSync(abs); } catch { real = null; }
      if (targetRel.startsWith('..') || real === null || !(real === rootReal || real.startsWith(rootReal + path.sep))) {
        problem = 'file not found';
      } else if (anchorRaw && fs.statSync(real).isFile() && /\.(md|markdown)$/i.test(real)) {
        const tdoc = docOf(targetRel);
        let anchor = anchorRaw;
        try { anchor = decodeURIComponent(anchorRaw); } catch { /* keep */ }
        if (tdoc && !slugsOf(tdoc).has(anchor.toLowerCase())) problem = `anchor not found in ${targetRel}`;
      }
      if (!problem) continue;
      const section = sectionOrLine(l.section, l.line);
      const rule = `link:${target}`;
      const key = `${file}|${section}|${rule}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        category: 'cross-reference', severity: 'DOCS-BLOCKER', file, section, rule,
        description: `Broken link \`${target}\` (line ${l.line}): ${problem}.`,
      });
    }
  }
  return { findings, external };
}

// ---------------------------------------------------------------------------------------------
// External links (FR-019): never report on one transient failure
// ---------------------------------------------------------------------------------------------
const DEFINITIVE_STATUS = new Set([404, 410]);
const DEFINITIVE_NET = new Set(['ENOTFOUND', 'EAI_AGAIN_PERMANENT']);

/** 'alive' | 'gone' | 'unknown'. Only 'gone' on every attempt is ever reported. */
async function probe(url, { fetchImpl, sleep, retries, aliveStatusCodes }) {
  let sawGone = 0;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { method: attempt === 1 ? 'HEAD' : 'GET', redirect: 'follow' });
      const s = Number(res && res.status);
      if ((s >= 200 && s < 400) || aliveStatusCodes.includes(s)) return 'alive';
      if (DEFINITIVE_STATUS.has(s)) sawGone++;
      else return 'unknown'; // 429, 5xx and anything else we cannot call dead
    } catch (err) {
      const code = err && ((err.cause && err.cause.code) || err.code);
      if (DEFINITIVE_NET.has(code)) sawGone++;
      else return 'unknown'; // timeouts, resets, TLS hiccups
    }
    if (attempt < retries) await sleep(attempt * 500);
  }
  return sawGone === retries ? 'gone' : 'unknown';
}

async function checkExternalLinks(links, o = {}) {
  const fetchImpl = o.fetchImpl || ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'quorumkit-docs-audit' } }));
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const retries = o.retries || 3;
  const aliveStatusCodes = o.aliveStatusCodes || [200, 206, 301, 302, 403];
  const ignore = compileIgnore(o.ignorePatterns);

  const byUrl = new Map();
  for (const l of links) {
    if (isIgnored(ignore, l.url)) continue;
    if (!byUrl.has(l.url)) byUrl.set(l.url, []);
    byUrl.get(l.url).push(l);
  }
  const urls = [...byUrl.keys()];
  const verdict = new Map();
  const queue = urls.slice();
  const worker = async () => {
    for (let u = queue.shift(); u !== undefined; u = queue.shift()) {
      verdict.set(u, await probe(u, { fetchImpl, sleep, retries, aliveStatusCodes }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, urls.length) }, worker));

  const findings = [];
  const seen = new Set();
  for (const u of urls) {
    if (verdict.get(u) !== 'gone') continue;
    for (const l of byUrl.get(u)) {
      const section = sectionOrLine(l.section, l.line);
      const key = `${l.file}|${section}|${u}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        category: 'cross-reference', severity: 'DOCS-SUGGESTION', file: l.file, section, rule: `link:${u}`,
        description: `External link \`${u}\` (line ${l.line}) was unreachable on ${retries} attempts.`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------
// Facts for the judge, and deterministic version findings
// ---------------------------------------------------------------------------------------------
const cmpVersion = (a, b) => {
  const pa = String(a).split(/[.+-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.+-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
};

function listDir(root, rel) { try { return fs.readdirSync(path.join(root, rel)); } catch { return []; } }

async function collectFacts(root, { getIssueState } = {}) {
  const facts = { versions: {}, changelogLatestLine: null, adrs: [], adrCandidates: [], skipped: [], unchecked: [], counts: {} };

  const yml = readText(root, 'quorumkit.yml');
  const ymlVersion = yml && /^version:\s*["']?([0-9][^\s"']*)/m.exec(yml);
  if (ymlVersion) facts.versions['quorumkit.yml'] = ymlVersion[1];
  const pkg = readText(root, 'engine/package.json');
  if (pkg) { try { const v = JSON.parse(pkg).version; if (v) facts.versions['engine/package.json'] = String(v); } catch { /* not json */ } }
  const cl = readText(root, 'CHANGELOG.md');
  if (cl) {
    const lines = cl.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = /^##\s+\[?v?(\d+\.\d+\.\d+[^\]\s]*)\]?/.exec(lines[i]);
      if (m) { facts.versions.changelogLatest = m[1]; facts.changelogLatestLine = i + 1; break; }
    }
  }

  for (const name of listDir(root, 'docs/architecture')) {
    const m = /^adr-(\d+)-.+\.md$/i.exec(name);
    if (m) facts.adrs.push({ nnn: m[1], file: `docs/architecture/${name}` });
  }
  const adrNumbers = new Set(facts.adrs.map(a => Number(a.nnn)));

  for (const name of listDir(root, 'specs').sort()) {
    const m = /^(\d+)-/.exec(name);
    const specFile = `specs/${name}/spec.md`;
    if (!m || !fs.existsSync(path.join(root, specFile))) continue;
    const num = Number(m[1]);
    if (adrNumbers.has(num)) continue; // matched by issue number, never by slug
    const state = getIssueState ? await getIssueState(num) : null;
    if (state === 'closed') {
      const text = readText(root, specFile) || '';
      const h = parseDoc(text).headings[0];
      facts.adrCandidates.push({ nnn: m[1], specFile, title: h ? h.text : name, excerpt: text.slice(0, 1500) });
    } else if (state === 'open') {
      facts.skipped.push({ nnn: m[1], reason: 'issue still open' });
    } else {
      // FR-016: no answer is not "no ADR needed". It means this check did not run.
      facts.unchecked.push({ nnn: m[1], reason: 'issue state lookup failed' });
    }
  }

  facts.counts = {
    agentDefinitions: listDir(root, 'src/agents').filter(n => /\.md$/.test(n)).length,
    workflows: listDir(root, '.github/workflows').filter(n => /\.ya?ml$/.test(n)).length,
    specs: listDir(root, 'specs').filter(n => /^\d+-/.test(n)).length,
    adrs: facts.adrs.length,
  };
  return facts;
}

function versionFindings(facts) {
  const v = facts.versions || {};
  const project = v['quorumkit.yml'];
  const latest = v.changelogLatest;
  if (!project || !latest || cmpVersion(latest, project) >= 0) return [];
  return [{
    category: 'changelog', severity: 'DOCS-SUGGESTION', file: 'CHANGELOG.md',
    section: `line ${facts.changelogLatestLine || 1}`, rule: 'version-lag',
    description: `CHANGELOG latest release is ${latest} but quorumkit.yml declares version ${project}.`,
  }];
}

// ---------------------------------------------------------------------------------------------
// Findings: sanitising, validation, fingerprints
// ---------------------------------------------------------------------------------------------
const SECRET_PATTERNS = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{12,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\b\s*[=:]\s*\S+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

/**
 * Make text inert when GitHub renders it. Judge text comes from a model that has read untrusted
 * documentation, so an image would be fetched when the issue is viewed (tracking pixel), and a link
 * or HTML would be clickable from a bot-authored issue (phishing). Code spans are rendered literally
 * by GitHub, so they are kept; everything outside them loses images, links, autolinks, bare URLs and
 * HTML. Stray backticks and brackets are removed too, since they are how a link would be hidden from
 * a filter or rebuilt from the pieces left behind.
 */
function neutraliseMarkup(text) {
  const spans = [];
  const NUL = '\u0000';
  let s = String(text).split(NUL).join('');
  // Only a well-formed, unescaped single-backtick pair with something inside is protected as code.
  s = s.replace(/(?<![\\`])`([^`\n]+)`(?!`)/g, (_, code) => { spans.push(code); return `${NUL}${spans.length - 1}${NUL}`; });

  s = s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')                       // inline image
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ')                      // reference image
    .replace(/^[ \t]*\[[^\]\n]+\]:[ \t]*\S.*$/gm, ' ')           // reference definition
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')                     // inline link keeps only its text
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')                    // reference link keeps only its text
    .replace(/<((?:https?|ftp|mailto):[^>\s]*)>/gi, '$1')        // autolink becomes a bare URL, handled next
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')                         // HTML tag with its attributes
    .replace(/<(?=[A-Za-z\/!?])/g, '')                           // an unclosed tag opener
    .replace(/\b(?:https?|ftp):\/\//gi, '')                      // no scheme, so GitHub does not auto-link it
    .replace(/\bwww\./gi, 'www[.]')                              // GitHub also auto-links www. hosts
    .replace(/`/g, '')                                           // stray or escaped backticks
    .replace(/\[/g, '(').replace(/\]/g, ')');                    // what is left cannot form a link

  return s.split(NUL).map((part, i) => (i % 2 === 0 ? part : `\`${spans[Number(part)]}\``)).join('');
}

/** One line of plain text that is safe to publish: no protocol markers, comments, mentions, secrets or live markup. */
function cleanText(text, max = DESCRIPTION_MAX) {
  let s = report.sanitizeModelText(String(text ?? ''));
  s = s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<!--|-->/g, ' ');
  s = neutraliseMarkup(s);
  for (const re of SECRET_PATTERNS) s = s.replace(re, '[REDACTED]');
  s = s.replace(/@(?=[A-Za-z0-9_])/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}\u2026` : s;
}

/** Identity of a finding: category, file, section and (for deterministic findings) a rule key. Not the wording. */
function fingerprint(f) {
  const key = [f.category, f.file, String(f.section || '').trim().toLowerCase(), f.rule || ''].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function normaliseSeverity(v) {
  const s = String(v ?? '').trim().toUpperCase().replace(/^DOCS[-_ ]?/, '');
  if (s === 'BLOCKER') return 'DOCS-BLOCKER';
  if (s === 'SUGGESTION') return 'DOCS-SUGGESTION';
  return null;
}

function resolveSection(doc, raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { error: 'missing section' };
  const line = /^line\s+(\d+)$/i.exec(s);
  if (line) {
    const n = Number(line[1]);
    return n >= 1 && n <= doc.lines.length ? { section: `line ${n}` } : { error: `line ${n} is outside the file` };
  }
  const want = normHeading(s);
  const h = doc.headings.find(x => normHeading(x.text) === want);
  return h ? { section: h.text } : { error: `heading "${s}" not found in file` };
}

function safeRelPath(p) {
  const s = String(p ?? '').trim().replace(/\\/g, '/');
  if (!s || s.startsWith('/') || /^[a-z]:/i.test(s) || s.split('/').includes('..')) return null;
  return path.posix.normalize(s);
}

/**
 * Check judge output against the repository. Anything that does not name a real file and a real
 * section or line is dropped and reported in `rejected`, so no published finding lacks traceability.
 */
function validateFindings(input, ctx) {
  const root = ctx.root;
  const candidates = ctx.candidates || [];
  const valid = [];
  const rejected = [];
  const byFp = new Map();
  const docs = new Map();
  const docOf = rel => {
    if (!docs.has(rel)) { const t = readText(root, rel); docs.set(rel, t === null ? null : parseDoc(t)); }
    return docs.get(rel);
  };

  for (const raw of Array.isArray(input) ? input : []) {
    const reject = reason => rejected.push({ finding: raw, reason });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { reject('not an object'); continue; }
    if (!CATEGORIES.includes(raw.category)) { reject(`unknown category "${raw.category}"`); continue; }
    const severity = normaliseSeverity(raw.severity);
    if (!severity) { reject(`unknown severity "${raw.severity}"`); continue; }
    const file = safeRelPath(raw.file);
    if (!file) { reject('missing or unsafe file path'); continue; }
    const doc = docOf(file);
    if (!doc) { reject(`file "${file}" does not exist`); continue; }
    const sec = resolveSection(doc, raw.section);
    if (sec.error) { reject(sec.error); continue; }
    const description = cleanText(raw.description);
    if (!description) { reject('missing description'); continue; }

    const out = { category: raw.category, severity, file, section: sec.section, description, rule: '' };
    if (raw.feature !== undefined || raw.expectedPath !== undefined) {
      const m = /^#(\d+)$/.exec(String(raw.feature ?? '').trim());
      const cand = m && candidates.find(c => Number(c.nnn) === Number(m[1]));
      const exp = safeRelPath(raw.expectedPath);
      const adrOk = cand && exp && new RegExp(`^docs/architecture/adr-0*${Number(cand.nnn)}-[a-z0-9][a-z0-9-]*\\.md$`).test(exp);
      if (raw.category !== 'architecture') { reject('feature/expectedPath are only valid for the architecture category'); continue; }
      if (!cand) { reject(`feature "${raw.feature}" is not a merged feature without an ADR`); continue; }
      if (!adrOk) { reject('expectedPath must be docs/architecture/adr-NNN-<slug>.md for the named feature'); continue; }
      out.feature = `#${cand.nnn}`;
      out.expectedPath = exp;
      out.rule = `missing:#${cand.nnn}`;
    }
    out.fingerprint = fingerprint(out);
    const prior = byFp.get(out.fingerprint);
    if (!prior) { byFp.set(out.fingerprint, out); valid.push(out); continue; }
    if (!prior.description.includes(out.description)) {
      prior.description = cleanText(`${prior.description} ${out.description}`, MERGED_DESCRIPTION_MAX);
    }
    if (out.severity === 'DOCS-BLOCKER') prior.severity = 'DOCS-BLOCKER';
  }
  return { valid, rejected };
}

/** Deterministic findings are trusted for file/section but still get clean text and a fingerprint. */
function finalizeFindings(list) {
  const byFp = new Map();
  for (const f of list) {
    const out = { ...f, description: cleanText(f.description, MERGED_DESCRIPTION_MAX) };
    out.fingerprint = fingerprint(out);
    if (!byFp.has(out.fingerprint)) byFp.set(out.fingerprint, out);
  }
  return [...byFp.values()];
}

// ---------------------------------------------------------------------------------------------
// Report rendering (US-2): grouped by category, nothing dropped, chunked below the comment limit
// ---------------------------------------------------------------------------------------------
const fpMarker = id => `<!-- docs-audit:fp=${id} -->`;
const resolvedMarker = id => `<!-- docs-audit:resolved=${id} -->`;

function findingLine(f) {
  let line = `- **${f.severity}** \`${f.file}\` \u203a ${f.section}: ${f.description}`;
  if (f.feature) line += ` (feature ${f.feature}; documentation expected at \`${f.expectedPath}\`)`;
  return `${line} ${fpMarker(f.fingerprint)}`;
}

function renderReport(findings, o = {}) {
  const maxChars = o.maxChars || COMMENT_MAX;
  const date = o.date || new Date().toISOString().slice(0, 10);
  const runUrl = o.runUrl || '';
  const rank = f => (f.severity === 'DOCS-BLOCKER' ? 0 : 1);

  const sections = [];
  for (const cat of CATEGORIES) {
    const items = findings.filter(f => f.category === cat)
      .sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file) || a.section.localeCompare(b.section));
    if (items.length) sections.push({ heading: `### ${CATEGORY_TITLES[cat]}`, lines: items.map(findingLine) });
  }
  const resolved = (o.resolved || []).map(r => `- ${cleanText(r.label || `finding ${r.fingerprint}`, 300)} ${resolvedMarker(r.fingerprint)}`);
  if (resolved.length) sections.push({ heading: '### No longer detected', lines: resolved, note: 'These earlier findings were not found in this audit.' });

  const reserve = 1400 + runUrl.length + (o.tracking ? TRACKING_MARKER.length : 0);
  const budget = Math.max(200, maxChars - reserve);
  const parts = [];
  let cur = null;
  const open = () => { cur = { size: 0, blocks: [] }; parts.push(cur); };
  for (const s of sections) {
    let headed = false;
    for (const line of s.lines) {
      const head = s.heading.length + 2 + (s.note ? s.note.length + 2 : 0);
      if (!cur) open();
      const need = line.length + 1 + (headed ? 0 : head);
      if (cur.size + need > budget && cur.size > 0) { open(); headed = false; }
      if (!headed) {
        cur.blocks.push(`${s.heading}${parts.length > 1 && cur.blocks.length === 0 ? ' (continued)' : ''}`);
        if (s.note) cur.blocks.push(s.note);
        cur.size += head;
        headed = true;
      }
      cur.blocks.push(line);
      cur.size += line.length + 1;
    }
  }
  if (!parts.length) open();

  const n = parts.length;
  const bodies = parts.map((p, i) => {
    const out = [];
    if (i === 0 && o.tracking) out.push(TRACKING_MARKER);
    out.push(`## Documentation audit: ${date}`);
    if (n > 1) out.push(`_Part ${i + 1} of ${n}_`);
    if (i === 0) {
      out.push(`Scheduled audit of the whole documentation set. ${findings.length} new finding${findings.length === 1 ? '' : 's'}${runUrl ? ` ([run](${runUrl}))` : ''}.`);
    } else if (runUrl) out.push(`Continuation of the audit report ([run](${runUrl})).`);
    out.push('');
    let prevList = false;
    for (const b of p.blocks) {
      const isLine = b.startsWith('- ');
      if (!isLine && prevList) out.push('');
      out.push(isLine ? b : b);
      if (!isLine) out.push('');
      prevList = isLine;
    }
    if (i === n - 1) {
      out.push('');
      out.push('_The audit only reports; it never edits files or closes this issue. Confirm each finding before acting. Close this issue when done: the next audit that finds drift opens a new one._');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
  });
  return { bodies };
}

// ---------------------------------------------------------------------------------------------
// Tracking issue and already-reported findings (FR-011, FR-012, FR-015)
// ---------------------------------------------------------------------------------------------
/** The oldest open issue that has the docs-drift label AND our hidden marker. Others are never touched. */
async function findTrackingIssue(github, owner, repo) {
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, labels: LABEL, state: 'open', per_page: 100,
  });
  const mine = (issues || [])
    .filter(i => !i.pull_request && typeof i.body === 'string' && i.body.includes(TRACKING_MARKER))
    .sort((a, b) => a.number - b.number);
  return mine[0] || null;
}

const MARKER_RE = /<!--\s*docs-audit:(fp|resolved)=([0-9a-f]{12})\s*-->/g;

function labelFromLine(line, marker) {
  const t = line.replace(marker, '').trim();
  if (!t.startsWith('- ')) return null;
  return t.slice(2).replace(/^\*\*DOCS-(?:BLOCKER|SUGGESTION)\*\*\s*/, '').trim();
}

/**
 * Fingerprints the tracking issue currently lists, replayed in order: the issue body, then comments by
 * the Actions bot (a marker pasted by a person is ignored). `resolved` removes, a later `fp` re-adds.
 * @returns {Map<string,string>} fingerprint -> short label
 */
function knownFindings(body, comments) {
  const known = new Map();
  const apply = (text, trusted) => {
    if (!trusted || !text) return;
    for (const line of String(text).split(/\r?\n/)) {
      MARKER_RE.lastIndex = 0;
      let m;
      while ((m = MARKER_RE.exec(line)) !== null) {
        if (m[1] === 'resolved') known.delete(m[2]);
        else known.set(m[2], labelFromLine(line, m[0]) || `finding ${m[2]}`);
      }
    }
  };
  apply(body, true);
  for (const c of comments || []) {
    const u = c && c.user;
    apply(c && c.body, !!u && (u.type === 'Bot' || /\[bot\]$/.test(u.login || '')));
  }
  return known;
}

// ---------------------------------------------------------------------------------------------
// Publish: the only code that writes to GitHub (the decision table in plan.md)
// ---------------------------------------------------------------------------------------------
async function ensureLabel(github, owner, repo) {
  const create = github.rest.issues.createLabel;
  if (typeof create !== 'function') return;
  try {
    await create({ owner, repo, name: LABEL, color: 'fbca04', description: 'Documentation drift found by the scheduled audit' });
  } catch (err) {
    if (!(err && (err.status === 422 || /already_exists/.test(String(err.message))))) throw err;
  }
}

async function publish(o) {
  const { github, owner, repo, findings = [], scanned = 0, runUrl = '' } = o;
  const log = o.log || console;
  const summary = o.summary || (() => {});
  const now = o.now || new Date();
  const date = now.toISOString().slice(0, 10);

  if (!findings.length) {
    const msg = `Documentation audit clean: ${scanned} documentation files covered, 0 findings. Nothing was posted.`;
    log.info(msg);
    await summary(`## Documentation audit\n\n${msg}`);
    return { action: 'none', reason: 'clean' };
  }

  const tracking = await findTrackingIssue(github, owner, repo);
  let known = new Map();
  if (tracking) {
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner, repo, issue_number: tracking.number, per_page: 100,
    });
    known = knownFindings(tracking.body, comments);
  }
  const current = new Set(findings.map(f => f.fingerprint));
  const fresh = findings.filter(f => !known.has(f.fingerprint));
  if (!fresh.length) {
    const msg = `Documentation audit: ${findings.length} finding(s), all already reported on #${tracking.number}. Nothing was posted. Covered ${scanned} documentation files.`;
    log.info(msg);
    await summary(`## Documentation audit\n\n${msg}`);
    return { action: 'none', reason: 'already-reported', issue: tracking.number };
  }
  const resolved = [...known.entries()].filter(([fp]) => !current.has(fp)).map(([fingerprint, label]) => ({ fingerprint, label }));

  const { bodies } = renderReport(fresh, {
    runUrl, date, maxChars: o.maxChars, resolved, tracking: !tracking,
  });

  let issue;
  let action;
  if (!tracking) {
    await ensureLabel(github, owner, repo);
    const { data } = await github.rest.issues.create({
      owner, repo, title: `Documentation drift: audit ${date}`, body: bodies[0], labels: [LABEL],
    });
    issue = data.number;
    action = 'created';
    const labels = (data.labels || []).map(l => (typeof l === 'string' ? l : l.name));
    if (!labels.includes(LABEL)) {
      await github.rest.issues.addLabels({ owner, repo, issue_number: issue, labels: [LABEL] });
    }
    for (const body of bodies.slice(1)) await github.rest.issues.createComment({ owner, repo, issue_number: issue, body });
  } else {
    issue = tracking.number;
    action = 'commented';
    for (const body of bodies) await github.rest.issues.createComment({ owner, repo, issue_number: issue, body });
  }

  // FR-021: audit trail, only when a report was posted. No run id, so no result marker reaches the Orchestrator.
  const reporter = report.createReporter({
    agent: 'docs', runId: '', runtime: o.runtime || '', branch: o.branch || process.env.GITHUB_REF_NAME || '',
    log,
    post: (n, body) => github.rest.issues.createComment({ owner, repo, issue_number: n, body }),
  });
  const done = `Scheduled documentation audit reported ${fresh.length} new finding(s) over ${scanned} files.`;
  await reporter.start({ issueNumber: issue });
  // #335: the judge's token usage rides in the complete footprint. agent-report validates it and drops a malformed value.
  await reporter.finish({ issueNumber: issue, outcome: 'success', summary: done, usage: o.usage });

  const msg = `Documentation audit: ${fresh.length} new finding(s) ${action === 'created' ? 'in new tracking issue' : 'added to tracking issue'} #${issue}.`;
  log.info(msg);
  await summary(`## Documentation audit\n\n${msg}`);
  return { action, issue, newFindings: fresh.length, resolved: resolved.length };
}

// ---------------------------------------------------------------------------------------------
// Failure visibility (FR-016) and the judge's output
// ---------------------------------------------------------------------------------------------
async function runAudit({ steps, summary = () => {}, log = console }) {
  try {
    return await steps();
  } catch (err) {
    const msg = String((err && err.message) || err);
    log.warn(`Documentation audit failed: ${msg}`);
    try { await summary(`## Documentation audit: AUDIT FAILED\n\nThe audit could not complete, so this is not a clean result. ${cleanText(msg, 400)}`); } catch { /* the original error matters more */ }
    throw err;
  }
}

/** The judge must answer with a JSON array (prose or a fence around it is tolerated). Anything else throws. */
function parseJudgeOutput(text) {
  const s = String(text ?? '').trim();
  if (!s) throw new Error('judge output is empty');
  const tryParse = t => { try { const v = JSON.parse(t); return Array.isArray(v) ? v : null; } catch { return null; } };
  const direct = tryParse(s);
  if (direct) return direct;
  for (const m of s.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)) {
    const v = tryParse(m[1].trim());
    if (v) return v;
  }
  let starts = 0;
  for (let i = s.indexOf('['); i !== -1 && starts < 200; i = s.indexOf('[', i + 1), starts++) {
    for (let j = s.lastIndexOf(']'); j > i; j = s.lastIndexOf(']', j - 1)) {
      const v = tryParse(s.slice(i, j + 1));
      if (v) return v;
    }
  }
  throw new Error('judge output does not contain a JSON array of findings');
}

// ---------------------------------------------------------------------------------------------
// collect + publishFromFiles: what the workflows call
// ---------------------------------------------------------------------------------------------
function readLinkConfig(root) {
  try { return JSON.parse(readText(root, '.markdown-link-check.json') || '{}'); } catch { return {}; }
}

async function collect({ root, out, getIssueState, fetchImpl, sleep, log = console }) {
  const files = collectDocSet(root);
  const cfg = readLinkConfig(root);
  const links = checkLinks({ root, files, ignorePatterns: cfg.ignorePatterns });
  const external = await checkExternalLinks(links.external, {
    fetchImpl, sleep, ignorePatterns: cfg.ignorePatterns, aliveStatusCodes: cfg.aliveStatusCodes,
  });
  const facts = await collectFacts(root, { getIssueState });
  if (facts.unchecked.length) {
    // FR-016: a check that could not run must never end as "0 findings". Fail before any file is
    // written so the publish step has nothing to turn into a clean record.
    const list = facts.unchecked.map(u => u.nnn).join(', ');
    throw new Error(`The ADR check could not be checked for ${facts.unchecked.length} spec(s) (${list}): the issue state lookup failed. Check GITHUB_TOKEN, GITHUB_REPOSITORY and API availability.`);
  }
  const findings = finalizeFindings([...links.findings, ...external, ...versionFindings(facts)]);
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'facts.json'), JSON.stringify({ ...facts, files }, null, 2));
    fs.writeFileSync(path.join(out, 'deterministic-findings.json'), JSON.stringify(findings, null, 2));
    fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ scanned: files.length }));
  }
  log.info(`Collected ${files.length} documentation files; ${findings.length} deterministic finding(s); ${facts.adrCandidates.length} ADR candidate(s).`);
  return { findings, facts, scanned: files.length, files };
}

/** Validate the judge's file, merge with the deterministic findings and publish. Any problem throws. */
async function publishFromFiles({ github, owner, repo, dir, judgeFile, root, runUrl, log = console, summary, runtime, usage }) {
  const readJson = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const facts = readJson('facts.json');
  const deterministic = readJson('deterministic-findings.json');
  const meta = readJson('meta.json');
  if (!judgeFile || !fs.existsSync(judgeFile)) throw new Error('the judge produced no findings file');
  const judged = parseJudgeOutput(fs.readFileSync(judgeFile, 'utf8'));
  const { valid, rejected } = validateFindings(judged, { root, candidates: facts.adrCandidates });
  for (const r of rejected) log.warn(`Dropped a judge finding: ${r.reason}`);
  const byFp = new Map();
  for (const f of [...finalizeFindings(deterministic), ...valid]) if (!byFp.has(f.fingerprint)) byFp.set(f.fingerprint, f);
  return publish({ github, owner, repo, findings: [...byFp.values()], scanned: meta.scanned, runUrl, log, summary, runtime, usage });
}

// ---------------------------------------------------------------------------------------------
// CLI:  node docs-audit.cjs collect --out <dir> [--root <dir>]   (offline: ADR candidates need GITHUB_TOKEN)
// ---------------------------------------------------------------------------------------------
async function main(argv, env = process.env) {
  const [cmd, ...rest] = argv;
  const args = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) args[rest[i].slice(2)] = rest[++i];
  if (cmd !== 'collect') {
    console.error('usage: docs-audit.cjs collect --out <dir> [--root <dir>]\n(publishing is done by the workflow through publishFromFiles)');
    return 2;
  }
  if (!args.out) { console.error('docs-audit: --out is required'); return 2; }
  const repository = env.GITHUB_REPOSITORY;
  const getIssueState = async n => {
    if (!repository || !env.GITHUB_TOKEN) return null;
    try {
      const res = await fetch(`https://api.github.com/repos/${repository}/issues/${n}`, {
        headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
      });
      return res.ok ? (await res.json()).state : null; // any non-OK answer (404 included: GitHub returns it for a bad token on a private repo) is "unchecked"
    } catch { return null; }
  };
  await collect({ root: path.resolve(args.root || '.'), out: path.resolve(args.out), getIssueState });
  return 0;
}

module.exports = {
  CATEGORIES, SEVERITIES, LABEL, TRACKING_MARKER,
  collectDocSet, checkLinks, checkExternalLinks, collectFacts, versionFindings,
  validateFindings, fingerprint, renderReport, findTrackingIssue, knownFindings, publish,
  runAudit, parseJudgeOutput, collect, publishFromFiles, main,
};

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(err => {
    console.error(`docs-audit: ${(err && err.message) || err}`);
    process.exitCode = 1;
  });
}
