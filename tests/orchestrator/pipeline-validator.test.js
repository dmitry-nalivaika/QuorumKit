import { describe, it, expect } from 'vitest';
import { validatePipeline } from '../../scripts/orchestrator/pipeline-validator.js';

const baseRegulation = {
  labels: new Set(['triaged', 'type:feature', 'type:bug']),
  outcomes: new Set(['success', 'fail', 'blocker', 'spec_gap']),
  triggers: new Set(['issues.labeled', 'pull_request.opened']),
};

const baseRuntimes = new Set(['copilot-default', 'claude-default']);

const v2Valid = {
  name: 'feature-pipeline-v2',
  schema_version: '2',
  trigger: { event: 'issues.labeled', labels: ['triaged', 'type:feature'] },
  entry: 'ba',
  steps: [
    { name: 'ba', agent: 'ba', runtime: 'copilot-default' },
    { name: 'dev', agent: 'dev', runtime: 'copilot-default' },
    { name: 'qa', agent: 'qa', runtime: 'claude-default' },
  ],
  transitions: [
    { from: 'ba', outcome: 'success', to: 'dev' },
    { from: 'dev', outcome: 'success', to: 'qa' },
    { from: 'qa', outcome: 'fail', to: 'dev' }, // backward edge
  ],
  loop_budget: { max_iterations_per_edge: 3, max_total_steps: 30, max_wallclock_minutes: 720 },
};

describe('pipeline-validator.validatePipeline — v2 happy path', () => {
  it('returns no errors for a valid v2 pipeline', () => {
    const errs = validatePipeline(v2Valid, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs).toEqual([]);
  });
});

describe('pipeline-validator.validatePipeline — v2 defects', () => {
  it('flags ENTRY_NOT_IN_STEPS', () => {
    const p = { ...v2Valid, entry: 'nonexistent' };
    const errs = validatePipeline(p, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'ENTRY_NOT_IN_STEPS')).toBe(true);
  });

  it('flags DUPLICATE_STEP_NAME', () => {
    const p = { ...v2Valid, steps: [...v2Valid.steps, { name: 'dev', agent: 'dev2' }] };
    const errs = validatePipeline(p, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'DUPLICATE_STEP_NAME')).toBe(true);
  });

  it('flags UNREACHABLE_STEP', () => {
    const p = {
      ...v2Valid,
      steps: [...v2Valid.steps, { name: 'orphan', agent: 'docs' }],
    };
    const errs = validatePipeline(p, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'UNREACHABLE_STEP' && e.message.includes('orphan'))).toBe(true);
  });

  it('flags TRANSITION_FROM_UNKNOWN and TRANSITION_TO_UNKNOWN', () => {
    const p = {
      ...v2Valid,
      transitions: [
        ...v2Valid.transitions,
        { from: 'ghost', outcome: 'success', to: 'qa' },
        { from: 'qa', outcome: 'success', to: 'phantom' },
      ],
    };
    const errs = validatePipeline(p, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'TRANSITION_FROM_UNKNOWN')).toBe(true);
    expect(errs.some(e => e.code === 'TRANSITION_TO_UNKNOWN')).toBe(true);
  });

  it('flags UNDECLARED_OUTCOME', () => {
    const p = {
      ...v2Valid,
      transitions: [{ from: 'ba', outcome: 'glorbnax', to: 'dev' },
                    { from: 'dev', outcome: 'success', to: 'qa' },
                    { from: 'qa', outcome: 'fail', to: 'dev' }],
    };
    const errs = validatePipeline(p, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'UNDECLARED_OUTCOME' && e.message.includes('glorbnax'))).toBe(true);
  });

  it('flags UNDECLARED_LABEL on trigger', () => {
    const p = { ...v2Valid, trigger: { event: 'issues.labeled', labels: ['type:made-up'] } };
    const errs = validatePipeline(p, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'UNDECLARED_LABEL')).toBe(true);
  });

  it('flags UNDECLARED_TRIGGER', () => {
    const p = { ...v2Valid, trigger: { event: 'made_up.event' } };
    const errs = validatePipeline(p, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'UNDECLARED_TRIGGER')).toBe(true);
  });

  it('flags UNKNOWN_RUNTIME', () => {
    const p = {
      ...v2Valid,
      steps: [{ ...v2Valid.steps[0], runtime: 'no-such-runtime' }, ...v2Valid.steps.slice(1)],
    };
    const errs = validatePipeline(p, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'UNKNOWN_RUNTIME')).toBe(true);
  });

  it('flags BACKWARD_EDGE_NO_BUDGET when backward edge present but loop_budget missing', () => {
    const { loop_budget, ...withoutBudget } = v2Valid;
    const errs = validatePipeline(withoutBudget, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'BACKWARD_EDGE_NO_BUDGET')).toBe(true);
  });

  it('does NOT flag BACKWARD_EDGE_NO_BUDGET on forward-only graphs', () => {
    const forwardOnly = {
      ...v2Valid,
      transitions: [
        { from: 'ba', outcome: 'success', to: 'dev' },
        { from: 'dev', outcome: 'success', to: 'qa' },
      ],
    };
    const { loop_budget, ...withoutBudget } = forwardOnly;
    const errs = validatePipeline(withoutBudget, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.find(e => e.code === 'BACKWARD_EDGE_NO_BUDGET')).toBeUndefined();
  });

  it('flags STEP_TIMEOUT_EXCEEDS_JOB when step.timeout_minutes > workflow cap', () => {
    const p = {
      ...v2Valid,
      steps: [{ ...v2Valid.steps[0], timeout_minutes: 400 }, ...v2Valid.steps.slice(1)],
    };
    const workflowTimeouts = new Map([
      ['copilot-agent-ba.yml', 60],
      ['agent-ba.yml', 60],
    ]);
    const errs = validatePipeline(p, { regulation: baseRegulation, runtimes: baseRuntimes, workflowTimeouts });
    expect(errs.some(e => e.code === 'STEP_TIMEOUT_EXCEEDS_JOB')).toBe(true);
  });

  it('reports each defect at most as many errors as defects (no infinite loops)', () => {
    const errs = validatePipeline({}, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.length).toBeLessThan(50);
  });
});

describe('pipeline-validator.validatePipeline — v1 still validates', () => {
  it('accepts a valid v1 pipeline', () => {
    const v1 = {
      name: 'old-pipeline',
      version: '1',
      trigger: { event: 'issues.labeled', labels: ['triaged', 'type:feature'] },
      steps: [{ name: 'ba', agent: 'ba' }],
    };
    const errs = validatePipeline(v1, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs).toEqual([]);
  });

  it('still flags UNDECLARED_LABEL on v1 triggers', () => {
    const v1 = {
      name: 'old',
      version: '1',
      trigger: { event: 'issues.labeled', labels: ['nonsense'] },
      steps: [{ name: 'ba', agent: 'ba' }],
    };
    const errs = validatePipeline(v1, { regulation: baseRegulation, runtimes: baseRuntimes });
    expect(errs.some(e => e.code === 'UNDECLARED_LABEL')).toBe(true);
  });
});
