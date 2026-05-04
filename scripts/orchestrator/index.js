/**
 * index.js
 * Main Orchestrator entry point (FR-001 through FR-016).
 *
 * Exported `runOrchestrator` is the testable core.
 * The bottom of this file is the CLI entry point for GHA.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import { loadPipelines } from './pipeline-loader.js';
import { matchEvent } from './router.js';
import { loadState, saveState, postAuditEntry } from './state-manager.js';
import { invokeAgent } from './agent-invoker.js';
import { isApproveCommand, checkApprovalTimeout, verifyApproverPermission } from './approval-gate.js';
import { createGitHubClient } from './github-client.js';

const APPROVAL_TIMEOUT_DEFAULT_HOURS = 72;

// ─── Exported core (fully testable with injected dependencies) ───────────────

/**
 * Run one orchestrator cycle.
 *
 * @param {{
 *   client: object,
 *   event: { type: string, labels: string[], issueNumber: number, ref: string, comment?: {body:string, user:string} },
 *   pipelines: Pipeline[],
 *   owner: string,
 *   repo: string,
 *   aiTool: string | undefined,
 * }} opts
 */
export async function runOrchestrator({ client, event, pipelines, owner, repo, aiTool }) {
  const { issueNumber, ref } = event;

  // ── Handle /approve comment ─────────────────────────────────────────────
  if (event.type === 'issue_comment.created' && event.comment) {
    if (isApproveCommand(event.comment.body)) {
      await handleApproveComment({ client, event, pipelines, owner, repo, aiTool });
      return;
    }
    // Non-/approve comment — nothing to do
    return;
  }

  // ── Route incoming event to a pipeline ─────────────────────────────────
  const pipeline = matchEvent(event, pipelines);
  if (!pipeline) {
    const msg = `⚪ Event \`${event.type}\` did not match any pipeline rule. Reason: \`no-rule-match\`. No action taken.`;
    // Only post a comment when there is an issue/PR to comment on.
    // Events like workflow_run.completed carry no issueNumber — log only.
    if (issueNumber) {
      await postAuditEntry(client, owner, repo, issueNumber, msg);
    } else {
      console.log(`[orchestrator] ${msg}`);
    }
    return;
  }

  // ── Load existing state (restart-safe, FR-015) ──────────────────────────
  let state = await loadState(client, owner, repo, issueNumber);

  if (!state) {
    // Brand-new pipeline run
    state = newRunState(pipeline, event.type);
    await saveState(client, owner, repo, issueNumber, state);
    await postAuditEntry(
      client, owner, repo, issueNumber,
      `🚀 Pipeline **${pipeline.name}** started (run \`${state.runId}\`). ` +
      `Trigger: \`${event.type}\`.`
    );
  }

  if (state.status === 'completed' || state.status === 'timed-out' || state.status === 'failed') {
    return; // Terminal state — do nothing
  }

  // ── Advance the pipeline ────────────────────────────────────────────────
  await advancePipeline({ client, event, pipeline, state, owner, repo, aiTool });
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function advancePipeline({ client, event, pipeline, state, owner, repo, aiTool }) {
  const { issueNumber, ref } = event;
  const step = pipeline.steps[state.currentStepIndex];

  if (!step) {
    // All steps done
    state.status = 'completed';
    state.updatedAt = now();
    await saveState(client, owner, repo, issueNumber, state);
    await postAuditEntry(client, owner, repo, issueNumber,
      `✅ Pipeline **${state.pipelineName}** completed successfully (run \`${state.runId}\`).`
    );
    return;
  }

  // ── Approval gate check ─────────────────────────────────────────────────
  if (step.approval === 'required' && state.status !== 'awaiting-approval') {
    const timeoutHours = step.approval_timeout_hours ?? APPROVAL_TIMEOUT_DEFAULT_HOURS;
    const timeoutAt = new Date(Date.now() + timeoutHours * 3600 * 1000).toISOString();
    state.status = 'awaiting-approval';
    state.approvalGate = { requestedAt: now(), timeoutAt, approvedBy: null };
    state.updatedAt = now();
    await saveState(client, owner, repo, issueNumber, state);
    await postAuditEntry(
      client, owner, repo, issueNumber,
      `🔐 Approval required before step **${step.name}**.\n\n` +
      `Post \`/approve\` to continue. Gate expires at \`${timeoutAt}\`.`
    );
    return;
  }

  // ── Timeout check ───────────────────────────────────────────────────────
  if (state.status === 'awaiting-approval' && checkApprovalTimeout(state.approvalGate)) {
    state.status = 'timed-out';
    state.updatedAt = now();
    await saveState(client, owner, repo, issueNumber, state);
    await postAuditEntry(
      client, owner, repo, issueNumber,
      `⏰ Approval gate for step **${step.name}** timed out. ` +
      `Pipeline run \`${state.runId}\` is now \`timed-out\`. No further agents will be invoked.`
    );
    return;
  }

  // ── Invoke the agent ────────────────────────────────────────────────────
  state.status = 'running';
  if (!state.steps[state.currentStepIndex]) {
    state.steps[state.currentStepIndex] = {
      name: step.name, status: 'running',
      startedAt: now(), completedAt: null, outcome: null,
    };
  } else {
    state.steps[state.currentStepIndex].status = 'running';
    state.steps[state.currentStepIndex].startedAt = now();
  }
  state.updatedAt = now();
  await saveState(client, owner, repo, issueNumber, state);
  await postAuditEntry(
    client, owner, repo, issueNumber,
    `⚙️ Invoking agent **${step.agent}** (step \`${step.name}\`, ` +
    `${state.currentStepIndex + 1}/${pipeline.steps.length}).`
  );

  try {
    await invokeAgent(client, owner, repo, step.agent, issueNumber, ref ?? 'main', aiTool);
  } catch (err) {
    const isInvalidTool = err.message.includes('INVALID_AI_TOOL');
    state.status = 'failed';
    state.updatedAt = now();
    await saveState(client, owner, repo, issueNumber, state);
    await postAuditEntry(
      client, owner, repo, issueNumber,
      `❌ Pipeline **${state.pipelineName}** failed at step **${step.name}**.\n\n` +
      `Error: ${err.message}\n\n` +
      (isInvalidTool
        ? 'Fix the `aiTool` value in `.apm-project.json` and re-trigger the pipeline.'
        : 'No further agents will be invoked.')
    );
  }
}

async function handleApproveComment({ client, event, pipelines, owner, repo, aiTool }) {
  const { issueNumber, ref } = event;
  const username = event.comment.user;

  const state = await loadState(client, owner, repo, issueNumber);
  if (!state || state.status !== 'awaiting-approval') return;

  // Find the matching pipeline definition
  const pipeline = pipelines.find(p => p.name === state.pipelineName);
  if (!pipeline) return;

  // Verify permission
  const hasPermission = await verifyApproverPermission(client, owner, repo, username);
  if (!hasPermission) {
    await postAuditEntry(
      client, owner, repo, issueNumber,
      `🚫 Approval from @${username} rejected — insufficient repository permissions ` +
      `(requires \`write\`, \`maintain\`, or \`admin\`). Gate remains open.`
    );
    return;
  }

  // Resume
  state.status = 'running';
  state.approvalGate.approvedBy = username;
  state.updatedAt = now();
  await saveState(client, owner, repo, issueNumber, state);
  await postAuditEntry(
    client, owner, repo, issueNumber,
    `✅ Approval granted by @${username}. Resuming pipeline **${state.pipelineName}**.`
  );

  await advancePipeline({ client, event, pipeline, state, owner, repo, aiTool });
}

function newRunState(pipeline, triggerEvent) {
  return {
    runId: randomUUID(),
    pipelineName: pipeline.name,
    triggerEvent,
    status: 'pending',
    currentStepIndex: 0,
    steps: pipeline.steps.map(s => ({
      name: s.name,
      status: 'pending',
      startedAt: null,
      completedAt: null,
      outcome: null,
    })),
    approvalGate: { requestedAt: null, timeoutAt: null, approvedBy: null },
    updatedAt: now(),
  };
}

function now() {
  return new Date().toISOString();
}

// ─── CLI entry point (invoked by GHA workflow) ────────────────────────────────

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPOSITORY ?? '';
  const [owner, repo] = repoFull.split('/');
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const eventPath = process.env.GITHUB_EVENT_PATH ?? '';

  if (!token || !owner || !repo) {
    console.error('[orchestrator] Missing GITHUB_TOKEN or GITHUB_REPOSITORY');
    process.exit(1);
  }

  let rawEvent = {};
  if (eventPath && existsSync(eventPath)) {
    rawEvent = JSON.parse(await readFile(eventPath, 'utf8'));
  }

  const event = normaliseEvent(eventName, rawEvent);
  if (!event) {
    console.log(`[orchestrator] Unsupported event type: ${eventName} — skipping`);
    return;
  }

  // Load aiTool from .apm-project.json
  let aiTool = 'copilot';
  const projectConfigPath = path.join(process.cwd(), '.apm-project.json');
  if (existsSync(projectConfigPath)) {
    try {
      const cfg = JSON.parse(await readFile(projectConfigPath, 'utf8'));
      if (cfg.aiTool) aiTool = cfg.aiTool;
    } catch { /* use default */ }
  }

  // Load pipelines
  const pipelinesDir = path.join(process.cwd(), '.apm', 'pipelines');
  const { valid: pipelines, errors } = await loadPipelines(pipelinesDir);
  for (const err of errors) {
    console.error(`[orchestrator] Pipeline validation error: ${err.file} — ${err.message}`);
  }

  const client = createGitHubClient(token);

  await runOrchestrator({ client, event, pipelines, owner, repo, aiTool });

  // Optionally broadcast to dashboard (FR-007)
  await broadcastToDashboard(event.issueNumber, owner, repo, client);
}

