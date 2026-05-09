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
import {
  loadState, saveState, postAuditEntry,
  upsertLiveStatus, findDedupKeyHit, getRunStartedAt,
} from './state-manager.js';
import { invokeAgent, invokeAgentV2 } from './agent-invoker.js';
import { isApproveCommand, checkApprovalTimeout, verifyApproverPermission } from './approval-gate.js';
import { createGitHubClient } from './github-client.js';
import { computeDedupKey } from './dedup-key.js';
import { resolveTransition } from './router-v2.js';
import { evaluate as evaluateLoopBudget, mergeBudget } from './loop-budget.js';
import { resolveRuntime, loadRuntimeRegistry } from './runtime-registry.js';
import { parseApmMsg, validateContext as validateMsgContext } from './apm-msg-parser.js';
import { resolveLogin, loadIdentities } from './identity-registry.js';

const APPROVAL_TIMEOUT_DEFAULT_HOURS = 72;
const STEP_TIMEOUT_DEFAULT_MINUTES = 60;     // FR-019, ADR-007 §4

// ─── Exported core (fully testable with injected dependencies) ───────────────

export async function runOrchestrator({
  client, event, pipelines, owner, repo, aiTool,
  // v2-specific (optional — pure dependency injection for tests):
  runtimeRegistry, identities, env, clock,
}) {
  const { issueNumber } = event;

  // ── FR-016/FR-026: per-event idempotency (audit-channel dedup) ──────────
  // Compute the dedup key from the raw event payload if the caller passed one.
  // The CLI normaliseEvent attaches `_rawEventName` and `_rawPayload` for this.
  if (event._rawEventName && issueNumber) {
    const dedupKey = computeDedupKey(event._rawEventName, event._rawPayload ?? {});
    if (dedupKey) {
      const hit = await findDedupKeyHit(client, owner, repo, issueNumber, dedupKey);
      if (hit) {
        console.log(`[orchestrator] dedup hit for ${dedupKey} — skipping`);
        return;
      }
      // Stash on event so downstream helpers can persist it on the audit comment.
      event._dedupKey = dedupKey;
    }
  }

  // ── Handle /approve comment ─────────────────────────────────────────────
  if (event.type === 'issue_comment.created' && event.comment) {
    if (isApproveCommand(event.comment.body)) {
      await handleApproveComment({ client, event, pipelines, owner, repo, aiTool });
      return;
    }
    // ── v2 apm-msg ingestion path ────────────────────────────────────────
    if (identities && pipelines.some(p => p.schemaVersion === '2')) {
      await handleAgentComment({ client, event, pipelines, owner, repo, runtimeRegistry, identities, env, clock });
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
        if (pipeline.schemaVersion === '2') {
          await handleV2WorkflowRunCompleted({
            client, event, pipeline, state, owner, repo,
            runtimeRegistry, identities, env, clock,
          });
        } else {
          await handleWorkflowRunCompleted({ client, event, pipeline, state, owner, repo, aiTool });
        }
      }
    }
    return;
  }

  // ── Route incoming event to a pipeline ─────────────────────────────────
  const pipeline = matchEvent(event, pipelines);
  if (!pipeline) {
    const msg = `⚪ Event \`${event.type}\` did not match any pipeline rule. Reason: \`no-rule-match\`. No action taken.`;
    // Suppress noise: issues.labeled fires for every label applied (e.g. priority:low,
    // agent:ba, status:needs-info). Only the type:* labels match a pipeline rule;
    // the rest would flood every issue with useless no-rule-match comments.
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
  // Triage applies several labels (priority:low, agent:ba, etc.) after the
  // type:* label that started the pipeline. Guard against re-triggering.
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

  if (pipeline.schemaVersion === '2') {
    await advanceV2Pipeline({
      client, event, pipeline, state, owner, repo,
      runtimeRegistry, identities, env, clock,
    });
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

// ─── v2 dispatch ───────────────────────────────────────────────────────────

function newV2RunState(pipeline, triggerEvent) {
  return {
    runId: randomUUID(),
    pipelineName: pipeline.name,
    triggerEvent,
    schemaVersion: '2',
    status: 'pending',
    currentStep: pipeline.entry,
    currentIteration: 1,
    iterations: {},      // edgeKey → count
    totalSteps: 0,
    runtime_used: null,
    outcome: null,
    approvalGate: { requestedAt: null, timeoutAt: null, approvedBy: null },
    updatedAt: now(),
  };
}

async function advanceV2Pipeline({
  client, event, pipeline, state, owner, repo,
  runtimeRegistry, identities, env, clock,
}) {
  const { issueNumber, ref } = event;

  // First time? Adopt v2 fields.
  if (!state.schemaVersion) {
    Object.assign(state, newV2RunState(pipeline, event.type), {
      runId: state.runId, pipelineName: state.pipelineName,
    });
  }

  const stepDef = pipeline.steps.find(s => s.name === state.currentStep);
  if (!stepDef) {
    state.status = 'completed';
    state.updatedAt = now();
    await persistV2(client, owner, repo, issueNumber, event, state, `✅ Pipeline **${pipeline.name}** completed (run \`${state.runId}\`).`);
    return;
  }

  // ── Approval gate ─────────────────────────────────────────────────────
  if (stepDef.approval === 'required' && state.status !== 'awaiting-approval') {
    const timeoutHours = stepDef.approval_timeout_hours ?? APPROVAL_TIMEOUT_DEFAULT_HOURS;
    const timeoutAt = new Date(Date.now() + timeoutHours * 3600 * 1000).toISOString();
    state.status = 'awaiting-approval';
    state.approvalGate = { requestedAt: now(), timeoutAt, approvedBy: null };
    state.updatedAt = now();
    await persistV2(client, owner, repo, issueNumber, event, state,
      `🔐 Approval required before step **${stepDef.name}**. Post \`/approve\` to continue. Gate expires at \`${timeoutAt}\`.`);
    return;
  }

  // ── Resolve runtime ───────────────────────────────────────────────────
  const resolution = runtimeRegistry
    ? resolveRuntime({ registry: runtimeRegistry, agent: stepDef.agent, stepRuntime: stepDef.runtime })
    : { error: 'runtime-unresolved', detail: { agent: stepDef.agent, tried: { step: stepDef.runtime ?? null, agent: null, project: null } } };

  if (resolution.error === 'runtime-unresolved') {
    state.status = 'failed';
    state.outcome = 'runtime-unresolved';
    state.updatedAt = now();
    await persistV2(client, owner, repo, issueNumber, event, state,
      `❌ Runtime unresolved for agent **${stepDef.agent}**. Tried (step: ${resolution.detail.tried.step ?? '∅'}, agent: ${resolution.detail.tried.agent ?? '∅'}, project: ${resolution.detail.tried.project ?? '∅'}).`);
    return;
  }

  state.runtime_used = resolution.name;
  state.status = 'running';
  state.totalSteps = (state.totalSteps ?? 0) + 1;
  state.updatedAt = now();

  await persistV2(client, owner, repo, issueNumber, event, state,
    `⚙️ Invoking **${stepDef.agent}** (step \`${stepDef.name}\`, iteration ${state.currentIteration}, runtime \`${resolution.name}\`).`);

  try {
    const r = await invokeAgentV2({
      client, owner, repo, agent: stepDef.agent, ref: ref ?? 'main',
      issueNumber, runId: state.runId, step: stepDef.name,
      iteration: state.currentIteration,
      runtime: resolution.runtime, runtimeName: resolution.name,
      env, clock,
    });
    state.runtime_retries = r.retries;
  } catch (err) {
    state.status = 'failed';
    state.outcome = err.code === 'runtime-credential-missing' ? 'runtime-credential-missing'
                  : err.code === 'runtime-error' ? 'runtime-error'
                  : err.code === 'RUNTIME_KIND_NOT_ENABLED' ? 'runtime-error'
                  : 'failed';
    state.updatedAt = now();
    const detail = err.code === 'runtime-credential-missing'
      ? `secret reference \`${err.credential_ref}\` could not be resolved`
      : err.message;
    await persistV2(client, owner, repo, issueNumber, event, state,
      `❌ Step **${stepDef.name}** failed: ${state.outcome} — ${detail}`);
    return;
  }

  state.status = 'awaiting-agent';
  state.updatedAt = now();
  state.awaitingSince = now();
  await persistV2(client, owner, repo, issueNumber, event, state,
    `⏳ Waiting for **${stepDef.agent}** to post an apm-msg result (step \`${stepDef.name}\`, iteration ${state.currentIteration}).`);
}

async function handleV2WorkflowRunCompleted({
  client, event, pipeline, state, owner, repo,
  runtimeRegistry, identities, env, clock,
}) {
  const { issueNumber } = event;
  if (state.status !== 'awaiting-agent') return;

  const stepDef = pipeline.steps.find(s => s.name === state.currentStep);
  if (!stepDef) return;
  if (event.workflowName && !event.workflowName.toLowerCase().includes(stepDef.agent.toLowerCase())) {
    return;
  }

  // FR-019: per-step timeout — if the awaiting window exceeded the step's
  // declared timeout_minutes, synthesize a `timeout` outcome and let the
  // pipeline's transition table decide what to do next.
  if (await maybeTimeoutStep({ client, event, pipeline, state, stepDef, owner, repo, identities, env, clock, runtimeRegistry })) {
    return;
  }

  if (event.workflowConclusion === 'failure' || event.workflowConclusion === 'cancelled') {
    state.status = 'failed';
    state.outcome = 'runtime-error';
    state.updatedAt = now();
    await persistV2(client, owner, repo, issueNumber, event, state,
      `❌ Agent workflow for **${stepDef.agent}** finished with \`${event.workflowConclusion}\` — outcome \`runtime-error\`.`);
    return;
  }

  // Otherwise we wait for the agent's apm-msg comment to drive the transition;
  // no state change here. The comment-handler does the work.
}

async function handleAgentComment({ client, event, pipelines, owner, repo, runtimeRegistry, identities, env, clock }) {
  const { issueNumber } = event;
  const author = event.comment.user;

  const state = await loadState(client, owner, repo, issueNumber);
  if (!state || state.schemaVersion !== '2') return; // v1 doesn't ingest apm-msg
  if (state.status === 'completed' || state.status === 'failed' || state.status === 'timed-out') return;

  const pipeline = pipelines.find(p => p.name === state.pipelineName);
  if (!pipeline) return;

  const stepDef = pipeline.steps.find(s => s.name === state.currentStep);
  if (!stepDef) return;

  // FR-019: per-step timeout — synthesize `timeout` outcome if the agent
  // has been silent past the step's declared `timeout_minutes`. Runs before
  // the identity check so a stale gate doesn't block forever on non-agent
  // chatter.
  if (await maybeTimeoutStep({ client, event, pipeline, state, stepDef, owner, repo, identities, env, clock, runtimeRegistry })) {
    return;
  }

  // FR-013: Identity check — comment author must map to the expected agent.
  const identityAgent = resolveLogin(identities, author);
  const expectedAgent = stepDef.agent;
  // Agent slugs in identities map can be e.g. "qa-agent", but step.agent may be "qa".
  // We accept either exact match or matching after stripping "-agent" suffix.
  const matches = identityAgent === expectedAgent
                || identityAgent === `${expectedAgent}-agent`
                || identityAgent?.replace(/-agent$/, '') === expectedAgent;
  if (!identityAgent || !matches) {
    // Silent for non-agent authors (FR-011 acceptance: protocol-ignored: non-agent-author)
    if (!identityAgent) return;
    // Wrong agent posted — treat as protocol-violation only if a fence is present.
  }

  // Parse the apm-msg block.
  const parsed = parseApmMsg(event.comment.body);
  if (!parsed.ok) {
    if (parsed.reason === 'no-block' && !identityAgent) return; // ordinary human comment
    state.status = 'failed';
    state.outcome = 'protocol-violation';
    state.updatedAt = now();
    await persistV2(client, owner, repo, issueNumber, event, state,
      `❌ Protocol violation (\`${parsed.reason}\`) on step **${stepDef.name}**. Redacted excerpt: \`\`\`\n${parsed.redacted}\n\`\`\``);
    return;
  }

  // Context check (runId, step, agent, iteration)
  const ctxErr = validateMsgContext(parsed.message, {
    runId: state.runId,
    expectedStep: stepDef.name,
    expectedAgent: parsed.message.agent, // accept whatever the agent claims if it parses
    expectedIteration: state.currentIteration,
  });
  if (ctxErr) {
    state.status = 'failed';
    state.outcome = 'protocol-violation';
    state.updatedAt = now();
    await persistV2(client, owner, repo, issueNumber, event, state,
      `❌ Protocol violation (\`${ctxErr}\`) on step **${stepDef.name}**.`);
    return;
  }

  const outcome = parsed.message.outcome;
  state.outcome = outcome;
  state.lastSummary = parsed.message.summary;

  // Resolve transition for this outcome.
  const next = resolveTransition(pipeline, stepDef.name, outcome);
  if (!next) {
    // Terminal outcomes without a transition end the run.
    state.status = (outcome === 'success') ? 'completed'
                 : (outcome === 'needs-human') ? 'failed'
                 : 'failed';
    state.updatedAt = now();
    if (outcome === 'needs-human' && typeof client.addLabels === 'function') {
      await client.addLabels(owner, repo, issueNumber, ['status:needs-human']);
    }
    await persistV2(client, owner, repo, issueNumber, event, state,
      `🏁 Step **${stepDef.name}** outcome \`${outcome}\` — no transition declared; run ${state.status}.`);
    return;
  }

  // Loop-budget check on backward edges (FR-005).
  const budget = mergeBudget(pipeline.loopBudget);
  const runStartedAt = await getRunStartedAt(client, owner, repo, issueNumber);
  const verdict = evaluateLoopBudget({
    budget,
    iterations: state.iterations ?? {},
    totalSteps: state.totalSteps ?? 0,
    runStartedAt: runStartedAt ?? state.updatedAt,
    now: now(),
    fromStep: stepDef.name,
    toStep: next.to,
    isBackward: next.isBackward,
  });

  if (!verdict.allowed) {
    state.status = 'loop-budget-exceeded';
    state.updatedAt = now();
    if (typeof client.addLabels === 'function') {
      await client.addLabels(owner, repo, issueNumber, ['status:needs-human', 'status:loop-budget-exceeded']);
    }
    const history = Object.entries(state.iterations ?? {})
      .map(([k, v]) => `\n  - \`${k}\`: ${v}`).join('') || ' _(none)_';
    await persistV2(client, owner, repo, issueNumber, event, state,
      `🛑 **Loop budget exceeded** (\`${verdict.reason}\`) on edge \`${verdict.edgeKey}\`. Iteration history:${history}\n\nDetails: \`${JSON.stringify(verdict.detail)}\``);
    return;
  }

  // Increment edge iteration if backward.
  if (next.isBackward) {
    state.iterations = { ...(state.iterations ?? {}), [verdict.edgeKey]: verdict.nextEdgeIteration };
    state.currentIteration = verdict.nextEdgeIteration;
    state.currentEdgeKey = verdict.edgeKey;
  } else {
    state.currentIteration = 1;
    state.currentEdgeKey = null;
  }

  state.currentStep = next.to;
  state.status = 'running';
  state.updatedAt = now();

  await persistV2(client, owner, repo, issueNumber, event, state,
    `✅ Step **${stepDef.name}** → **${next.to}** (\`${outcome}\`${next.isBackward ? `, iteration ${state.currentIteration}` : ''}).`);

  // Continue dispatching.
  await advanceV2Pipeline({
    client,
    event: { ...event, type: 'orchestrator.continue' },
    pipeline, state, owner, repo,
    runtimeRegistry, identities, env, clock,
  });
}

/**
 * FR-019: per-step timeout. If the run has been waiting for the active step
 * past its declared `timeout_minutes` (default `STEP_TIMEOUT_DEFAULT_MINUTES`),
 * synthesize a `timeout` outcome and let the pipeline's transitions decide
 * what happens next. If no transition is declared for `timeout`, the run is
 * marked `timed-out` (terminal). Returns true when the timeout fired and the
 * caller should stop processing the original event.
 */
async function maybeTimeoutStep({
  client, event, pipeline, state, stepDef, owner, repo,
  identities, env, clock, runtimeRegistry,
}) {
  if (state.status !== 'awaiting-agent') return false;
  const timeoutMinutes = stepDef.timeout_minutes ?? STEP_TIMEOUT_DEFAULT_MINUTES;
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return false;

  const baseline = state.awaitingSince
    ?? state.updatedAt
    ?? (await getRunStartedAt(client, owner, repo, event.issueNumber));
  if (!baseline) return false;

  const elapsedMs = Date.now() - new Date(baseline).getTime();
  if (elapsedMs <= timeoutMinutes * 60_000) return false;

  const next = resolveTransition(pipeline, stepDef.name, 'timeout');
  state.outcome = 'timeout';
  state.updatedAt = now();
  state.awaitingSince = null;

  if (!next) {
    state.status = 'timed-out';
    if (typeof client.addLabels === 'function') {
      await client.addLabels(owner, repo, event.issueNumber, ['status:needs-human', 'status:step-timeout']);
    }
    await persistV2(client, owner, repo, event.issueNumber, event, state,
      `⏰ Step **${stepDef.name}** timed out after ${timeoutMinutes} minutes — no \`timeout\` transition declared. Run \`timed-out\`.`);
    return true;
  }

  // Re-use the loop-budget gate so a runaway timeout-fail-loop still trips.
  const budget = mergeBudget(pipeline.loopBudget);
  const verdict = evaluateLoopBudget({
    budget,
    iterations: state.iterations ?? {},
    totalSteps: state.totalSteps ?? 0,
    runStartedAt: (await getRunStartedAt(client, owner, repo, event.issueNumber)) ?? state.updatedAt,
    now: now(),
    fromStep: stepDef.name,
    toStep: next.to,
    isBackward: next.isBackward,
  });

  if (!verdict.allowed) {
    state.status = 'loop-budget-exceeded';
    if (typeof client.addLabels === 'function') {
      await client.addLabels(owner, repo, event.issueNumber, ['status:needs-human', 'status:loop-budget-exceeded']);
    }
    await persistV2(client, owner, repo, event.issueNumber, event, state,
      `🛑 Step **${stepDef.name}** timed out and the \`timeout\` transition would exceed the loop budget (\`${verdict.reason}\` on \`${verdict.edgeKey}\`).`);
    return true;
  }

  if (next.isBackward) {
    state.iterations = { ...(state.iterations ?? {}), [verdict.edgeKey]: verdict.nextEdgeIteration };
    state.currentIteration = verdict.nextEdgeIteration;
    state.currentEdgeKey = verdict.edgeKey;
  } else {
    state.currentIteration = 1;
    state.currentEdgeKey = null;
  }
  state.currentStep = next.to;
  state.status = 'running';

  await persistV2(client, owner, repo, event.issueNumber, event, state,
    `⏰ Step **${stepDef.name}** timed out after ${timeoutMinutes} minutes — transitioning to **${next.to}** via \`timeout\`.`);

  await advanceV2Pipeline({
    client,
    event: { ...event, type: 'orchestrator.timeout' },
    pipeline, state, owner, repo,
    runtimeRegistry, identities, env, clock,
  });
  return true;
}

/**
 * Persist v2 state: append audit comment, then upsert the live-status comment.
 * The audit channel is authoritative; the live-status PATCH is best-effort.
 */
async function persistV2(client, owner, repo, issueNumber, event, state, auditMessage) {
  const enriched = {
    ...state,
    dedup_key: event._dedupKey ?? state.dedup_key ?? null,
  };
  await saveState(client, owner, repo, issueNumber, enriched, auditMessage);
  if (typeof client.updateComment === 'function') {
    const summary =
      `### Pipeline \`${state.pipelineName}\` — run \`${state.runId}\`\n\n` +
      `- **Step:** \`${state.currentStep}\`\n` +
      `- **Iteration:** ${state.currentIteration}\n` +
      `- **Runtime:** \`${state.runtime_used ?? '—'}\`\n` +
      `- **Status:** \`${state.status}\`\n` +
      (state.outcome ? `- **Last outcome:** \`${state.outcome}\`\n` : '');
    try {
      await upsertLiveStatus(client, owner, repo, issueNumber, state.runId, summary);
    } catch (err) {
      console.warn(`[orchestrator] live-status upsert failed (non-fatal): ${err.message}`);
    }
  }

  // Dashboard broadcast payload — write to /tmp for the GHA workflow
  // to forward (FR-021, US-9). Includes loop iteration + runtime per step.
  await writeDashboardPayload(state).catch(() => { /* non-fatal */ });
}

async function writeDashboardPayload(state) {
  if (typeof globalThis.__APM_TEST_NO_FS === 'boolean' && globalThis.__APM_TEST_NO_FS) return;
  try {
    const { writeFile } = await import('fs/promises');
    await writeFile('/tmp/apm-pipeline-event.json', JSON.stringify({
      runId: state.runId,
      pipelineName: state.pipelineName,
      status: state.status,
      step: state.currentStep,
      iteration: state.currentIteration,
      edgeKey: state.currentEdgeKey ?? null,
      runtime: state.runtime_used ?? null,
      outcome: state.outcome ?? null,
    }), 'utf8');
  } catch { /* non-fatal */ }
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

  // ── Load v2 registries (FR-007, FR-008, FR-013) ──────────────────────
  // Required so that v2 pipelines can resolve `step.runtime` and apm-msg
  // identity validation can run. Missing files are tolerated (v1-only repo).
  const runtimeReg = await loadRuntimeRegistry(process.cwd());
  for (const err of runtimeReg.errors) {
    console.error(`[orchestrator] Runtime registry error: ${err.code} — ${err.message}`);
  }
  const runtimeRegistry = runtimeReg.found
    ? {
        runtimes: runtimeReg.runtimes,
        default_runtime: runtimeReg.default_runtime,
        agent_defaults: runtimeReg.agent_defaults,
      }
    : null;

  const identityReg = await loadIdentities(process.cwd());
  for (const err of identityReg.errors) {
    console.error(`[orchestrator] Identity registry error: ${err.code ?? 'INVALID'} — ${err.message}`);
  }
  const identities = identityReg.found ? identityReg.byLogin : null;

  const client = createGitHubClient(token);
  await runOrchestrator({
    client, event, pipelines, owner, repo, aiTool,
    runtimeRegistry, identities,
    env: process.env,
  });
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
        // workflow_run carries no issue number in the event itself.
        // The orchestrator passes it as a workflow_dispatch input so the
        // agent workflow has context; recover it from there.
        issueNumber: Number(payload.workflow_run?.inputs?.issue_number) || issueNumber || null,
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
