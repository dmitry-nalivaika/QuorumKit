/**
 * engine/tests/issue-enrichment.test.js
 *
 * Tests for FR-001 (Issue #263): Automatic issue enrichment dispatch.
 *
 * Verifies that the Orchestrator dispatches the BA Issue Enrichment workflow
 * (`copilot-agent-ba-enrich.yml`) when an `issues.labeled` event carries both
 * the `triaged` label and the `agent:ba` label, and does NOT dispatch it when
 * either label is absent.
 *
 * US-1 acceptance scenarios:
 *   1. Given `agent:ba` without `triaged` → no dispatch
 *   2. Given `agent:ba` AND `triaged` → BA enrichment dispatched automatically
 *   3. Given `triaged` without `agent:ba` → no dispatch
 *   4. Given dispatch → issue_number passed as workflow input
 */

import { describe, it, expect, vi } from 'vitest';
import { runOrchestrator } from '../orchestrator/index.js';

// ─── Pipeline fixture ────────────────────────────────────────────────────────

/**
 * Minimal ba-enrichment-pipeline fixture matching the production YAML:
 *   trigger: issues.labeled with labels [triaged, agent:ba]
 *   steps:   [{ name: ba-enrich, agent: ba-enrich-agent }]
 */
const baEnrichmentPipeline = {
  name: 'ba-enrichment-pipeline',
  version: '1',
  trigger: { event: 'issues.labeled', labels: ['triaged', 'agent:ba'] },
  steps: [
    { name: 'ba-enrich', agent: 'ba-enrich-agent' },
  ],
};

/**
 * Feature pipeline that also matches triaged + type:feature but should NOT
 * win over ba-enrichment-pipeline for agent:ba issues (enrichment is listed
 * first in the loaded pipeline array, matching alphabetical file order).
 */
const featurePipeline = {
  name: 'feature-pipeline',
  version: '1',
  trigger: { event: 'issues.labeled', labels: ['triaged', 'type:feature'] },
  steps: [
    { name: 'ba', agent: 'ba-agent' },
    { name: 'dev', agent: 'dev-agent' },
  ],
};

// ─── Client factory ──────────────────────────────────────────────────────────

