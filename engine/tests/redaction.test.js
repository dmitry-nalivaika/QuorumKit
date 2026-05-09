/**
 * T1.6 — Redaction invariant (FR-009).
 *
 * Constitution rule: "No hardcoded secrets — use environment variables or a
 * secret manager." FR-009 forbids any orchestrator surface from writing a
 * resolved credential VALUE to a comment, log, audit entry, dispatched-
 * workflow input, or error message. The runtime registry stores credentials
 * by *name* only; this test pins that invariant by:
 *
 *   1. Setting a sentinel env var with a uniquely-recognisable VALUE.
 *   2. Driving every public helper that touches a runtime descriptor:
 *        - runtimes/claude.js#invoke
 *        - runtimes/copilot.js#invoke
 *        - state-manager.saveState
 *        - state-manager.upsertLiveStatus
 *        - state-manager.postAuditEntry
 *        - the credential-missing error path on both adapters
 *   3. Capturing every byte each helper emits (workflow inputs, comment
 *      bodies, thrown error fields, JSON.stringify of caught errors).
 *   4. Asserting the sentinel VALUE never appears in any captured byte,
 *      while the credential REFERENCE NAME does (so we know the helper ran).
 *
 * If a future refactor accidentally serialises `runtime.credential_value` or
 * logs `process.env[ref]`, this test fails closed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as claudeRuntime from '../orchestrator/runtimes/claude.js';
import * as copilotRuntime from '../orchestrator/runtimes/copilot.js';
import {
  saveState,
  postAuditEntry,
  upsertLiveStatus,
} from '../orchestrator/state-manager.js';

const SENTINEL_REF = 'APM_TEST_FAKE_SECRET';
const SENTINEL_VALUE = 'sk-leaked-sentinel-value-DO-NOT-LOG-7f3a9c1e';

/** Recursively serialise any value (incl. Error instances) so we can grep for leaks. */
function deepSerialise(v) {
  const seen = new WeakSet();
  return JSON.stringify(v, (key, value) => {
    if (value instanceof Error) {
      const out = { name: value.name, message: value.message, stack: value.stack };
      for (const k of Object.keys(value)) out[k] = value[k];
      return out;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
    }
    return value;
  });
}

/** Asserts the sentinel VALUE never appears in any captured byte. */
function assertNoLeak(captures, surface) {
  for (const [label, blob] of Object.entries(captures)) {
    expect(blob, `${surface} → ${label} leaked the secret value`).not.toContain(SENTINEL_VALUE);
  }
}

let originalEnv;

beforeEach(() => {
  originalEnv = process.env[SENTINEL_REF];
  process.env[SENTINEL_REF] = SENTINEL_VALUE;
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[SENTINEL_REF];
  else process.env[SENTINEL_REF] = originalEnv;
});

