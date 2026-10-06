#!/usr/bin/env node
/**
 * ba-spec-author.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Lets the automated BA / Product Agent step write the bug-fix spec (#377, ADR-377).
 *
 * Why it exists
 *   The bug-fix pipeline now starts with a `ba` step because the Developer Agent will not start
 *   without specs/NNN-*\/spec.md (Constitution §III). The BA workflow makes one chat call and used
 *   to post the reply as a comment; nothing ever created the spec file, so the step reported
 *   `spec_gap` and the pipeline looped ba -> ba. This module turns the model's reply into a spec
 *   file, with the checks a person would apply, and decides the outcome from the result.
 *
 * Rules (specs/377-bug-fix-pipeline-spec-gate/spec.md)
 *   FR-024  a `type:bug` issue with no spec gets a spec file written (the workflow then publishes it)
 *   FR-025  `success` only when a spec file exists; no usable spec -> `spec_gap`;
 *           the bug cannot be established -> `needs-human`
 *   FR-026  an existing spec is reused: no second directory, nothing written
 *   FR-027  the spec meets the bug-fix hand-off bar (Template C) or nothing is written
 *   FR-028  only the spec file and the active-feature pointer are written
 *
 * Pure file/string logic: no network, no git. The workflow does the model call and the publish.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SPEC_BEGIN = '=== SPEC BEGIN ===';
const SPEC_END   = '=== SPEC END ===';
const SLUG_MAX   = 40;      // same cut as the pipeline's branch tooling
const SPEC_MAX   = 20000;   // a bug spec is about one page; this is a generous ceiling

const REQUIRED_SECTIONS = [
  'Overview',
  'Reproduction',
  'Functional Requirements',
  'Success Criteria',
  'Out of Scope',
  'Security and Privacy Considerations',
  'Open Questions',
];

// Template C placeholder text that must have been replaced with real content.
const PLACEHOLDER_RE =
  /\[(?:Bug Title|Step\]|Observed behaviour|What this fix|The corrected behaviour|Any other measurable|One line|ALL must be resolved|what happens|what should happen)/i;

const oneLine = (s, max = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ─── Small helpers ──────────────────────────────────────────────────────────

/** True when the issue carries `type:bug`. Accepts GitHub label objects or plain strings. */
function isBugIssue(labels) {
  if (!Array.isArray(labels)) return false;
  return labels.some(l => (typeof l === 'string' ? l : l && l.name) === 'type:bug');
}

function padIssue(issueNumber) {
  const n = Number(issueNumber);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`invalid issue number: ${issueNumber}`);
  return String(n).padStart(3, '0');
}

/** `NNN-slug` from the issue number and title. The slug only ever holds [a-z0-9-]. */
function specDirName(issueNumber, title) {
  const nnn = padIssue(issueNumber);
  const slug = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return `${nnn}-${slug || 'bug-fix'}`;
}

/**
 * The spec directory already present for this issue, if any.
 * @returns {{ dir: string, specPath: string, hasSpec: boolean } | null}  specPath is repo-relative
 */
function findExistingSpec(root, issueNumber) {
  const prefix = `${padIssue(issueNumber)}-`;
  const specsDir = path.join(root, 'specs');
  let entries;
  try { entries = fs.readdirSync(specsDir, { withFileTypes: true }); } catch { return null; }
  const dirs = entries.filter(e => e.isDirectory() && e.name.startsWith(prefix)).map(e => e.name).sort();
  if (dirs.length === 0) return null;
  // Prefer a directory that already holds a spec.md.
  const withSpec = dirs.find(d => fs.existsSync(path.join(specsDir, d, 'spec.md')));
  const dir = withSpec || dirs[0];
  return { dir, specPath: `specs/${dir}/spec.md`, hasSpec: !!withSpec };
}

// ─── Reply handling ─────────────────────────────────────────────────────────

/**
 * Pull the spec out of a model reply.
 * @returns {{ spec: string|null, rest: string }}  rest is the reply without the spec block
 */
