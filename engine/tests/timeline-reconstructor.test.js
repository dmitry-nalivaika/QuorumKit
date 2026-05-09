import { describe, it, expect } from 'vitest';
import { reconstructTimeline } from '../orchestrator/timeline-reconstructor.js';
import { STATE_TAG } from '../orchestrator/state-manager.js';

function audit(state, at) {
  return { body: `prose\n${STATE_TAG}${JSON.stringify(state)} -->`, created_at: at };
}

describe('timeline-reconstructor.reconstructTimeline', () => {
  it('returns empty timeline on no comments', () => {
    expect(reconstructTimeline([])).toEqual({
      runId: null, pipelineName: null, status: null, steps: [], finalOutcome: null,
    });
  });

  it('reconstructs a single-step v1 run from one audit comment', () => {
    const t = reconstructTimeline([
      audit({ runId: 'r1', pipelineName: 'feature-pipeline', status: 'completed' }, '2026-05-08T10:00:00Z'),
    ]);
    expect(t.runId).toBe('r1');
    expect(t.pipelineName).toBe('feature-pipeline');
    expect(t.status).toBe('completed');
    expect(t.steps).toHaveLength(1);
  });

  it('preserves chronological order from many comments', () => {
    const comments = [
      audit({ runId: 'r', currentStep: 'qa', status: 'running', outcome: 'fail' }, '2026-05-08T10:02:00Z'),
      audit({ runId: 'r', currentStep: 'ba', status: 'running', outcome: 'success' }, '2026-05-08T10:00:00Z'),
      audit({ runId: 'r', currentStep: 'dev', status: 'running', outcome: 'success' }, '2026-05-08T10:01:00Z'),
    ];
    const t = reconstructTimeline(comments);
    expect(t.steps.map(s => s.step)).toEqual(['ba', 'dev', 'qa']);
    expect(t.finalOutcome).toBe('fail');
  });

  it('captures runtime_used + iteration + edgeKey when present (v2)', () => {
    const t = reconstructTimeline([
      audit({
        runId: 'r', currentStep: 'qa', currentIteration: 2, currentEdgeKey: 'qa->dev',
        runtime_used: 'claude-default', outcome: 'fail', status: 'running',
      }, '2026-05-08T10:00:00Z'),
    ]);
    expect(t.steps[0]).toMatchObject({
      step: 'qa', runtime: 'claude-default', iteration: 2, edgeKey: 'qa->dev', outcome: 'fail',
    });
  });

  it('skips malformed audit JSON without throwing', () => {
    const broken = { body: `${STATE_TAG}not-json -->`, created_at: '2026-05-08T10:00:00Z' };
    const ok = audit({ runId: 'r', status: 'completed' }, '2026-05-08T10:01:00Z');
    expect(reconstructTimeline([broken, ok]).runId).toBe('r');
  });
});
