#!/usr/bin/env node
/**
 * dev-agent-runner.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared agentic runner for the Developer Agent.
 *
 * Invoked from:
 *   • .github/workflows/copilot-agent-dev.yml  (RUNTIME_KIND=copilot)
 *   • .github/workflows/agent-dev.yml          (RUNTIME_KIND=claude)
 *
 * Reads the same manifests used by manually-invoked agents, so behaviour is
 * identical regardless of trigger source:
 *   • .apm/agents/developer-agent.md
 *   • .apm/skills/dev-agent/SKILL.md
 *   • .specify/memory/constitution.md
 *
 * Tool surface (passed to the LLM as agentic tools):
 *   read_file, list_directory, write_file, run_command,
 *   git_commit, open_pull_request, post_issue_comment, signal_outcome
 *
 * Required env:
 *   RUNTIME_KIND        — 'copilot' | 'claude'
 *   GITHUB_TOKEN        — repo token (used for GitHub API + GitHub Models)
 *   GITHUB_REPOSITORY   — 'owner/repo' (provided by GHA)
 *   ISSUE_NUMBER        — issue or PR number triggering this agent
 *
 * Optional env:
 *   ANTHROPIC_API_KEY   — required when RUNTIME_KIND=claude
 *   RUN_ID              — orchestrator run id (apm-msg context)
 *   STEP                — pipeline step name (default 'dev')
 *   ITERATION           — pipeline iteration (default '1')
 *   RUNTIME_NAME        — the named runtime entry from .apm/runtimes.yml
 *   MAX_ITERATIONS      — agentic loop cap (default 20)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────────────────
const RUNTIME_KIND   = (process.env.RUNTIME_KIND || 'copilot').toLowerCase();
const ISSUE_NUMBER   = Number(process.env.ISSUE_NUMBER);
const [OWNER, REPO]  = (process.env.GITHUB_REPOSITORY || '/').split('/');
const RUN_ID         = process.env.RUN_ID || '';
const STEP           = process.env.STEP   || 'dev';
const ITERATION      = process.env.ITERATION || '1';
const RUNTIME_NAME   = process.env.RUNTIME_NAME || '';
const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS || 20);

if (!ISSUE_NUMBER || !OWNER || !REPO || !process.env.GITHUB_TOKEN) {
  console.error('FATAL: required env vars missing (GITHUB_TOKEN, GITHUB_REPOSITORY, ISSUE_NUMBER).');
  process.exit(2);
}
if (!['copilot', 'claude'].includes(RUNTIME_KIND)) {
  console.error(`FATAL: unsupported RUNTIME_KIND "${RUNTIME_KIND}" (allowed: copilot, claude).`);
  process.exit(2);
}
if (RUNTIME_KIND === 'claude' && !process.env.ANTHROPIC_API_KEY) {
  console.error('FATAL: RUNTIME_KIND=claude requires ANTHROPIC_API_KEY.');
  process.exit(2);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: 120_000, ...opts }).trim();
  } catch (e) {
    return `ERROR: ${(e.stderr || e.stdout || e.message || '').toString().slice(0, 4000)}`;
  }
}

function httpsRequest({ hostname, path, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ghApi(pathname, { method = 'GET', body = null } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const res = await httpsRequest({
    hostname: 'api.github.com',
    path: pathname,
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      'User-Agent': 'QuorumKit-DevAgent/1.0',
      Accept: 'application/vnd.github+json',
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
    },
    body: payload,
  });
  try { return { status: res.status, data: JSON.parse(res.body || '{}') }; }
  catch { return { status: res.status, data: { _raw: res.body } }; }
}

// ─── Manifest loading (single source of truth) ──────────────────────────────
const manifests = {
  agent:        readSafe('.apm/agents/developer-agent.md'),
  skill:        readSafe('.apm/skills/dev-agent/SKILL.md'),
  constitution: readSafe('.specify/memory/constitution.md'),
};

// ─── Tool definitions (shared shape; runtimes adapt to API differences) ─────
const toolDefs = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the repository.',
    schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a given path.',
    schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file in the repository (sandboxed to repo root).',
    schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
  {
    name: 'run_command',
    description: 'Run a shell command (e.g. npm test, npm run lint). Returns stdout+stderr.',
    schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
  {
    name: 'git_commit',
    description: 'Stage all changes and create a git commit on the current branch.',
    schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
  },
  {
    name: 'open_pull_request',
    description: 'Push the current branch and open a pull request.',
    schema: {
      type: 'object',
      properties: { branch: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } },
      required: ['branch', 'title', 'body'],
    },
  },
  {
    name: 'post_issue_comment',
    description: 'Post a regular markdown comment on the source issue.',
    schema: { type: 'object', properties: { body: { type: 'string' } }, required: ['body'] },
  },
  {
    name: 'signal_outcome',
    description: 'Signal the final outcome to the orchestrator and end the agent loop.',
    schema: {
      type: 'object',
      properties: {
        outcome: { type: 'string', enum: ['success', 'fail', 'needs-human', 'blocker'] },
        summary: { type: 'string' },
        pr_url:  { type: 'string' },
      },
      required: ['outcome', 'summary'],
    },
  },
];

// ─── Tool executor ──────────────────────────────────────────────────────────
let prUrl = '';
let finalOutcome = null; // populated by signal_outcome
const repoRoot = process.cwd();

async function executeTool(name, input) {
  switch (name) {
    case 'read_file': {
      const content = readSafe(input.path);
      return content || `(file not found or empty: ${input.path})`;
    }
    case 'list_directory': {
      return exec(`ls -la "${input.path}"`);
    }
    case 'write_file': {
      const resolved = path.resolve(input.path);
      if (!resolved.startsWith(repoRoot + path.sep) && resolved !== repoRoot) {
        return `ERROR: path outside repo root rejected: ${input.path}`;
      }
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, input.content, 'utf8');
      return `Wrote ${input.path} (${input.content.length} bytes)`;
    }
    case 'run_command': {
      const blocked = /(rm\s+-rf\s+\/|drop\s+table|format\s+c:|mkfs|:\s*\(\)\s*\{)/i;
      if (blocked.test(input.command)) return 'ERROR: command blocked by safety guard.';
      return exec(input.command);
    }
    case 'git_commit': {
      exec('git add -A');
      return exec(`git commit -m ${JSON.stringify(input.message)} --allow-empty`);
    }
    case 'open_pull_request': {
      const branch = input.branch.replace(/[^a-zA-Z0-9/_-]/g, '-');
      exec(`git checkout -b "${branch}" 2>/dev/null || git checkout "${branch}"`);
      exec('git add -A');
      exec(`git commit -m ${JSON.stringify('chore(dev-agent): apply changes')} --allow-empty`);
      const pushOut = exec(`git push origin "${branch}" --force-with-lease`);
      if (pushOut.startsWith('ERROR:')) return `push failed: ${pushOut}`;

      const body = `${input.body}\n\nCloses #${ISSUE_NUMBER}`;
      const ghOut = exec(
        `gh pr create --title ${JSON.stringify(input.title)} --body ${JSON.stringify(body)} --head "${branch}" --base main`
      );
      if (!ghOut.startsWith('ERROR:')) {
        prUrl = ghOut;
        const m = ghOut.match(/\/pull\/(\d+)/);
        if (m) exec(`gh pr edit ${m[1]} --add-label "agent:reviewer"`);
        return `PR opened: ${ghOut}`;
      }
      // Fallback to REST API
      const pr = await ghApi(`/repos/${OWNER}/${REPO}/pulls`, {
        method: 'POST',
        body: { title: input.title, body, head: branch, base: 'main' },
      });
      if (pr.status >= 200 && pr.status < 300) {
        prUrl = pr.data.html_url || '';
        if (pr.data.number) {
          await ghApi(`/repos/${OWNER}/${REPO}/issues/${pr.data.number}/labels`, {
            method: 'POST', body: { labels: ['agent:reviewer'] },
          });
        }
        return `PR opened (REST): ${prUrl}`;
      }
      return `ERROR: PR creation failed (gh CLI: ${ghOut}; REST status ${pr.status}: ${JSON.stringify(pr.data).slice(0, 300)})`;
    }
    case 'post_issue_comment': {
      const r = await ghApi(`/repos/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}/comments`, {
        method: 'POST', body: { body: input.body },
      });
      return r.status >= 200 && r.status < 300 ? 'Comment posted.' : `ERROR: ${r.status}`;
    }
    case 'signal_outcome': {
      finalOutcome = input.outcome;
      const apmMsg = [
        `**[QuorumKit Orchestrator]** Developer Agent (${RUNTIME_KIND}) -- outcome: \`${input.outcome}\``,
        '',
        input.summary,
        input.pr_url || prUrl ? `\nPR: ${input.pr_url || prUrl}` : '',
        RUN_ID
          ? `\n<!-- apm:run_id=${RUN_ID} step=${STEP} iteration=${ITERATION} runtime=${RUNTIME_NAME || RUNTIME_KIND} outcome=${input.outcome} -->`
          : '',
      ].join('\n').trim();
      const r = await ghApi(`/repos/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}/comments`, {
        method: 'POST', body: { body: apmMsg },
      });
      return r.status >= 200 && r.status < 300 ? `Outcome ${input.outcome} signalled.` : `ERROR: ${r.status}`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── System prompt (built from manifests) ───────────────────────────────────
function buildSystemPrompt() {
  return [
    manifests.agent        && `## Developer Agent Manifest\n${manifests.agent}`,
    manifests.skill        && `## Activation Skill\n${manifests.skill}`,
    manifests.constitution && `## Project Constitution\n${manifests.constitution}`,
    `## Runtime Context`,
    `You are running inside a GitHub Actions workflow. The repository is checked out`,
    `at the current working directory with full read/write access. You have tools to`,
    `read/write files, run commands, commit, push branches, and open pull requests.`,
    ``,
    `Branch naming: zero-pad the issue number to 3 digits (e.g. issue 78 -> "078-short-slug").`,
    `MUST NOT commit to \`main\`. MUST NOT open a PR while tests are failing.`,
    `Follow TDD: write a failing test first, then implement, then verify tests pass.`,
    `When done, call \`signal_outcome\` with one of: success, fail, needs-human, blocker.`,
    `If the task is complete and PR is open, call signal_outcome(outcome="success").`,
  ].filter(Boolean).join('\n\n');
}

// ─── User message (issue context) ───────────────────────────────────────────
async function buildUserMessage() {
  const { data: issue } = await ghApi(`/repos/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}`);
  return [
    `You are the Developer Agent. Resolve issue #${ISSUE_NUMBER}.`,
    ``,
    `**Title:** ${issue.title || ''}`,
    ``,
    `**Body:**`,
    issue.body || '(no body)',
    ``,
    `Start by reading the relevant files referenced in the issue, write a failing test,`,
    `implement the fix, verify tests pass, then open a PR. Finally call signal_outcome.`,
  ].join('\n');
}

// ─── Runtime adapters ───────────────────────────────────────────────────────
async function runCopilot({ system, user }) {
  // GitHub Models tool-calling format mirrors OpenAI's.
  const tools = toolDefs.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.schema },
  }));
  const messages = [
    { role: 'system', content: system },
    { role: 'user',   content: user },
  ];

  for (let i = 0; i < MAX_ITERATIONS && finalOutcome === null; i++) {
    console.log(`[runner] iteration ${i + 1} (copilot)`);
    const body = JSON.stringify({
      model: 'gpt-4o',
      messages,
      tools,
      max_tokens: 4096,
    });
    const res = await httpsRequest({
      hostname: 'models.inference.ai.azure.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    });
    if (res.status !== 200) {
      console.error(`[runner] Models API ${res.status}: ${res.body.slice(0, 500)}`);
      return;
    }
    const data    = JSON.parse(res.body);
    const message = data.choices?.[0]?.message;
    if (!message) { console.error('[runner] no message in response'); return; }

    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log('[runner] no tool calls; finishing');
      return;
    }
    for (const call of message.tool_calls) {
      const args = (() => { try { return JSON.parse(call.function.arguments); } catch { return {}; } })();
      console.log(`[runner] tool ${call.function.name}: ${JSON.stringify(args).slice(0, 160)}`);
      const result = await executeTool(call.function.name, args);
      console.log(`[runner]   result: ${String(result).slice(0, 200)}`);
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(result).slice(0, 8000) });
    }
  }
}

async function runClaude({ system, user }) {
  const tools = toolDefs.map(t => ({ name: t.name, description: t.description, input_schema: t.schema }));
  let messages = [{ role: 'user', content: user }];

  for (let i = 0; i < MAX_ITERATIONS && finalOutcome === null; i++) {
    console.log(`[runner] iteration ${i + 1} (claude)`);
    const body = JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system,
      tools,
      messages,
    });
    const res = await httpsRequest({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    });
    if (res.status !== 200) {
      console.error(`[runner] Anthropic API ${res.status}: ${res.body.slice(0, 500)}`);
      return;
    }
    const data = JSON.parse(res.body);
    messages.push({ role: 'assistant', content: data.content });

    if (data.stop_reason === 'end_turn') { console.log('[runner] end_turn'); return; }
    if (data.stop_reason !== 'tool_use')  return;

    const toolResults = [];
    for (const block of data.content) {
      if (block.type !== 'tool_use') continue;
      console.log(`[runner] tool ${block.name}: ${JSON.stringify(block.input).slice(0, 160)}`);
      const result = await executeTool(block.name, block.input);
      console.log(`[runner]   result: ${String(result).slice(0, 200)}`);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: String(result).slice(0, 8000) });
    }
    messages.push({ role: 'user', content: toolResults });
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────
(async () => {
  // Configure git identity for any commits the runner makes.
  exec('git config user.name  "github-actions[bot]"');
  exec('git config user.email "github-actions[bot]@users.noreply.github.com"');

  const system = buildSystemPrompt();
  const user   = await buildUserMessage();

  console.log(`[runner] runtime=${RUNTIME_KIND} runtime_name=${RUNTIME_NAME} issue=#${ISSUE_NUMBER} step=${STEP}`);

  if (RUNTIME_KIND === 'copilot') await runCopilot({ system, user });
  else                            await runClaude({  system, user });

  // If the agent never signalled an outcome, post a fail-safe one so the
  // orchestrator doesn't hang.
  if (finalOutcome === null) {
    console.warn('[runner] agent did not signal an outcome; defaulting to needs-human');
    await executeTool('signal_outcome', {
      outcome: 'needs-human',
      summary: 'Agent finished without signalling an outcome (max iterations reached or LLM ended turn early).',
    });
  }

  console.log(`[runner] final outcome: ${finalOutcome}`);
  process.exitCode = finalOutcome === 'success' ? 0 : 1;
})().catch(err => {
  console.error('[runner] FATAL:', err && err.stack || err);
  process.exit(1);
});