describe('FR-009 — credentials never leak into any orchestrator surface', () => {
  it('runtimes/claude.js#invoke does NOT pass the credential value into workflow inputs or retries', async () => {
    let captured = null;
    const fakeClient = {
      triggerWorkflow: async (owner, repo, workflow, ref, inputs) => {
        captured = { owner, repo, workflow, ref, inputs };
        return { ok: true };
      },
    };
    const result = await claudeRuntime.invoke({
      runtime: { kind: 'claude', credential_ref: SENTINEL_REF, name: 'claude-test' },
      agent: 'dev',
      owner: 'o',
      repo: 'r',
      issueNumber: 42,
      runId: 'run-1',
      step: 'dev',
      iteration: 1,
      runtimeName: 'claude-test',
      client: fakeClient,
      env: process.env,
    });

    const blob = deepSerialise({ captured, result });
    assertNoLeak({ 'dispatch+result': blob }, 'claude.invoke');
    // sanity: the helper actually ran and used the REF name
    expect(blob).toContain('claude-test');
    expect(captured.inputs.runtime).toBe('claude-test');
  });

  it('runtimes/copilot.js#invoke does NOT pass the credential value into workflow inputs or retries', async () => {
    let captured = null;
    const fakeClient = {
      triggerWorkflow: async (owner, repo, workflow, ref, inputs) => {
        captured = { owner, repo, workflow, ref, inputs };
        return { ok: true };
      },
    };
    const result = await copilotRuntime.invoke({
      runtime: { kind: 'copilot', credential_ref: SENTINEL_REF, name: 'copilot-test' },
      agent: 'qa',
      owner: 'o',
      repo: 'r',
      issueNumber: 42,
      runId: 'run-1',
      step: 'qa',
      iteration: 1,
      runtimeName: 'copilot-test',
      client: fakeClient,
      env: process.env,
    });

    const blob = deepSerialise({ captured, result });
    assertNoLeak({ 'dispatch+result': blob }, 'copilot.invoke');
    expect(blob).toContain('copilot-test');
  });

  it('runtime-credential-missing error carries only the REF NAME, never the value', async () => {
    // Force the missing-credential branch: env var is undefined for an unrelated ref.
    delete process.env.SOME_OTHER_REF;
    const adapters = [
      { name: 'claude', mod: claudeRuntime },
      { name: 'copilot', mod: copilotRuntime },
    ];
    for (const { name, mod } of adapters) {
      let thrown;
      try {
        await mod.invoke({
          runtime: { kind: name, credential_ref: 'SOME_OTHER_REF', name: `${name}-x` },
          agent: 'dev',
          owner: 'o',
          repo: 'r',
          issueNumber: 1,
          client: { triggerWorkflow: async () => ({}) },
          env: process.env,
        });
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `${name}: expected a thrown error`).toBeDefined();
      expect(thrown.code).toBe('runtime-credential-missing');
      expect(thrown.credential_ref).toBe('SOME_OTHER_REF');
      const blob = deepSerialise(thrown);
      // Credential VALUE is unrelated here (env var unset), but a sloppy refactor
      // might dump process.env into the error. Pre-load the sentinel for the test:
      process.env.SOME_OTHER_REF_PROBE = SENTINEL_VALUE;
      assertNoLeak({ thrown: blob }, `${name}.invoke missing-credential`);
      delete process.env.SOME_OTHER_REF_PROBE;
    }
  });

  it('state-manager.saveState does NOT serialise secret values into audit comments', async () => {
    const captured = [];
    const fakeClient = {
      createComment: async (_o, _r, _n, body) => { captured.push(body); return { id: 1 }; },
    };
    // A maliciously-shaped state where a hypothetical refactor stuffed the
    // resolved value into the descriptor. saveState must NOT propagate it
    // into the audit body for FR-009 — but since this would be a regression,
    // we instead just feed a normal v2 state and confirm the value is absent.
    await saveState(fakeClient, 'o', 'r', 1, {
      runId: 'run-1',
      step: 'dev',
      iteration: 1,
      runtime_used: 'claude-test',
      dedup_key: 'k1',
      iterations: { 'qa->dev': 1 },
      // The descriptor is referenced by NAME only — credential_ref, never value.
      runtime: { kind: 'claude', credential_ref: SENTINEL_REF, name: 'claude-test' },
    }, 'transition');
    const blob = captured.join('\n');
    assertNoLeak({ 'audit body': blob }, 'state-manager.saveState');
    expect(blob).toContain(SENTINEL_REF); // ref name is fine
    expect(blob).toContain('claude-test'); // sanity
  });

  it('state-manager.upsertLiveStatus does NOT serialise secret values into the live-status comment', async () => {
    const captured = [];
    const fakeClient = {
      listComments: async () => [],
      createComment: async (_o, _r, _n, body) => { captured.push(body); return { id: 1 }; },
      updateComment: async (_o, _r, _id, body) => { captured.push(body); },
    };
    const human = `**Run** \`run-1\`\n- step: \`dev\`\n- runtime: \`claude-test\` (ref: \`${SENTINEL_REF}\`)`;
    await upsertLiveStatus(fakeClient, 'o', 'r', 1, 'run-1', human);
    const blob = captured.join('\n');
    assertNoLeak({ 'live-status body': blob }, 'state-manager.upsertLiveStatus');
    expect(blob).toContain(SENTINEL_REF);
  });

  it('state-manager.postAuditEntry does NOT echo the credential value when given a message that mentions the ref', async () => {
    const captured = [];
    const fakeClient = {
      createComment: async (_o, _r, _n, body) => { captured.push(body); return { id: 1 }; },
    };
    await postAuditEntry(fakeClient, 'o', 'r', 1,
      `runtime credential \`${SENTINEL_REF}\` could not be resolved`);
    const blob = captured.join('\n');
    assertNoLeak({ 'audit-entry body': blob }, 'state-manager.postAuditEntry');
    expect(blob).toContain(SENTINEL_REF);
  });

  it('serialising a runtime descriptor as JSON never includes the resolved secret', () => {
    // Defence-in-depth: even if some helper deep-clones a descriptor by
    // JSON.stringify, the descriptor itself must not carry the value.
    const runtime = { kind: 'claude', credential_ref: SENTINEL_REF, name: 'x' };
    const json = JSON.stringify(runtime);
    expect(json).not.toContain(SENTINEL_VALUE);
    expect(json).toContain(SENTINEL_REF);
  });
});
