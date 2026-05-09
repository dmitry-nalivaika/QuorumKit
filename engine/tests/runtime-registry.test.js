import { describe, it, expect } from 'vitest';
import { validateRegistry, resolveRuntime, ENABLED_KINDS, RESERVED_KINDS } from '../orchestrator/runtime-registry.js';

const goodRegistry = {
  default_runtime: 'copilot-default',
  agent_defaults: { qa: 'claude-default' },
  runtimes: {
    'copilot-default': { kind: 'copilot', endpoint: 'https://models.github.ai', credential_ref: 'GITHUB_TOKEN' },
    'claude-default': { kind: 'claude', endpoint: 'https://api.anthropic.com', credential_ref: 'ANTHROPIC_API_KEY' },
  },
};

describe('runtime-registry.validateRegistry', () => {
  it('accepts the canonical claude+copilot registry', () => {
    expect(validateRegistry(goodRegistry)).toEqual([]);
  });

  it('rejects every reserved kind with RUNTIME_KIND_NOT_ENABLED', () => {
    for (const kind of RESERVED_KINDS) {
      const r = {
        runtimes: {
          x: { kind, endpoint: 'e', credential_ref: 'C' },
        },
      };
      const errs = validateRegistry(r);
      expect(errs.some(e => e.code === 'RUNTIME_KIND_NOT_ENABLED' && e.message.includes(kind))).toBe(true);
    }
  });

  it('rejects an unknown kind not on either list', () => {
    const errs = validateRegistry({
      runtimes: { x: { kind: 'made-up', endpoint: 'e', credential_ref: 'C' } },
    });
    expect(errs.some(e => e.code === 'RUNTIME_KIND_NOT_ENABLED')).toBe(true);
  });

  it('rejects schema-invalid registries', () => {
    expect(validateRegistry({}).some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
    expect(validateRegistry({ runtimes: { x: { kind: 'claude' } } }).some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('flags PROJECT_DEFAULT_UNKNOWN_RUNTIME', () => {
    const r = { ...goodRegistry, default_runtime: 'no-such' };
    expect(validateRegistry(r).some(e => e.code === 'PROJECT_DEFAULT_UNKNOWN_RUNTIME')).toBe(true);
  });

  it('flags AGENT_DEFAULT_UNKNOWN_RUNTIME', () => {
    const r = { ...goodRegistry, agent_defaults: { qa: 'no-such' } };
    expect(validateRegistry(r).some(e => e.code === 'AGENT_DEFAULT_UNKNOWN_RUNTIME')).toBe(true);
  });

  it('disallows additionalProperties on a runtime entry', () => {
    const r = {
      runtimes: { x: { kind: 'claude', endpoint: 'e', credential_ref: 'C', extra: 1 } },
    };
    expect(validateRegistry(r).some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });
});

describe('runtime-registry.resolveRuntime — precedence', () => {
  it('step-level wins over agent and project default', () => {
    const r = resolveRuntime({ registry: goodRegistry, agent: 'qa', stepRuntime: 'copilot-default' });
    expect(r.name).toBe('copilot-default');
    expect(r.source).toBe('step');
  });

  it('agent default wins over project default when no step-level set', () => {
    const r = resolveRuntime({ registry: goodRegistry, agent: 'qa' });
    expect(r.name).toBe('claude-default');
    expect(r.source).toBe('agent');
  });

  it('falls back to project default when no step or agent default', () => {
    const r = resolveRuntime({ registry: goodRegistry, agent: 'dev' });
    expect(r.name).toBe('copilot-default');
    expect(r.source).toBe('project');
  });

  it('returns runtime-unresolved when nothing resolves', () => {
    const r = resolveRuntime({ registry: { runtimes: {} }, agent: 'dev' });
    expect(r.error).toBe('runtime-unresolved');
    expect(r.detail.agent).toBe('dev');
  });

  it('does not match a named runtime that is not declared', () => {
    const r = resolveRuntime({ registry: goodRegistry, agent: 'qa', stepRuntime: 'no-such' });
    // step level missing → falls through to agent default
    expect(r.name).toBe('claude-default');
  });
});

describe('runtime-registry.ENABLED_KINDS', () => {
  it('ships exactly claude and copilot in v2 (ADR-005)', () => {
    expect(new Set(ENABLED_KINDS)).toEqual(new Set(['claude', 'copilot']));
  });
});