function extractSpec(reply) {
  const text = String(reply ?? '');
  const re = new RegExp(`${SPEC_BEGIN}[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n?[ \\t]*${SPEC_END}`);
  const m = text.match(re);
  if (!m) return { spec: null, rest: text.trim() };
  let spec = m[1].trim();
  // Models often wrap the block in a single code fence; unwrap it.
  const fenced = spec.match(/^```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)\r?\n```$/);
  if (fenced) spec = fenced[1].trim();
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\n{3,}/g, '\n\n').trim();
  return { spec: spec || null, rest };
}

/** Section body: text after `## Name` up to the next `## ` heading. */
function sectionBody(spec, name) {
  const re = new RegExp(`^##[ \\t]+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm');
  const m = re.exec(spec);
  if (!m) return null;
  const after = spec.slice(m.index + m[0].length);
  const next = after.search(/^##[ \t]+\S/m);
  return (next === -1 ? after : after.slice(0, next)).trim();
}

/**
 * Check a drafted spec against the bug-fix hand-off bar (FR-012, FR-014, FR-027).
 * @returns {{ ok: boolean, problems: string[] }}
 */
function validateBugSpec(spec, issueNumber) {
  const problems = [];
  const text = String(spec ?? '');

  if (text.length > SPEC_MAX) problems.push(`spec is too long (${text.length} characters; a bug spec is about one page)`);

  const heading = text.match(/^# Spec:.*Issue #(\d+)/m);
  if (!heading) problems.push('missing the "# Spec: <title> — Issue #N" heading');
  else if (Number(heading[1]) !== Number(issueNumber)) problems.push(`heading names Issue #${heading[1]}, not #${issueNumber}`);

  for (const name of REQUIRED_SECTIONS) {
    if (sectionBody(text, name) === null) problems.push(`missing section "${name}"`);
  }

  if (!/^[-*][ \t]+\**FR-\d+/m.test(text)) problems.push('no functional requirement (FR-001...)');
  if (!/regression test/i.test(text)) problems.push('no regression-test success criterion');

  if (/\[NEEDS CLARIFICATION/i.test(text)) problems.push('contains an unresolved [NEEDS CLARIFICATION] marker');
  if (PLACEHOLDER_RE.test(text)) problems.push('contains unfilled template placeholder text');

  const open = sectionBody(text, 'Open Questions');
  if (open !== null && open !== '' && !/^(?:none|n\/a)\b/i.test(open)) {
    problems.push('Open Questions is not resolved (must be empty or "None")');
  }

  // Never let spec text imitate the machine-readable parts of a footprint (forged verdicts).
  if (/```apm-msg/i.test(text) || /<!--\s*(?:agent-footprint|apm:run_id|apm-pipeline-state)/i.test(text)) {
    problems.push('contains orchestrator footprint markup');
  }

  return { ok: problems.length === 0, problems };
}

// ─── Authoring ──────────────────────────────────────────────────────────────

function writeFeaturePointer(root, { dir, issueNumber, today }) {
  const file = path.join(root, '.specify', 'feature.json');
  let current = {};
  try { current = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { /* absent or unreadable: start fresh */ }
  const next = {
    ...current,
    feature_directory: `specs/${dir}`,
    issue: Number(issueNumber),
    slug: dir.replace(/^\d+-/, ''),
    spec_dir: `specs/${dir}`,
    branch: dir,
    status: 'spec-ready',
    updated: today,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

/**
 * Decide what the automated BA step does for this issue and, when it can, write the spec.
 *
 * @param {object} o
 *   root, issueNumber, title, labels, reply (raw model reply), modelOutcome (the verdict parsed from the reply
 *   or null), today (YYYY-MM-DD, default now)
 * @returns {{ action: 'skip'|'reuse'|'authored', outcome: string|null, written: boolean,
 *             specPath: string, summary: string, rest: string }}
 *   outcome is null when the module does not decide (skip, reuse): the existing publish logic applies.
 */
function authorSpec(o) {
  const { root, issueNumber, title, labels, reply, modelOutcome } = o;
  const none = { outcome: null, written: false, specPath: '', summary: '', rest: String(reply ?? '').trim() };

  if (!isBugIssue(labels)) return { action: 'skip', ...none };

  const existing = findExistingSpec(root, issueNumber);
  if (existing && existing.hasSpec) {
    return { action: 'reuse', ...none, specPath: existing.specPath, summary: `Reusing the existing spec ${existing.specPath}.` };
  }

  const { spec, rest } = extractSpec(reply);
  const done = (outcome, summary, extra = {}) => ({
    action: 'authored', outcome, written: false, specPath: '', summary: oneLine(summary, 280), rest, ...extra,
  });

  // The model's own verdict comes first: it is the only thing that knows the issue was too thin.
  if (modelOutcome === 'needs-human' || !modelOutcome) {
    return done('needs-human',
      modelOutcome
        ? `The bug in #${issueNumber} cannot be established from the report; a person must add reproduction details. No spec written.`
        : `The agent did not state an outcome for #${issueNumber}; a person must check. No spec written.`);
  }
  if (modelOutcome !== 'success') {
    return done('spec_gap', `The agent could not produce a spec for #${issueNumber} (reported ${modelOutcome}). No spec written.`);
  }

  if (!spec) return done('spec_gap', `The reply for #${issueNumber} contained no spec between the ${SPEC_BEGIN} / ${SPEC_END} markers. No spec written.`);

  const check = validateBugSpec(spec, issueNumber);
  if (!check.ok) return done('spec_gap', `The drafted spec for #${issueNumber} was rejected: ${check.problems.slice(0, 3).join('; ')}. No spec written.`);

  const dir = existing ? existing.dir : specDirName(issueNumber, title);
  const specDir = path.resolve(root, 'specs', dir);
  if (!specDir.startsWith(path.resolve(root, 'specs') + path.sep)) {
    return done('spec_gap', `Refusing to write outside specs/ for #${issueNumber}.`);
  }
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'spec.md'), spec.trim() + '\n', 'utf8');
  writeFeaturePointer(root, { dir, issueNumber, today: o.today || new Date().toISOString().slice(0, 10) });

  const specPath = `specs/${dir}/spec.md`;
  return {
    action: 'authored', outcome: 'success', written: true, specPath, rest,
    summary: `Bug-fix spec written to ${specPath} for #${issueNumber}.`,
  };
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

