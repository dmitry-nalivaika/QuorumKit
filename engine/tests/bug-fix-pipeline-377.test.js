/**
 * engine/tests/bug-fix-pipeline-377.test.js
 *
 * Issue #377 / ADR-377 / specs/377-bug-fix-pipeline-spec-gate/spec.md
 *
 * The bug-fix pipeline used to be `dev -> qa -> reviewer`. The Developer Agent refuses to
 * start without a spec (Constitution §III), so every `type:bug` issue stopped at `dev`, and
 * `dev` + `spec_gap` looped back to `dev`. The pipeline now starts with a `ba` step and
 * routes spec gaps to it.
 *
 * Covers FR-001..FR-009, FR-011, FR-015, FR-017, FR-022, FR-023.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { normalise } from '../orchestrator/pipeline-loader.js';
import { validatePipeline } from '../orchestrator/pipeline-validator.js';
import { resolveTransition } from '../orchestrator/router-v2.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => readFileSync(resolve(ROOT, rel), 'utf8');

const raw = yaml.load(read('src/pipelines/bug-fix-pipeline.yml'));
const bug = normalise(raw);
const feature = normalise(yaml.load(read('src/pipelines/feature-pipeline.yml')));

describe('bug-fix-pipeline chain (FR-001, FR-002, FR-008, FR-023)', () => {
  it('has ba as the entry step', () => {
    expect(bug.entry).toBe('ba');
  });

  it('declares steps in order ba -> dev -> qa -> reviewer', () => {
    expect(bug.steps.map(s => s.name)).toEqual(['ba', 'dev', 'qa', 'reviewer']);
    expect(bug.steps[0].agent).toBe('ba-agent');
  });

  it('gives the ba step the same time limit as the feature pipeline', () => {
    const ba = bug.steps.find(s => s.name === 'ba');
    const featureBa = feature.steps.find(s => s.name === 'ba');
    expect(ba.timeout_minutes).toBe(60);
    expect(ba.timeout_minutes).toBe(featureBa.timeout_minutes);
  });

  it('keeps trigger, schema version and loop budget unchanged', () => {
    expect(raw.schema_version).toBe('2');
    expect(raw.trigger).toEqual({ event: 'issues.labeled', labels: ['triaged', 'type:bug'] });
    expect(raw.loop_budget).toEqual({
      max_iterations_per_edge: 3,
      max_total_steps: 20,
      max_wallclock_minutes: 480,
    });
  });

  it('does not pin a runtime on the ba step (inherits the default)', () => {
    expect(bug.steps.find(s => s.name === 'ba').runtime).toBeUndefined();
  });

  it('passes the pipeline validator', () => {
    // The loader validates the raw parsed YAML (pipeline-loader.js), not the normalised form.
    expect(validatePipeline(raw, {})).toEqual([]);
  });
});

describe('bug-fix-pipeline routing (FR-003..FR-007, FR-022)', () => {
  const route = (from, outcome) => resolveTransition(bug, from, outcome);

  it('ba success -> dev (forward)', () => {
    expect(route('ba', 'success')).toEqual({ to: 'dev', isBackward: false });
  });

  it('ba spec_gap -> ba', () => {
    expect(route('ba', 'spec_gap')?.to).toBe('ba');
  });

  it('ba needs-human -> ba', () => {
    expect(route('ba', 'needs-human')?.to).toBe('ba');
  });

  it('dev spec_gap -> ba (was dev: self-loop)', () => {
    expect(route('dev', 'spec_gap')).toEqual({ to: 'ba', isBackward: true });
  });

  it('reviewer spec_gap -> ba', () => {
    expect(route('reviewer', 'spec_gap')).toEqual({ to: 'ba', isBackward: true });
  });

  it.each([
    ['dev', 'success', 'qa'],
    ['qa', 'success', 'reviewer'],
    ['qa', 'fail', 'dev'],
    ['qa', 'blocker', 'dev'],
    ['qa', 'timeout', 'dev'],
    ['reviewer', 'fail', 'dev'],
    ['reviewer', 'blocker', 'dev'],
    ['dev', 'blocker', 'dev'],
    ['dev', 'needs-human', 'dev'],
  ])('unchanged route: %s %s -> %s', (from, outcome, to) => {
    expect(route(from, outcome)?.to).toBe(to);
  });

  it('mirrors the feature pipeline for every spec_gap route to ba', () => {
    for (const from of ['dev', 'reviewer']) {
      expect(resolveTransition(bug, from, 'spec_gap')?.to)
        .toBe(resolveTransition(feature, from, 'spec_gap')?.to);
    }
  });

  it('has no transition that targets an undeclared step', () => {
    const names = new Set(bug.steps.map(s => s.name));
    for (const t of bug.transitions) {
      expect(names.has(t.from), `from ${t.from}`).toBe(true);
      expect(names.has(t.to), `to ${t.to}`).toBe(true);
    }
  });
});

describe('Developer Agent reports a missing spec as spec_gap (FR-009, FR-010, FR-017)', () => {
  const COPIES = ['src/agents/developer-agent.md', '.github/agents/developer-agent.md'];

  for (const rel of COPIES) {
    it(`${rel}: a missing spec is spec_gap, not blocker`, () => {
      const text = read(rel);
      expect(text).toMatch(/missing[^\n]*spec[^\n]*`spec_gap`|`spec_gap`[^\n]*missing[^\n]*spec/i);
      expect(text).toMatch(/not\s+`blocker`/);
    });

    it(`${rel}: still forbids writing or skipping specs`, () => {
      const text = read(rel);
      expect(text).toMatch(/does \*\*not\*\* write specs/);
      expect(text).toMatch(/MUST NOT (?:author|draft|write|skip)[^\n]*spec/i);
    });
  }

  it('src and .github copies are identical', () => {
    expect(read(COPIES[0])).toBe(read(COPIES[1]));
  });
});

describe('BA Agent bug-fix spec format, Template C (FR-011..FR-017)', () => {
  const COPIES = ['src/agents/ba-product-agent.md', '.github/agents/ba-product-agent.md'];

  for (const rel of COPIES) {
    describe(rel, () => {
      const text = read(rel);

      it('defines Template C — Bug Fix', () => {
        expect(text).toMatch(/### Template C — Bug Fix/);
      });

      it('directs the agent to use it for type:bug issues', () => {
        expect(text).toMatch(/`type:bug`[^\n]*Template C|Template C[^\n]*`type:bug`/);
      });

      it('requires the FR-012 sections', () => {
        const start = text.indexOf('### Template C — Bug Fix');
        const end = text.indexOf('## Branch, Commit & PR');
        expect(start).toBeGreaterThan(-1);
        const tpl = text.slice(start, end);
        for (const needle of [
          '## Overview',
          '## Reproduction',
          '## Functional Requirements',
          '## Success Criteria',
          '## Out of Scope',
          '## Security and Privacy Considerations',
          '## Open Questions',
        ]) {
          expect(tpl, needle).toContain(needle);
        }
        expect(tpl).toMatch(/regression test/i);
        expect(tpl).toMatch(/fails? before[^\n]*pass(?:es)? after/i);
        expect(tpl).not.toMatch(/## User Stories|## Key Entities/);
      });

      it('says the format is short and the checklist must not demand feature-only sections', () => {
        expect(text).toMatch(/intentionally short/i);
        expect(text).toMatch(/user stor(?:y|ies)[^\n]*key entities|key entities[^\n]*user stor/i);
      });

      it('lists Template C in the handoff checklist', () => {
        expect(text).toMatch(/Template C for[^\n]*bug/i);
      });
    });
  }

  it('src and .github copies are identical', () => {
    expect(read(COPIES[0])).toBe(read(COPIES[1]));
  });
});

describe('docs and changelog (FR-018..FR-021)', () => {
  it('PIPELINES.md shows the bug-fix chain as ba -> dev -> qa -> reviewer', () => {
    const text = read('docs/PIPELINES.md');
    expect(text).toMatch(/bug-fix-pipeline\.yml[^\n]*`ba → dev → qa → reviewer`/);
    expect(text).not.toMatch(/bug-fix-pipeline\.yml[^\n]*`dev → qa → reviewer`/);
  });

  it('AGENT_INVENTORY.md lists the bug-fix pipeline against ba-agent', () => {
    const row = read('docs/AGENT_INVENTORY.md').split('\n').find(l => l.startsWith('| ba-agent'));
    expect(row).toBeDefined();
    expect(row).toMatch(/bug-fix-pipeline \(ba\)/);
  });

  it('CHANGELOG.md records #377', () => {
    expect(read('CHANGELOG.md')).toMatch(/#377/);
  });

  it('MIGRATION.md describes the bug-fix pipeline change and the no-overwrite behaviour', () => {
    const text = read('docs/MIGRATION.md');
    expect(text).toMatch(/#377/);
    expect(text).toMatch(/bug-fix-pipeline\.yml/);
    expect(text).toMatch(/not overwrit|does not overwrite|left untouched/i);
  });

  it('the pipeline file header documents the new chain', () => {
    expect(read('src/pipelines/bug-fix-pipeline.yml')).toMatch(/Chain: ba → dev → qa → reviewer/);
  });
});
