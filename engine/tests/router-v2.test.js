import { describe, it, expect } from 'vitest';
import { resolveTransition, buildStepIndex } from '../orchestrator/router-v2.js';

const v2Pipe = {
  schemaVersion: '2',
  steps: [
    { name: 'ba', agent: 'ba' },
    { name: 'dev', agent: 'dev' },
    { name: 'qa', agent: 'qa' },
    { name: 'reviewer', agent: 'reviewer' },
  ],
  transitions: [
    { from: 'ba', outcome: 'success', to: 'dev' },
    { from: 'dev', outcome: 'success', to: 'qa' },
    { from: 'qa', outcome: 'success', to: 'reviewer' },
    { from: 'qa', outcome: 'fail', to: 'dev' },        // backward
    { from: 'dev', outcome: 'spec_gap', to: 'ba' },    // backward
  ],
};

describe('router-v2.resolveTransition', () => {
  it('returns null when no transition matches', () => {
    expect(resolveTransition(v2Pipe, 'ba', 'fail')).toBeNull();
  });
  it('detects forward edge (isBackward=false)', () => {
    expect(resolveTransition(v2Pipe, 'ba', 'success')).toEqual({ to: 'dev', isBackward: false });
  });
  it('detects backward edge (isBackward=true)', () => {
    expect(resolveTransition(v2Pipe, 'qa', 'fail')).toEqual({ to: 'dev', isBackward: true });
  });
  it('detects multi-step backward edge', () => {
    expect(resolveTransition(v2Pipe, 'dev', 'spec_gap')).toEqual({ to: 'ba', isBackward: true });
  });
  it('treats self-loop as backward', () => {
    const p = { ...v2Pipe, transitions: [{ from: 'qa', outcome: 'fail', to: 'qa' }] };
    expect(resolveTransition(p, 'qa', 'fail').isBackward).toBe(true);
  });
});

describe('router-v2.buildStepIndex', () => {
  it('preserves declaration order', () => {
    const idx = buildStepIndex(v2Pipe);
    expect(idx.get('ba')).toBe(0);
    expect(idx.get('reviewer')).toBe(3);
  });
});
