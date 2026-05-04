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

export async function runOrchestrator({ client, event, pipelines, owner, repo, aiTool }) {
  const { issueNumber } = event;

  // ── Handle /approve comment ─────────────────────────────────────────────
  if (event.type === 'issue_comment.created' && event.comment) {
    if (isApproveCommand(event.comment.body)) {
      await handleApproveComment({ client, event, pipelines, owner, repo, aiTool });
    }
    return;
  }

  // ── workflow_run.completed bypasses the router — it resumes an active run ──
  // The event carries no issue labels so matchEvent would never find a pipeline.
  // Instead we load state from the issue, look up the pipeline by name, and advance.
  if (event.type.startsWith('workflow_run.') && issueNumber) {
    const state = await loadState(client, owner, repo, issueNumber);
    if (state && state.status === 'awaiting-agent') {
      const pipeline = pipelines.find(p => p.name === state.pipelineName);
      if (pipeline) {
        await handleWorkflowRunCompleted({ client, event, pipeline, state, owner, repo, aiTool });
      }
    }
    return;
  }

  // ── Route incoming event to a pipeline ─────────────────────────────────
  const pipeline = matchEvent(event, pipelines);
  if (!pipeline) {
    const msg = `⚪ Event \`${event.type}\` did not match any pipeline rule. Reason: \`no-rule-match\`. No action taken.`;
    // Suppress label-noise: every label a triage agent applies fires issues.labeled
    // — these never match a pipeline rule but would flood the issue with comments.
    if (issueNumber && event.type !== 'issues.labeled') {
      await postAuditEntry(client, owner, repo, issueNumber, msg);
    } else {
      console.log(`[orchestrator] ${msg}`);
    }
    return;
  }

  // ── Load existing state ─────────────────────────────────────────────────
  let state = await loadState(client, owner, repo, issueNumber);

  // ── Suppress issues.labeled on an active run ────────────────────────────
  if (event.type === 'issues.labeled' && state &&
      state.status !== 'completed' && state.status !== 'failed' && state.status !== 'timed-out') {
    console.log(`[orchestrator] Suppressing issues.labeled on active run ${state.runId}`);
    return;
  }

  if (!state) {
    state = newRunState(pipeline, event.type);
    await saveState(
      client, owner, repo, issueNumber, state,
      `🚀 Pipeline **${pipeline.name}** started (run \`${state.runId}\`). Trigger: \`${event.type}\`.`
    );
  }

  if (state.status === 'completed' || state.status === 'timed-out' || state.status === 'failed') {
    return;
  }

  await advancePipeline({ client, event, pipeline, state, owner, repo, aiTool });
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function advancePipeline({ client, event, pipeline, state, owner, repo, aiTool }) {
  const { issueNumber, ref } = event;
  const step = pipeline.steps[state.currentStepIndex];

  if (!step) {
    state.status = 'completed';
    state.updatedAt = now();
    await saveState(client, owner, repo, issueNumber, state,
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
    await saveState(client, owner, repo, issueNumber, state,
      `🔐 Approval required before step **${step.name}**.\n\nPost \`/approve\` to continue. Gate expires at \`${timeoutAt}\`.`
    );
    return;
  }

  // ── Timeout check ───────────────────────────────────────────────────────
  if (state.status === 'awaiting-approval' && checkApprovalTimeout(state.approvalGate)) {
    state.status = 'timed-out';
    state.updatedAt = now();
    await saveState(client, owner, repo, issueNumber, state,
      `⏰ Approval gate for step **${step.name}** timed out. Pipeline run \`${state.runId}\` is now \`timed-out\`. No further agents will be invoked.`
    );
    return;
  }

  // ── Invoke the agent ────────────────────────────────────────────────────
  state.status = 'running';
  state.steps[state.currentStepIndex].status = 'running';
  state.steps[state.currentStepIndex].startedAt = now();
  state.updatedAt = now();
  await saveState(client, owner, repo, issueNumber, state,
    `⚙️ Invoking agent **${step.agent}** (step \`${step.name}\`, ${state.currentStepIndex + 1}/${pipeline.steps.length}).`
  );

  try {
    await invokeAgent(client, owner, repo, step.agent, issueNumber, ref ?? 'main', aiTool);
  } catch (err) {
    const isInvalidTool = err.message.includes('INVALID_AI_TOOL');
    state.status = 'failed';
    state.steps[state.currentStepIndex].status = 'failed';
    state.steps[state.currentStepIndex].completedAt = now();
    state.updatedAt = now();
    await saveState(client, owner, repo, issueNumber, state,
      `❌ Pipeline **${state.pipelineName}** failed at step **${step.name}**.\n\nError: ${err.message}\n\n` +
      (isInvalidTool ? 'Fix the `aiTool` value in `.apm-project.json` and re-trigger the pipeline.' : 'No further agents will be invoked.')
    );
    return;
  }

  // ── Pause — wait for workflow_run.completed before advancing ───────────
  // Prevents instant fake "completed" pipelines. The next step runs only after
  // the agent's GHA workflow finishes and triggers a workflow_run event.
  state.status = 'awaiting-agent';
  state.steps[state.currentStepIndex].status = 'awaiting-agent';
  state.updatedAt = now();
  await saveState(client, owner, repo, issueNumber, state,
    `⏳ Waiting for agent **${step.agent}** to complete (step \`${step.name}\`, ${state.currentStepIndex + 1}/${pipeline.steps.length}).`
  );
}

/**
 * Handle workflow_run.completed: match to the awaiting-agent step, mark it done,
 * advance the pipeline.
 */
async function handleWorkflowRunCompleted({ client, event, pipeline, state, owner, repo, aiTool }) {
  const { issueNumber, ref } = event;
  if (state.status !== 'awaiting-agent') return;

  const step = pipeline.steps[state.currentStepIndex];
  if (!step) return;

  // Only advance if the workflow name matches the expected agent
  if (event.workflowName && !event.workflowName.toLowerCase().includes(step.agent.toLowerCase())) {
    console.log(`[orchestrator] workflow_run.completed for '${event.workflowName}' does not match expected '${step.agent}' — ignoring`);
    return;
  }

  const outcome = event.workflowConclusion ?? 'unknown';

  if (outcome === 'failure' || outcome === 'cancelled') {
    state.status = 'failed';
    state.steps[state.currentStepIndex].status = 'failed';
    state.steps[state.currentStepIndex].completedAt = now();
    state.steps[state.currentStepIndex].outcome = outcome;
    state.updatedAt = now();
    await saveState(client, owner, repo, issueNumber, state,
      `❌ Agent **${step.agent}** workflow finished with \`${outcome}\`. Pipeline **${state.pipelineName}** is now \`failed\`.`
    );
    return;
  }

  state.steps[state.currentStepIndex].status = 'completed';
  state.steps[state.currentStepIndex].completedAt = now();
  state.steps[state.currentStepIndex].outcome = outcome;
  state.currentStepIndex += 1;
  state.status = 'running';
  state.updatedAt = now();
  await saveState(client, owner, repo, issueNumber, state,
    `✅ Agent **${step.agent}** completed (step \`${step.name}\`).`
  );

  await advancePipeline({ client, event, pipeline, state, owner, repo, aiTool });
}

async function handleApproveComment({ client, event, pipelines, owner, repo, aiTool }) {
  const { issueNumber } = event;
  const username = event.comment.user;

  const state = await loadState(client, owner, repo, issueNumber);
  if (!state || state.status !== 'awaiting-approval') return;

  const pipeline = pipelines.find(p => p.name === state.pipelineName);
  if (!pipeline) return;

  const hasPermission = await verifyApproverPermission(client, owner, repo, username);
  if (!hasPermission) {
    await postAuditEntry(client, owner, repo, issueNumber,
      `🚫 Approval from @${username} rejected — insufficient repository permissions (requires \`write\`, \`maintain\`, or \`admin\`). Gate remains open.`
    );
    return;
  }

  state.status = 'running';
  state.approvalGate.approvedBy = username;
  state.updatedAt = now();
  await saveState(client, owner, repo, issueNumber, state,
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

  let aiTool = 'copilot';
  const projectConfigPath = path.join(process.cwd(), '.apm-project.json');
  if (existsSync(projectConfigPath)) {
    try {
      const cfg = JSON.parse(await readFile(projectConfigPath, 'utf8'));
      if (cfg.aiTool) aiTool = cfg.aiTool;
    } catch { /* use default */ }
  }

  const pipelinesDir = path.join(process.cwd(), '.apm', 'pipelines');
  const { valid: pipelines, errors } = await loadPipelines(pipelinesDir);
  for (const err of errors) {
    console.error(`[orchestrator] Pipeline validation error: ${err.file} — ${err.message}`);
  }

  const client = createGitHubClient(token);
  await runOrchestrator({ client, event, pipelines, owner, repo, aiTool });
  await broadcastToDashboard(event.issueNumber, owner, repo, client);
}

async function broadcastToDashboard(issueNumber, owner, repo, client) {
  const webhookUrl = process.env.DASHBOARD_WEBHOOK_URL;
  if (!webhookUrl || !issueNumber) return;
  try {
    const state = await loadState(client, owner, repo, issueNumber);
    if (!state) return;
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!res.ok) console.warn(`[orchestrator] Dashboard webhook returned ${res.status}`);
  } catch (err) {
    console.warn(`[orchestrator] Dashboard broadcast failed: ${err.message}`);
  }
}

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
      return {
        type: `workflow_run.${payload.action}`,
        labels,
        issueNumber,
        ref,
        workflowName: payload.workflow_run?.name ?? null,
        workflowConclusion: payload.workflow_run?.conclusion ?? null,
      };
    default:
      return null;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch(err => {
    console.error('[orchestrator] Fatal error:', err);
    process.exit(1);
  });
}