async function broadcastToDashboard(issueNumber, owner, repo, client) {
  const webhookUrl = process.env.DASHBOARD_WEBHOOK_URL;
  if (!webhookUrl) return; // silently skipped per FR-007
  if (!issueNumber) return; // no issue context — nothing to broadcast

  try {
    const state = await loadState(client, owner, repo, issueNumber);
    if (!state) return;

    const payload = JSON.stringify(state);
    // Use Node built-in fetch (Node 18+)
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (!res.ok) {
      console.warn(`[orchestrator] Dashboard webhook returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`[orchestrator] Dashboard broadcast failed: ${err.message}`);
  }
}

/**
 * Normalise a raw GitHub event payload into the internal event shape.
 * Returns null for unsupported event types.
 */
function normaliseEvent(eventName, payload) {
  const issue = payload.issue ?? payload.pull_request;
  const issueNumber = issue?.number ?? payload.number;
  const labels = (issue?.labels ?? []).map(l => (typeof l === 'string' ? l : l.name));
  const ref = payload.repository?.default_branch ?? 'main';

  switch (eventName) {
    case 'issues':
      return { type: `issues.${payload.action}`, labels, issueNumber, ref };
    case 'pull_request':
      return { type: `pull_request.${payload.action}`, labels, issueNumber, ref };
    case 'issue_comment':
      return {
        type: `issue_comment.${payload.action}`,
        labels,
        issueNumber,
        ref,
        comment: payload.comment
          ? { body: payload.comment.body, user: payload.comment.user?.login ?? '' }
          : undefined,
      };
    case 'workflow_run':
      return { type: `workflow_run.${payload.action}`, labels, issueNumber, ref };
    default:
      return null;
  }
}

// Run CLI only when invoked directly (not when imported in tests)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch(err => {
    console.error('[orchestrator] Fatal error:', err);
    process.exit(1);
  });
}