/** Instructions appended to the issue context when the step must write a bug spec. */
function buildSpecRequest({ issueNumber, title }) {
  const heading = `# Spec: ${oneLine(title, 120) || 'Bug title'} — Issue #${Number(issueNumber)}`;
  return [
    '',
    `Issue #${Number(issueNumber)} is labelled \`type:bug\` and has no spec yet. Write the bug-fix spec now, using`,
    '**Template C — Bug Fix** from your instructions (short: about one page; no user stories, no key entities).',
    '',
    'Output format, exactly:',
    '1. One or two sentences saying what you did (optional).',
    `2. The complete spec between these two marker lines, each alone on its line:`,
    `   ${SPEC_BEGIN}`,
    `   ${heading}`,
    '   ...the remaining Template C sections...',
    `   ${SPEC_END}`,
    '3. The SUMMARY and OUTCOME lines.',
    '',
    'Rules:',
    '- Use only facts that are in, or can be inferred directly from, the issue. Never invent reproduction steps, versions or causes.',
    '- Every section filled in with real content, no template placeholders; Open Questions must say "None.".',
    '- Include a success criterion that a regression test fails before the fix and passes after it.',
    '- If the issue does not let you establish what the bug is, write NO spec block and end with `OUTCOME: needs-human`.',
    '- If you cannot produce a usable spec for any other reason, write NO spec block and end with `OUTCOME: spec_gap`.',
    '- Use `OUTCOME: success` only when the spec block is present and complete.',
  ].join('\n');
}

module.exports = {
  SPEC_BEGIN, SPEC_END, REQUIRED_SECTIONS,
  isBugIssue, specDirName, findExistingSpec, extractSpec, validateBugSpec, authorSpec, buildSpecRequest,
};
