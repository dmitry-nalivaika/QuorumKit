import { describe, it, expect } from 'vitest';
import { buildLookup, resolveLogin } from '../orchestrator/identity-registry.js';

const sample = {
  identities: [
    { agent: 'qa-agent', logins: ['github-actions[bot]', 'apm-qa-bot'] },
    { agent: 'dev-agent', logins: ['apm-dev-bot'] },
  ],
};

describe('identity-registry.buildLookup', () => {
  it('builds a case-insensitive login map', () => {
    const r = buildLookup(sample);
    expect(r.ok).toBe(true);
    expect(resolveLogin(r.byLogin, 'apm-dev-bot')).toBe('dev-agent');
    expect(resolveLogin(r.byLogin, 'APM-Dev-Bot')).toBe('dev-agent');
    expect(resolveLogin(r.byLogin, 'github-actions[bot]')).toBe('qa-agent');
  });

  it('returns null for unknown logins', () => {
    const r = buildLookup(sample);
    expect(resolveLogin(r.byLogin, 'random-user')).toBeNull();
  });

  it('rejects schema-invalid input', () => {
    const r = buildLookup({});
    expect(r.ok).toBe(false);
    expect(r.errors[0].code).toBe('SCHEMA_INVALID');
  });

  it('supports many-to-one mapping', () => {
    const many = {
      identities: [
        { agent: 'qa-agent', logins: ['a', 'b', 'c'] },
      ],
    };
    const r = buildLookup(many);
    expect(resolveLogin(r.byLogin, 'a')).toBe('qa-agent');
    expect(resolveLogin(r.byLogin, 'b')).toBe('qa-agent');
    expect(resolveLogin(r.byLogin, 'c')).toBe('qa-agent');
  });
});
