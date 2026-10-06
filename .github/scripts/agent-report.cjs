#!/usr/bin/env node
/**
 * agent-report.cjs
 * -----------------------------------------------------------------------------
 * Single builder for everything an agent says about its own run, so a message
 * looks the same whether it comes from
 *   - a GitHub Actions workflow (dev runner, inline github-script agents), or
 *   - a local agent (Claude Code / Copilot in an IDE) following its manifest.
 *
 * What it produces
 *   1. Footprint comments  `<!-- agent-footprint: start|complete|fail -->` with real values
 *      (agent, issue/PR, branch, timestamp, summary) and, for complete/fail, a schema-valid
 *      `apm-msg` JSON block (version, runId, step, agent, iteration, outcome, summary,
 *      event_type, issue, pr, branch, timestamp).
 *   2. The result marker  `<!-- apm:run_id=... step=... iteration=N runtime=... outcome=... -->`.
 *      The Orchestrator reads this marker to apply a transition, so it is added to every
 *      complete/fail footprint that carries a verdict and a real run id.
 *   3. The reporting protocol an LLM-backed agent must follow (SUMMARY / OUTCOME lines) and the
 *      parser for it, so the verdict comes from the model deliberately instead of being guessed.
 *
 * Why code builds these and not the model
 *   A model that fills a template copies the placeholders (runId 000..., timestamp 00:00:00Z),
 *   and one that posts through `gh issue comment "...`agent`..."` loses every backtick to shell
 *   command substitution. Here every value comes from the run, and posting goes through the REST
 *   API (or `gh api` with the body on stdin), never through a shell string.
 *
 * Library use (workflows):
 *   const report = require('./.github/scripts/agent-report.cjs')
 *                    .forGithubScript({ agent: 'qa', github, context, core });
 *   await report.start({ issueNumber });
 *   ...
 *   await report.finish({ issueNumber, reply });      // posts the reply + the footprint
 *   await report.fail('Runtime API error 500');       // posts the fail footprint
 *
 * CLI use (local agents, fallback steps):
 *   node .github/scripts/agent-report.cjs start    --agent qa --issue 12 [--pr 14]
 *   node .github/scripts/agent-report.cjs complete --agent qa --issue 12 --outcome success --summary-stdin <<'EOF'
 *   QA complete - 41 passed / 0 failed.
 *   EOF
 *   node .github/scripts/agent-report.cjs fail     --agent qa --issue 12 --summary-stdin <<'EOF'
 *   Test runner crashed before producing results.
 *   EOF
 *   Add --dry-run to print the comment instead of posting it.
 *
 * Environment (CLI): ISSUE_NUMBER, RUN_ID, STEP, ITERATION, RUNTIME_NAME, GITHUB_REPOSITORY,
 *   GITHUB_TOKEN or GH_TOKEN (otherwise the `gh` CLI is used; owner/repo falls back to `origin`).
 * -----------------------------------------------------------------------------
 */

'use strict';

const https = require('https');
const fs = require('fs');
const { execFileSync } = require('child_process');