function makeClient() {
  return {
    listComments: vi.fn().mockResolvedValue([]),
    createComment: vi.fn().mockResolvedValue({ id: 1 }),
    triggerWorkflow: vi.fn().mockResolvedValue(undefined),
    getCollaboratorPermission: vi.fn().mockResolvedValue('write'),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Issue Enrichment — FR-001 dispatch', () => {
  // US-1 Scenario 2: triaged + agent:ba → BA enrichment dispatched
  it('dispatches copilot-agent-ba-enrich.yml when issue carries triaged + agent:ba', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'agent:ba', 'type:feature', 'status:needs-info'],
      issueNumber: 263,
      ref: 'main',
    };

    await runOrchestrator({
      client,
      event,
      pipelines: [baEnrichmentPipeline],
      owner: 'o',
      repo: 'r',
      aiTool: 'copilot',
    });

    expect(client.triggerWorkflow).toHaveBeenCalledWith(
      'o', 'r', 'copilot-agent-ba-enrich.yml', 'main', expect.any(Object)
    );
  });

  // US-1 Scenario 4: issue_number passed as workflow input
  it('passes issue_number as a workflow input string when dispatching enrichment', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'agent:ba'],
      issueNumber: 263,
      ref: 'main',
    };

    await runOrchestrator({
      client,
      event,
      pipelines: [baEnrichmentPipeline],
      owner: 'o',
      repo: 'r',
      aiTool: 'copilot',
    });

    const [, , , , inputs] = client.triggerWorkflow.mock.calls[0];
    expect(inputs.issue_number).toBe('263');
  });

  // US-1 Scenario 3: triaged without agent:ba → no dispatch
  it('does NOT dispatch enrichment when triaged is present but agent:ba is absent', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'type:feature', 'status:needs-info'],
      issueNumber: 100,
      ref: 'main',
    };

    await runOrchestrator({
      client,
      event,
      pipelines: [baEnrichmentPipeline],
      owner: 'o',
      repo: 'r',
      aiTool: 'copilot',
    });

    expect(client.triggerWorkflow).not.toHaveBeenCalled();
  });

  // US-1 Scenario 1: agent:ba without triaged → no dispatch
  it('does NOT dispatch enrichment when agent:ba is present but triaged has not been applied', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      // triaged is absent — this is an intermediate label-apply event (phase 1)
      labels: ['agent:ba', 'type:feature', 'status:needs-info'],
      issueNumber: 101,
      ref: 'main',
    };

    await runOrchestrator({
      client,
      event,
      pipelines: [baEnrichmentPipeline],
      owner: 'o',
      repo: 'r',
      aiTool: 'copilot',
    });

    expect(client.triggerWorkflow).not.toHaveBeenCalled();
  });

  // Enrichment pipeline takes precedence over feature pipeline for agent:ba issues
  it('dispatches enrichment (not feature pipeline) when issue carries triaged + agent:ba + type:feature', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'agent:ba', 'type:feature', 'status:needs-info'],
      issueNumber: 263,
      ref: 'main',
    };

    // ba-enrichment-pipeline is listed first (alphabetical file order)
    await runOrchestrator({
      client,
      event,
      pipelines: [baEnrichmentPipeline, featurePipeline],
      owner: 'o',
      repo: 'r',
      aiTool: 'copilot',
    });

    const dispatchedWorkflows = client.triggerWorkflow.mock.calls.map(c => c[2]);
    expect(dispatchedWorkflows).toContain('copilot-agent-ba-enrich.yml');
    expect(dispatchedWorkflows).not.toContain('copilot-agent-ba.yml');
  });

  // Enrichment pipeline does not fire on non-labeled events
  it('does NOT dispatch enrichment on issues.opened', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.opened',
      labels: ['triaged', 'agent:ba'],
      issueNumber: 102,
      ref: 'main',
    };

    await runOrchestrator({
      client,
      event,
      pipelines: [baEnrichmentPipeline],
      owner: 'o',
      repo: 'r',
      aiTool: 'copilot',
    });

    expect(client.triggerWorkflow).not.toHaveBeenCalled();
  });

  // After enrichment completes, state is awaiting-agent (not immediately completed)
  it('sets pipeline state to awaiting-agent after dispatching enrichment', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'agent:ba'],
      issueNumber: 263,
      ref: 'main',
    };

    await runOrchestrator({
      client,
      event,
      pipelines: [baEnrichmentPipeline],
      owner: 'o',
      repo: 'r',
      aiTool: 'copilot',
    });

    const allBodies = client.createComment.mock.calls.map(c => c[3]);
    const awaitingBody = allBodies.find(
      b => typeof b === 'string' && b.includes('"status":"awaiting-agent"')
    );
    expect(awaitingBody).toBeTruthy();
  });

  // Pipeline name in state matches ba-enrichment-pipeline
  it('records ba-enrichment-pipeline as the active pipeline in state', async () => {
    const client = makeClient();
    const event = {
      type: 'issues.labeled',
      labels: ['triaged', 'agent:ba'],
      issueNumber: 263,
      ref: 'main',
    };

    await runOrchestrator({
      client,
      event,
      pipelines: [baEnrichmentPipeline],
      owner: 'o',
      repo: 'r',
      aiTool: 'copilot',
    });

    const stateBodies = client.createComment.mock.calls
      .map(c => c[3])
      .filter(b => typeof b === 'string' && b.includes('apm-pipeline-state'));

    const latestState = stateBodies[stateBodies.length - 1];
    expect(latestState).toContain('"pipelineName":"ba-enrichment-pipeline"');
  });
});
