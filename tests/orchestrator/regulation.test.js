import { describe, it, expect } from 'vitest';
import { parseRegulation, loadRegulation } from '../../scripts/orchestrator/regulation.js';

describe('regulation.parseRegulation', () => {
  it('returns empty sets for empty input', () => {
    const r = parseRegulation('');
    expect(r.labels.size).toBe(0);
    expect(r.outcomes.size).toBe(0);
    expect(r.triggers.size).toBe(0);
  });

  it('extracts labels, outcomes, and triggers from a tiny synthetic doc', () => {
    const md = `
## 1. Labels

| Label | Applied by |
|---|---|
| \`agent:dev\` | Orchestrator |
| \`status:running\` | Orchestrator |
| \`loop:active\` | Orchestrator |
| \`gate:approval-open\` | Orchestrator |
| \`triaged\` | Triage |
| \`type:feature\` | Triage |

## 2. apm-msg Outcomes

| Outcome | Semantics |
|---|---|
| \`success\` | … |
| \`fail\` | … |

## 3. Examples

irrelevant.

## 4. Triggers

\`issues.opened\` and \`issues.labeled\`. Also \`workflow_dispatch\`.

## 5. Etiquette

…
`;
    const r = parseRegulation(md);
    expect(r.labels.has('agent:dev')).toBe(true);
    expect(r.labels.has('status:running')).toBe(true);
    expect(r.labels.has('loop:active')).toBe(true);
    expect(r.labels.has('gate:approval-open')).toBe(true);
    expect(r.labels.has('triaged')).toBe(true);
    expect(r.labels.has('type:feature')).toBe(true);
    expect(r.outcomes.has('success')).toBe(true);
    expect(r.outcomes.has('fail')).toBe(true);
    expect(r.triggers.has('issues.opened')).toBe(true);
    expect(r.triggers.has('issues.labeled')).toBe(true);
    expect(r.triggers.has('workflow_dispatch')).toBe(true);
  });
});

describe('regulation.loadRegulation', () => {
  it('parses the shipped docs/AGENT_PROTOCOL.md', async () => {
    const r = await loadRegulation('/Users/Dmitry_Nalivaika/Documents/Projects/APM');
    expect(r.found).toBe(true);
    // Spot-check a few canonical identifiers we shipped in Phase 1.
    expect(r.labels.has('status:needs-human')).toBe(true);
    expect(r.outcomes.has('success')).toBe(true);
    expect(r.outcomes.has('runtime-error')).toBe(true);
    expect(r.outcomes.has('protocol-violation')).toBe(true);
    expect(r.triggers.has('issues.labeled')).toBe(true);
    expect(r.triggers.has('workflow_run.completed')).toBe(true);
  });
});