// ---- Registry ---------------------------------------------------------------
// key   : workflow slug (copilot-agent-<key>.yml)
// name  : display name used in footprints (the manifest's name)
// msg   : agent slug in the apm-msg block / agent-identities.yml
// step  : default pipeline step name
// label : human label used in comments
const AGENTS = {
  triage:           { name: 'triage-agent',           msg: 'triage-agent',           step: 'triage',           label: 'Triage Agent' },
  ba:               { name: 'ba-product-agent',       msg: 'ba-agent',               step: 'ba',               label: 'BA / Product Agent' },
  'ba-enrich':      { name: 'ba-enrich-agent',        msg: 'ba-enrich-agent',        step: 'ba-enrich',        label: 'BA Issue Enrichment Agent' },
  architect:        { name: 'architect-agent',        msg: 'architect-agent',        step: 'architect',        label: 'Architect Agent' },
  dev:              { name: 'developer-agent',        msg: 'dev-agent',              step: 'dev',              label: 'Developer Agent' },
  qa:               { name: 'qa-test-agent',          msg: 'qa-agent',               step: 'qa',               label: 'QA/Test Agent' },
  reviewer:         { name: 'reviewer-agent',         msg: 'reviewer-agent',         step: 'reviewer',         label: 'Reviewer Agent' },
  security:         { name: 'security-agent',         msg: 'security-agent',         step: 'security',         label: 'Security Agent' },
  release:          { name: 'release-agent',          msg: 'release-agent',          step: 'release',          label: 'Release Agent' },
  docs:             { name: 'docs-agent',             msg: 'docs-agent',             step: 'docs',             label: 'Docs Agent' },
  'tech-debt':      { name: 'tech-debt-agent',        msg: 'tech-debt-agent',        step: 'tech-debt',        label: 'Tech-Debt Agent' },
  compliance:       { name: 'compliance-agent',       msg: 'compliance-agent',       step: 'compliance',       label: 'Compliance Agent' },
  incident:         { name: 'incident-agent',         msg: 'incident-agent',         step: 'incident',         label: 'Incident Agent' },
  devops:           { name: 'devops-agent',           msg: 'devops-agent',           step: 'devops',           label: 'DevOps Agent' },
  'digital-twin':   { name: 'digital-twin-agent',     msg: 'digital-twin-agent',     step: 'digital-twin',     label: 'Digital Twin Agent' },
  'ot-integration': { name: 'ot-integration-agent',   msg: 'ot-integration-agent',   step: 'ot-integration',   label: 'OT Integration Agent' },
};

// Same list as engine/orchestrator/schemas/apm-msg.schema.json (a test keeps them in sync).
const OUTCOMES = [
  'success', 'fail', 'blocker', 'spec_gap', 'timeout', 'needs-human',
  'runtime-error', 'protocol-violation', 'orchestrator-failure', 'spec-ready',
];
// What an LLM agent may declare as its own verdict.
const VERDICTS = ['success', 'fail', 'blocker', 'spec_gap', 'needs-human'];

const UNASSIGNED_RUN = 'unassigned';
const SUMMARY_MAX = 280;
const COMMENT_MAX = 60000; // GitHub rejects bodies over 65536 characters

/** Resolve any accepted spelling (qa, qa-agent, qa-test-agent, developer-agent...) to a registry key. */
function resolveAgent(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) throw new Error('agent is required (e.g. qa, reviewer, dev)');
  if (AGENTS[raw]) return raw;
  for (const [key, a] of Object.entries(AGENTS)) {
    if (raw === a.name || raw === a.msg || raw === `${key}-agent`) return key;
  }
  throw new Error(`unknown agent "${input}" (known: ${Object.keys(AGENTS).join(', ')})`);
}

const oneLine = (s, max = SUMMARY_MAX) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---- Footprint + marker builders -------------------------------------------
function hasRealRunId(runId) {
  return !!runId && runId !== UNASSIGNED_RUN;
}

function buildResultMarker({ runId, step, iteration = 1, runtime = '', outcome }) {
  if (!hasRealRunId(runId)) return '';
  const rt = String(runtime || 'unknown').replace(/\s+/g, '-');
  return `<!-- apm:run_id=${runId} step=${step} iteration=${Number(iteration) || 1} runtime=${rt} outcome=${outcome} -->`;
}

/**
 * Build a footprint comment body.
 * @param {'start'|'complete'|'fail'} kind
 * @param {object} c
 *   agent (required), issue (required), pr, branch, timestamp, runId, step, iteration, runtime,
 *   outcome, summary, nextAction, payload, marker (default true: add the result marker when the
 *   run id is real and the footprint carries a verdict).
 */
