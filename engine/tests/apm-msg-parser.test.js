import { describe, it, expect } from 'vitest';
import { parseApmMsg, redactBlock, validateContext } from '../orchestrator/apm-msg-parser.js';

const validMsg = {
  version: '2',
  runId: 'run-001',
  step: 'qa',
  agent: 'qa-agent',
  iteration: 1,
  outcome: 'success',
  summary: 'All acceptance scenarios passed.',
};

function fence(obj) {
  return '```apm-msg\n' + JSON.stringify(obj, null, 2) + '\n```';
}

describe('apm-msg-parser.parseApmMsg', () => {
  it('parses a valid block at the end of a comment', () => {
    const body = `Some prose explaining what I did.\n\n${fence(validMsg)}\n`;
    const r = parseApmMsg(body);
    expect(r.ok).toBe(true);
    expect(r.message.runId).toBe('run-001');
    expect(r.message.outcome).toBe('success');
  });

  it('returns no-block when there is no fenced apm-msg', () => {
    const r = parseApmMsg('Plain comment with **markdown** and even ```js\nconsole.log(1)\n``` in it.');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-block');
  });

  it('returns no-block on empty/non-string input', () => {
    expect(parseApmMsg('').reason).toBe('no-block');
    expect(parseApmMsg(undefined).reason).toBe('no-block');
    expect(parseApmMsg(null).reason).toBe('no-block');
  });

  it('returns multiple-blocks when more than one fence is present', () => {
    const body = `${fence(validMsg)}\n\nlater:\n\n${fence(validMsg)}`;
    const r = parseApmMsg(body);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('multiple-blocks');
    expect(r.redacted.length).toBeGreaterThan(0);
  });

  it('returns malformed-json when the block contents are not JSON', () => {
    const body = '```apm-msg\nthis is not { valid JSON\n```';
    const r = parseApmMsg(body);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('malformed-json');
  });

  it('returns schema-invalid for missing required fields', () => {
    const broken = { ...validMsg };
    delete broken.outcome;
    const r = parseApmMsg(fence(broken));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('schema-invalid');
    expect(r.ajvErrors).toBeTruthy();
  });

  it('returns schema-invalid for an unknown outcome enum value', () => {
    const r = parseApmMsg(fence({ ...validMsg, outcome: 'bogus' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('schema-invalid');
  });

  it('returns schema-invalid when summary exceeds 280 chars', () => {
    const r = parseApmMsg(fence({ ...validMsg, summary: 'x'.repeat(281) }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('schema-invalid');
  });

  it('redacts long defective bodies to 200 chars by default', () => {
    const long = 'a'.repeat(500);
    const body = `\`\`\`apm-msg\n${long}\n\`\`\``;
    const r = parseApmMsg(body);
    expect(r.ok).toBe(false);
    expect(r.redacted.length).toBeLessThanOrEqual(201); // includes ellipsis
  });
});

describe('apm-msg-parser.redactBlock', () => {
  it('returns the block unchanged when shorter than max', () => {
    expect(redactBlock('short', 200)).toBe('short');
  });
  it('truncates and appends ellipsis when longer', () => {
    expect(redactBlock('x'.repeat(300), 100).length).toBe(101);
  });
  it('handles non-string defensively', () => {
    expect(redactBlock(undefined)).toBe('');
    expect(redactBlock(123)).toBe('');
  });
});

describe('apm-msg-parser.validateContext', () => {
  it('returns null when all context matches', () => {
    expect(validateContext(validMsg, {
      runId: 'run-001', expectedStep: 'qa', expectedAgent: 'qa-agent', expectedIteration: 1,
    })).toBeNull();
  });
  it('flags runid mismatch', () => {
    expect(validateContext(validMsg, {
      runId: 'other', expectedStep: 'qa', expectedAgent: 'qa-agent',
    })).toBe('context-runid-mismatch');
  });
  it('flags step mismatch', () => {
    expect(validateContext(validMsg, {
      runId: 'run-001', expectedStep: 'dev', expectedAgent: 'qa-agent',
    })).toBe('context-step-mismatch');
  });
  it('flags agent mismatch', () => {
    expect(validateContext(validMsg, {
      runId: 'run-001', expectedStep: 'qa', expectedAgent: 'dev-agent',
    })).toBe('context-agent-mismatch');
  });
  it('flags iteration mismatch', () => {
    expect(validateContext(validMsg, {
      runId: 'run-001', expectedStep: 'qa', expectedAgent: 'qa-agent', expectedIteration: 2,
    })).toBe('context-iteration-mismatch');
  });
});
