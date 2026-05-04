import { describe, it, expect } from 'vitest';
import { matchEvent } from '../../scripts/orchestrator/router.js';

const featurePipeline = {
  name: 'feature-pipeline',
  version: '1',
  trigger: { event: 'issues.opened', labels: ['type:feature'] },
  steps: [{ name: 'triage', agent: 'triage-agent' }],
};

const bugPipeline = {
  name: 'bug-fix-pipeline',
  version: '1',
  trigger: { event: 'issues.opened', labels: ['type:bug'] },
  steps: [{ name: 'triage', agent: 'triage-agent' }],
};

const prPipeline = {
  name: 'pr-pipeline',
  version: '1',
  trigger: { event: 'pull_request.opened' },
  steps: [{ name: 'reviewer', agent: 'reviewer-agent' }],
};

const pipelines = [featurePipeline, bugPipeline, prPipeline];

describe('router.matchEvent', () => {
  it('matches an issue.opened event with the correct label', () => {
    const event = { type: 'issues.opened', labels: ['type:feature', 'priority:high'] };
    expect(matchEvent(event, pipelines)).toBe(featurePipeline);
  });

  it('matches bug pipeline when bug label is present', () => {
    const event = { type: 'issues.opened', labels: ['type:bug'] };
    expect(matchEvent(event, pipelines)).toBe(bugPipeline);
  });

  it('returns null and does not throw when no pipeline matches (no-rule-match)', () => {
    const event = { type: 'issues.opened', labels: ['type:chore'] };
    expect(matchEvent(event, pipelines)).toBeNull();
  });

  it('matches pull_request.opened without label requirement', () => {
    const event = { type: 'pull_request.opened', labels: [] };
    expect(matchEvent(event, pipelines)).toBe(prPipeline);
  });

  it('returns null when event type does not match any pipeline', () => {
    const event = { type: 'push', labels: [] };
    expect(matchEvent(event, pipelines)).toBeNull();
  });

  it('returns null when required label is missing', () => {
    const event = { type: 'issues.opened', labels: [] };
    expect(matchEvent(event, pipelines)).toBeNull();
  });

  it('returns null when pipelines array is empty', () => {
    const event = { type: 'issues.opened', labels: ['type:feature'] };
    expect(matchEvent(event, [])).toBeNull();
  });
});