function buildFootprint(kind, c = {}) {
  if (!['start', 'complete', 'fail'].includes(kind)) throw new Error(`unknown footprint kind "${kind}"`);
  const key = resolveAgent(c.agent);
  const a = AGENTS[key];
  const timestamp = c.timestamp || new Date().toISOString();
  const step = c.step || a.step;
  const iteration = Number(c.iteration) || 1;
  const branch = c.branch || '';
  const summary = oneLine(c.summary) || (kind === 'fail' ? 'No error message provided.' : 'No summary provided.');
  const label = { start: 'started', complete: 'complete', fail: 'failed' }[kind];

  const lines = [
    `<!-- agent-footprint: ${kind} -->`,
    `**Agent ${label}:** \`${a.name}\``,
    `- **Event type:** \`agent-${kind}\``,
    `- **Issue / PR:** #${c.issue}`,
  ];
  if (c.pr && String(c.pr) !== String(c.issue)) lines.push(`- **PR:** #${c.pr}`);
  lines.push(`- **Branch:** \`${branch || 'n/a'}\``);
  lines.push(`- **Timestamp:** \`${timestamp}\``);

  if (kind === 'complete') {
    lines.push(`- **Summary:** ${summary}`);
    if (c.nextAction) lines.push(`- **Next recommended action:** ${oneLine(c.nextAction)}`);
  }
  if (kind === 'fail') {
    lines.push(`- **Error:** ${summary}`);
    lines.push('- **Recommended recovery:** Re-run the workflow after resolving the cause above; check the Actions log if it persists.');
  }

  if (kind !== 'start') {
    const outcome = c.outcome || (kind === 'complete' ? 'success' : 'fail');
    const msg = {
      version: '2',
      runId: c.runId || UNASSIGNED_RUN,
      step,
      agent: a.msg,
      iteration,
      outcome,
      summary,
      event_type: kind,
      pipeline_id: null,
      issue: String(c.issue),
      pr: c.pr ? String(c.pr) : null,
      branch: branch || null,
      timestamp,
    };
    if (c.payload && typeof c.payload === 'object') msg.payload = c.payload;
    lines.push('', '```apm-msg', JSON.stringify(msg, null, 2), '```');

    if (c.marker !== false) {
      const marker = buildResultMarker({ runId: c.runId, step, iteration, runtime: c.runtime, outcome });
      if (marker) lines.push('', marker);
    }
  }
  return lines.join('\n');
}

// ---- LLM reporting protocol -------------------------------------------------
const OUTCOME_INSTRUCTION = [
  '',
  '---',
  'Reporting protocol (required). The workflow itself posts the agent-start / agent-complete / agent-fail',
  'footprint comments and the machine-readable result block. Do NOT write footprint blocks, apm-msg blocks,',
  'HTML comment markers or shell commands in your reply; anything of that kind is discarded.',
  'End your reply with exactly these two lines, nothing after them:',
  'SUMMARY: <one sentence, at most 200 characters>',
  `OUTCOME: <${VERDICTS.join('|')}>`,
  'Use success only when every requirement of your role is met. Use fail when you found defects the',
  'previous step must fix. Use blocker when you cannot proceed. Use spec_gap when the specification is',
  'missing or ambiguous. Use needs-human when a human decision is required.',
].join('\n');

const withOutcome = prompt => `${prompt}\n${OUTCOME_INSTRUCTION}`;

/**
 * Drop the manifest sections that tell the model to post footprints itself. An inline workflow
 * makes one LLM call and cannot run `gh`; a model told to "post agent-start first" fills the
 * template with placeholders instead (runId 0000..., timestamp 00:00:00Z). Code posts footprints.
 */
function stripFootprintInstructions(manifest) {
  return String(manifest ?? '')
    .replace(/^## Mandatory Footprint Steps[\s\S]*?(?=^## |(?![\s\S]))/m, '')
    .replace(/^## Agent Footprint[\s\S]*?(?=^## |(?![\s\S]))/m, '');
}

/**
 * Remove anything in model text that imitates the machine-readable parts of a footprint: footprint
 * and result-marker comments, apm-msg fences and the "Agent complete" header lines. The workflow
 * login is shared by every agent, so an echoed `apm:run_id=... outcome=success` marker would let
 * a model (or text it was prompted with) forge a verdict.
 */
function sanitizeModelText(text) {
  return String(text ?? '')
    .replace(/```apm-msg[\s\S]*?```/gi, '')
    .replace(/<!--\s*(?:agent-footprint|apm:run_id|apm-pipeline-state)[\s\S]*?-->/gi, '')
    .replace(/^\*\*Agent (?:started|complete|failed):\*\*.*(?:\n[ \t]*- \*\*[^\n]*)*/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Pull the verdict out of a model reply.
 * @returns {{ body: string, outcome: string|null, summary: string }}
 *   body is the reply with the protocol lines removed; outcome is null when absent or invalid.
 */
function parseReply(reply) {
  const text = sanitizeModelText(reply);
  const outcomeRe = /^[ \t>*_`]*OUTCOME[ \t]*:[ \t*_`]*([A-Za-z_-]+)[ \t*_`]*$/gim;
  const summaryRe = /^[ \t>*_`]*SUMMARY[ \t]*:[ \t]*(.+?)[ \t*_`]*$/gim;
  let outcome = null;
  let m;
  while ((m = outcomeRe.exec(text)) !== null) {
    const v = m[1].toLowerCase().replace(/^spec-gap$/, 'spec_gap').replace(/^needs_human$/, 'needs-human');
    outcome = VERDICTS.includes(v) ? v : null;
  }
  let summary = '';
  while ((m = summaryRe.exec(text)) !== null) summary = oneLine(m[1], 200);
  const body = text
    .replace(outcomeRe, '')
    .replace(summaryRe, '')
    .replace(/\n-{3,}\s*$/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!summary) {
    const first = body.split('\n').map(l => l.replace(/^[#>*\-\s]+/, '').trim()).find(Boolean);
    summary = oneLine(first, 200);
  }
  return { body, outcome, summary };
}

// ---- Linked PR context ----------------------------------------------------------
/**
 * Find the pull request an agent should judge and render its diff as prompt text.
 * `issueNumber` may be the PR itself (comment-triggered runs) or the issue a pipeline works on
 * (dispatched runs): then the open PR whose body says Refs/Closes/Fixes #N, or whose branch is NNN-*.
 * @returns {Promise<{ prNumber: number|null, text: string }>}
 */
async function loadPrContext({ github, context, issueNumber, maxChars = 60000, perFile = 8000 }) {
  const { owner, repo } = context.repo;
  const n = Number(issueNumber);
  try {
    let pr = null;
    try { pr = (await github.rest.pulls.get({ owner, repo, pull_number: n })).data; } catch { /* not a PR */ }
    if (!pr) {
      const open = await github.rest.pulls.list({ owner, repo, state: 'open', per_page: 100 });
      const refs = new RegExp(`\\b(?:refs|closes|fixes|resolves)\\s+#${n}\\b`, 'i');
      const nnn = String(n).padStart(3, '0');
      pr = open.data.find(p => refs.test(p.body || '') || p.head.ref.startsWith(`${nnn}-`) || p.head.ref.startsWith(`${n}-`)) || null;
    }
    if (!pr) return { prNumber: null, branch: '', text: '' };
    const files = await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number: pr.number, per_page: 100 });
    let used = 0;
    const parts = [`## Pull request #${pr.number}: ${pr.title}`, `Branch: ${pr.head.ref} -> ${pr.base.ref}`, '', pr.body ? `Description:\n${pr.body.slice(0, 4000)}\n` : ''];
    for (const f of files) {
      const patch = f.patch ? f.patch.slice(0, perFile) : '(no textual diff)';
      const block = `### ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n\`\`\`diff\n${patch}\n\`\`\``;
      if (used + block.length > maxChars) { parts.push(`... ${files.length - parts.filter(x => x.startsWith('### ')).length} more file(s) omitted (size limit)`); break; }
      parts.push(block); used += block.length;
    }
    return { prNumber: pr.number, branch: pr.head.ref, text: parts.join('\n') };
  } catch {
    return { prNumber: null, branch: '', text: '' };
  }
}

// ---- Reporter ---------------------------------------------------------------
function gitBranch() {
  try {
    const b = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return b && b !== 'HEAD' ? b : '';
  } catch {
    return '';
  }
}

/**
 * @param {object} o
 *   agent, post(issueNumber, body) => Promise, runId, step, iteration, runtime, branch (optional),
 *   log (default console), onReported (called once a footprint with a verdict/failure is posted)
 */
function createReporter(o) {
  const key = resolveAgent(o.agent);
  const log = o.log || console;
  const state = { issue: null, reported: false };

  const base = (d = {}) => ({
    agent: key,
    runId: o.runId || '',
    step: o.step || AGENTS[key].step,
    iteration: o.iteration,
    runtime: o.runtime,
    branch: d.branch || o.branch || gitBranch(),
  });

  async function safePost(issue, body) {
    try {
      await o.post(issue, body.length > COMMENT_MAX ? `${body.slice(0, COMMENT_MAX)}\n\n_(truncated)_` : body);
      return true;
    } catch (err) {
      // A reporting failure must never mask the agent's own result.
      log.warn(`[agent-report] could not post comment on #${issue}: ${err && err.message}`);
      return false;
    }
  }

  const issueOf = d => d.issueNumber ?? state.issue;

  return {
    agent: key,
    get reported() { return state.reported; },
    withOutcome,

    /** Post a plain comment (the agent's human-readable report). */
    comment: (issue, body) => safePost(issue, body),

    async start(d = {}) {
      state.issue = issueOf(d) ?? null;
      if (!state.issue) { log.info('[agent-report] no issue/PR to report on; start footprint skipped'); return false; }
      return safePost(state.issue, buildFootprint('start', { ...base(d), issue: state.issue, pr: d.pr }));
    },

    /**
     * Report a finished run.
     * Pass `reply` (raw model text) to have the SUMMARY/OUTCOME lines parsed and the reply posted;
     * or pass `outcome` + `summary` directly when code decides the verdict.
     */
    async finish(d = {}) {
      const issue = issueOf(d);
      if (!issue) { log.info('[agent-report] no issue/PR to report on; footprint skipped'); state.reported = true; return false; }
      let { outcome, summary } = d;
      if (d.reply !== undefined) {
        const parsed = parseReply(d.reply);
        if (parsed.body && d.postReply !== false) await safePost(issue, parsed.body);
        outcome = outcome || parsed.outcome;
        summary = summary || parsed.summary;
        if (!outcome) {
          outcome = 'needs-human';
          summary = `The agent did not state an outcome (no OUTCOME line), so a human must check its report. ${summary || ''}`;
        }
      }
      outcome = outcome || 'success';
      // Same rule as the dev runner: success -> complete footprint, any other verdict -> fail footprint.
      // Both carry the apm-msg block and the result marker; only fail() (a crash) omits the marker.
      const kind = d.kind || (outcome === 'success' ? 'complete' : 'fail');
      state.reported = true;
      return safePost(issue, buildFootprint(kind, {
        ...base(d), issue, pr: d.pr, outcome, summary,
        nextAction: d.nextAction, payload: d.payload, marker: d.marker,
      }));
    },

    /** Report a crash / unrecoverable error. Carries no result marker, so the Orchestrator ends the step as runtime-error. */
    async fail(message, d = {}) {
      const issue = issueOf(d);
      state.reported = true;
      if (!issue) { log.info('[agent-report] no issue/PR to report on; fail footprint skipped'); return false; }
      return safePost(issue, buildFootprint('fail', {
        ...base(d), issue, pr: d.pr, outcome: 'fail', summary: message, marker: false,
      }));
    },
  };
}

/**
 * Reporter for actions/github-script steps. Run inputs come from the workflow_dispatch payload.
 *
 * Shape of an agent workflow (see copilot-agent-qa.yml):
 *   step "agent"  (id: agent)  report.start -> model call -> report.reply | report.verdict | report.abort
 *   step "report" (if: always()) report.conclude({ env: process.env })
 * The first step only records what happened (step outputs); the last step is the single place that
 * decides between the complete and fail footprint, so a crash anywhere still leaves one.
 */
function forGithubScript({ agent, github, context, core }) {
  const inputs = (context.payload && context.payload.inputs) || {};
  const reporter = createReporter({
    agent,
    runId: inputs.run_id || '',
    step: inputs.step || '',
    iteration: inputs.iteration || 1,
    runtime: inputs.runtime_name || '',
    log: {
      info: m => (core ? core.info(m) : console.log(m)),
      warn: m => (core ? core.warning(m) : console.warn(m)),
    },
    post: (issue, body) => github.rest.issues.createComment({
      owner: context.repo.owner, repo: context.repo.repo, issue_number: Number(issue), body,
    }),
  });
  const out = (k, v) => { if (core && v !== undefined && v !== null) core.setOutput(k, String(v)); };
  const runUrl = `${context.serverUrl || 'https://github.com'}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  let linkedPr = null;
  let linkedBranch = '';

  return {
    agent: reporter.agent,
    withOutcome,
    sanitize: sanitizeModelText,
    stripFootprintInstructions,

    start: d => reporter.start(d),

    /** Diff text of the PR under review; remembers the PR/branch so the footprint can name them. */
    async prContext(issueNumber) {
      const r = await loadPrContext({ github, context, issueNumber });
      linkedPr = r.prNumber;
      linkedBranch = r.branch || '';
      return r.text;
    },

    /**
     * Read a model reply: strip forged markers and the protocol lines, record the verdict.
     * Returns the text that is safe to publish plus the verdict; posts nothing.
     */
    interpret(reply) {
      const parsed = parseReply(reply);
      const outcome = parsed.outcome || 'needs-human';
      const summary = parsed.outcome
        ? parsed.summary
        : `The agent did not state an outcome (no OUTCOME line); a human must read its report. ${parsed.summary}`.trim();
      this.verdict({ outcome, summary });
      return { body: parsed.body, outcome, summary };
    },

    /** interpret() and post the cleaned reply as a comment on the issue/PR. */
    async reply({ issueNumber, reply }) {
      const r = this.interpret(reply);
      if (r.body && issueNumber) await reporter.comment(issueNumber, r.body);
      return r;
    },

    /** Record a verdict decided by code (no model prose to post). */
    verdict({ outcome, summary, pr, branch, payload }) {
      out('outcome', outcome);
      out('summary', oneLine(summary));
      out('pr', pr ?? linkedPr ?? '');
      out('branch', branch ?? linkedBranch ?? '');
      if (payload) out('payload', JSON.stringify(payload));
    },

    /** Record a failure the step handled itself, then fail the job. */
    abort(message) {
      out('error', oneLine(message));
      if (core) core.setFailed(message);
    },

    /** Final step: one complete or fail footprint, whatever happened before. */
    async conclude({ env, issueNumber, nextAction }) {
      const issue = Number(issueNumber || env.ISSUE_NUMBER);
      if (!issue) { (core ? core.info : console.log)('[agent-report] no issue/PR to report on; footprint skipped'); return false; }
      const jobOk = (env.JOB_STATUS || 'success') === 'success';
      const outcome = env.OUTCOME || '';
      const pr = env.PR_NUMBER || undefined;
      const branch = env.BRANCH || undefined;
      let payload;
      try { payload = env.PAYLOAD ? JSON.parse(env.PAYLOAD) : undefined; } catch { payload = undefined; }
      if (!jobOk) {
        return reporter.fail(
          `${env.ERROR || 'The workflow failed before the agent reported a result.'} See ${runUrl}`,
          { issueNumber: issue, pr, branch },
        );
      }
      if (!outcome) {
        return reporter.fail(`The workflow ended without a result. See ${runUrl}`, { issueNumber: issue, pr, branch });
      }
      return reporter.finish({ issueNumber: issue, outcome, summary: env.SUMMARY, pr, branch, payload, nextAction });
    },
  };
}

// ---- Posting for the CLI ------------------------------------------------------
function repoFromGit() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    return m ? `${m[1]}/${m[2]}` : '';
  } catch {
    return '';
  }
}

function restPost(repository, token, issue, body) {
  const payload = JSON.stringify({ body });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${repository}/issues/${issue}/comments`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'quorumkit-agent-report',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let buf = '';
      res.on('data', d => { buf += d; });
      res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300
        ? resolve()
        : reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`))));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function ghPost(repository, issue, body) {
  // `gh api` with the JSON body on stdin: no shell, so backticks and quotes survive untouched.
  const args = ['api', '--method', 'POST', `repos/${repository || '{owner}/{repo}'}/issues/${issue}/comments`, '--input', '-'];
  execFileSync('gh', args, { input: JSON.stringify({ body }), stdio: ['pipe', 'ignore', 'pipe'] });
}

// ---- CLI ----------------------------------------------------------------------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[k] = true;
    else { out[k] = next; i++; }
  }
  return out;
}

async function main(argv, env = process.env) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (!['start', 'complete', 'fail'].includes(cmd)) {
    console.error('usage: agent-report.cjs <start|complete|fail> --agent <name> --issue <n> [--pr <n>] [--outcome <o>] [--summary <text> | --summary-file <path> | --summary-stdin] [--dry-run]');
    return 2;
  }
  let key;
  try { key = resolveAgent(args.agent || env.AGENT); } catch (e) { console.error(`agent-report: ${e.message}`); return 2; }

  const issue = Number(args.issue || env.ISSUE_NUMBER);
  if (!issue) { console.error('agent-report: --issue (or ISSUE_NUMBER) is required'); return 2; }

  let summary = typeof args.summary === 'string' ? args.summary : '';
  if (args['summary-file']) summary = fs.readFileSync(String(args['summary-file']), 'utf8');
  if (args['summary-stdin']) summary = fs.readFileSync(0, 'utf8');

  if (args.outcome && !OUTCOMES.includes(args.outcome)) {
    console.error(`agent-report: unknown outcome "${args.outcome}" (allowed: ${OUTCOMES.join(', ')})`);
    return 2;
  }

  const repository = env.GITHUB_REPOSITORY || repoFromGit();
  const token = env.GITHUB_TOKEN || env.GH_TOKEN || '';
  const dry = !!args['dry-run'];
  const posted = [];
  const reporter = createReporter({
    agent: key,
    runId: args['run-id'] || env.RUN_ID || '',
    step: args.step || env.STEP || '',
    iteration: args.iteration || env.ITERATION || 1,
    runtime: args.runtime || env.RUNTIME_NAME || '',
    branch: args.branch,
    post: async (i, body) => {
      if (dry) { posted.push(body); console.log(body); return; }
      if (token && repository) return restPost(repository, token, i, body);
      return ghPost(repository, i, body);
    },
  });

  const common = { issueNumber: issue, pr: args.pr };
  let ok;
  if (cmd === 'start') ok = await reporter.start(common);
  else if (cmd === 'complete') {
    ok = await reporter.finish({
      ...common, outcome: args.outcome || 'success', summary, nextAction: args['next-action'],
      marker: args['no-marker'] ? false : undefined,
    });
  } else ok = await reporter.fail(summary, common);

  if (!ok) { console.error('agent-report: the comment was not posted'); return 1; }
  return 0;
}

module.exports = {
  AGENTS, OUTCOMES, VERDICTS, OUTCOME_INSTRUCTION, UNASSIGNED_RUN,
  resolveAgent, buildFootprint, buildResultMarker, parseReply, sanitizeModelText, stripFootprintInstructions, loadPrContext, withOutcome,
  createReporter, forGithubScript, parseArgs, main,
};

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(err => {
    console.error(`agent-report: ${err && err.message || err}`);
    process.exitCode = 1;
  });
}
