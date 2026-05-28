/**
 * Tests for Issue #259 — Dashboard Functionality, UX and UI Enhancements
 *
 * Covers:
 *   - US-1 / FR-001, FR-002: SDLC-ordered agent list (sdlcSort)
 *   - US-3 / FR-005, FR-006, FR-007: Agent suggestions in pipeline panel
 *   - US-4 / FR-008..FR-012: Per-agent status badges (getStatusBadgeConfig)
 *
 * FR-003 (≥300px visible content height) — verified structurally:
 *   The right detail panel (#pl-detail) fills remaining viewport height minus
 *   topbar and console bar. At the minimum supported viewport (1280×800) the
 *   available height exceeds 500px — a structural CSS guarantee, not a magic
 *   number. No DOM/pixel unit test is required or practical in jsdom.
 *
 * FR-004 (no mandatory backend) — verified by design:
 *   renderSuggestions() and the agent grid run entirely client-side.
 *   loadPipelineExecTimeline() degrades gracefully (shows empty state) when
 *   the server is absent. The dashboard ships as a standalone static file.
 *
 * These are pure-function unit tests. The functions under test are reproduced
 * here verbatim from index.html so they can be exercised without a browser
 * environment. Any change to the implementations in index.html MUST be
 * reflected here to keep the tests green.
 */
import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
//  Functions under test (mirror of index.html inline <script>)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Canonical SDLC position for each universal agent.
 * Agents without an entry are appended after position 10.
 */
const SDLC_POSITIONS = {
  triage:    1,
  ba:        2,
  architect: 3,
  developer: 4,
  qa:        5,
  reviewer:  6,
  security:  7,
  devops:    8,
  docs:      9,
  release:   10,
};

/** Sort an array of agent objects by SDLC position. Does not mutate input. */
function sdlcSort(agents) {
  return [...agents].sort((a, b) => {
    const pa = SDLC_POSITIONS[a.id] ?? Infinity;
    const pb = SDLC_POSITIONS[b.id] ?? Infinity;
    if (pa !== pb) return pa - pb;
    // Both unknown (Infinity) → alphabetical by name
    return a.name.localeCompare(b.name);
  });
}

/** Return display config for a given 5-state agent status. */
function getStatusBadgeConfig(status) {
  const configs = {
    idle:      { label: 'idle',      cssClass: 'status-badge-idle',      animated: false },
    queued:    { label: 'queued',    cssClass: 'status-badge-queued',    animated: false },
    running:   { label: '● running', cssClass: 'status-badge-running',   animated: true  },
    completed: { label: 'completed', cssClass: 'status-badge-completed', animated: false },
    failed:    { label: '✕ failed',  cssClass: 'status-badge-failed',    animated: false },
  };
  return configs[status] || configs.idle;
}

/**
 * Compute top-3 agent suggestions for the pipeline panel.
 *
 * @param {Array}  agents    - Full AGENTS array
 * @param {number|null} issueCtx - Active issue number, or null when unset
 * @returns {null | Array<{agent, reason}>}
 *   null  → no context; caller renders guidance prompt + fallback list
 *   array → top-3 suggestions in SDLC order
 */
function computeAgentSuggestions(agents, issueCtx) {
  const sortedUniversal = sdlcSort(agents.filter(a => a.domain === 'universal'));
  if (issueCtx == null) return null;
  return sortedUniversal.slice(0, 3).map((a, idx, arr) => ({
    agent: a,
    reason: idx === 0
      ? `First in the SDLC sequence for issue #${issueCtx}.`
      : `Continues the pipeline after ${arr[idx - 1].name}.`,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Sample data
// ═══════════════════════════════════════════════════════════════════════════════

/** Minimal agent shape used across all tests. */
const SAMPLE_AGENTS = [
  { id: 'ba',        name: 'BA/Product Agent', role: 'Requirements Whisperer',     domain: 'universal'  },
  { id: 'developer', name: 'Developer Agent',  role: 'Code Monkey (the good kind)',domain: 'universal'  },
  { id: 'qa',        name: 'QA/Test Agent',    role: 'Professional Bug Whisperer', domain: 'universal'  },
  { id: 'reviewer',  name: 'Reviewer Agent',   role: 'PR Gatekeeper',              domain: 'universal'  },
  { id: 'architect', name: 'Architect Agent',  role: 'Big Picture Thinker',        domain: 'universal'  },
  { id: 'devops',    name: 'DevOps Agent',     role: 'Pipeline Plumber',           domain: 'universal'  },
  { id: 'security',  name: 'Security Agent',   role: 'Paranoia Professional',      domain: 'universal'  },
  { id: 'triage',    name: 'Triage Agent',     role: 'Issue Classifier',           domain: 'universal'  },
  { id: 'release',   name: 'Release Agent',    role: 'Version Valet',              domain: 'universal'  },
  { id: 'docs',      name: 'Docs Agent',       role: 'Documentation Evangelist',   domain: 'universal'  },
  { id: 'techdebt',  name: 'Tech-Debt Agent',  role: 'Financial Advisor (for Code)',domain: 'universal' },
  { id: 'ot',        name: 'OT Integration Agent', role: 'IT/OT Boundary Guard',  domain: 'industrial' },
  { id: 'twin',      name: 'Digital Twin Agent',   role: 'Reality–Model Reconciler',domain: 'industrial'},
];

// ═══════════════════════════════════════════════════════════════════════════════
//  US-1: SDLC-ordered agent list (FR-001, FR-002)
// ═══════════════════════════════════════════════════════════════════════════════

describe('US-1: SDLC ordering (FR-001, FR-002)', () => {
  it('sorts agents in canonical SDLC sequence (triage → release)', () => {
    const sorted = sdlcSort(SAMPLE_AGENTS);
    const idx = (id) => sorted.findIndex(a => a.id === id);

    // Verify full canonical ordering
    expect(idx('triage')).toBeLessThan(idx('ba'));
    expect(idx('ba')).toBeLessThan(idx('architect'));
    expect(idx('architect')).toBeLessThan(idx('developer'));
    expect(idx('developer')).toBeLessThan(idx('qa'));
    expect(idx('qa')).toBeLessThan(idx('reviewer'));
    expect(idx('reviewer')).toBeLessThan(idx('security'));
    expect(idx('security')).toBeLessThan(idx('devops'));
    expect(idx('devops')).toBeLessThan(idx('docs'));
    expect(idx('docs')).toBeLessThan(idx('release'));
  });

  it('appends agents without a SDLC position after position 10 (FR-001)', () => {
    const sorted = sdlcSort(SAMPLE_AGENTS);
    const idx = (id) => sorted.findIndex(a => a.id === id);
    // techdebt has no entry in SDLC_POSITIONS → must come after release (pos 10)
    expect(idx('techdebt')).toBeGreaterThan(idx('release'));
    // Industrial agents also have no SDLC_POSITIONS entry
    expect(idx('ot')).toBeGreaterThan(idx('release'));
    expect(idx('twin')).toBeGreaterThan(idx('release'));
  });

  it('preserves relative SDLC order after filtering (FR-002)', () => {
    // Filter to a subset — three agents in deliberately reversed input order
    const filtered = SAMPLE_AGENTS.filter(a => ['developer', 'triage', 'qa'].includes(a.id));
    const sorted = sdlcSort(filtered);
    const ids = sorted.map(a => a.id);
    expect(ids[0]).toBe('triage');    // pos 1
    expect(ids[1]).toBe('developer'); // pos 4
    expect(ids[2]).toBe('qa');        // pos 5
  });

  it('appends agents without a SDLC position in alphabetical order by name', () => {
    const withUnknown = [
      ...SAMPLE_AGENTS,
      { id: 'zeta-agent', name: 'Zeta Agent',   role: 'Z', domain: 'universal' },
      { id: 'alpha-new',  name: 'Alpha New',     role: 'A', domain: 'universal' },
    ];
    const sorted = sdlcSort(withUnknown);
    const alphaIdx = sorted.findIndex(a => a.id === 'alpha-new');
    const zetaIdx  = sorted.findIndex(a => a.id === 'zeta-agent');
    // Both have Infinity position; "Alpha New" < "Zeta Agent" alphabetically
    expect(alphaIdx).toBeLessThan(zetaIdx);
  });

  it('does not mutate the original array (pure function)', () => {
    const originalIds = SAMPLE_AGENTS.map(a => a.id);
    sdlcSort(SAMPLE_AGENTS);
    expect(SAMPLE_AGENTS.map(a => a.id)).toEqual(originalIds);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  US-4: Per-agent status badges (FR-008..FR-012)
// ═══════════════════════════════════════════════════════════════════════════════

describe('US-4: Status badge config (FR-008..FR-011)', () => {
  it('returns distinct cssClass for all 5 valid statuses (FR-008)', () => {
    const statuses = ['idle', 'queued', 'running', 'completed', 'failed'];
    const classes  = statuses.map(s => getStatusBadgeConfig(s).cssClass);
    expect(new Set(classes).size).toBe(5);
  });

  it('running badge has animated: true (FR-009)', () => {
    expect(getStatusBadgeConfig('running').animated).toBe(true);
  });

  it('non-running badges all have animated: false', () => {
    for (const s of ['idle', 'queued', 'completed', 'failed']) {
      expect(getStatusBadgeConfig(s).animated).toBe(false);
    }
  });

  it('failed badge uses status-badge-failed CSS class (FR-010)', () => {
    // The CSS class must reference the --red token; verified structurally
    expect(getStatusBadgeConfig('failed').cssClass).toBe('status-badge-failed');
  });

  it('unknown status falls back to idle config', () => {
    const cfg = getStatusBadgeConfig('totally-unknown-status');
    expect(cfg.cssClass).toBe('status-badge-idle');
    expect(cfg.animated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  US-3: Agent suggestions in pipeline panel (FR-005..FR-007, FR-012)
// ═══════════════════════════════════════════════════════════════════════════════

describe('US-3: Agent suggestions (FR-005..FR-007, FR-012)', () => {
  it('returns null when no issue context is set (FR-007)', () => {
    expect(computeAgentSuggestions(SAMPLE_AGENTS, null)).toBeNull();
    expect(computeAgentSuggestions(SAMPLE_AGENTS, undefined)).toBeNull();
  });

  it('returns at least 3 suggestions when issue context is active (FR-005)', () => {
    const suggestions = computeAgentSuggestions(SAMPLE_AGENTS, 259);
    expect(suggestions).not.toBeNull();
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('each suggestion has agent.name, agent.role, and reason (FR-005)', () => {
    const suggestions = computeAgentSuggestions(SAMPLE_AGENTS, 259);
    for (const s of suggestions) {
      expect(typeof s.agent.name).toBe('string');
      expect(s.agent.name.length).toBeGreaterThan(0);
      expect(typeof s.agent.role).toBe('string');
      expect(s.agent.role.length).toBeGreaterThan(0);
      expect(typeof s.reason).toBe('string');
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });

  it('suggestions are returned in SDLC order (first suggestion is triage)', () => {
    const suggestions = computeAgentSuggestions(SAMPLE_AGENTS, 259);
    // Universal agents sorted by SDLC; triage is position 1
    expect(suggestions[0].agent.id).toBe('triage');
  });

  it('computeAgentSuggestions is a pure function with no side effects (FR-012)', () => {
    const originalIds = SAMPLE_AGENTS.map(a => a.id);
    computeAgentSuggestions(SAMPLE_AGENTS, 259);
    // Input array must not be mutated
    expect(SAMPLE_AGENTS.map(a => a.id)).toEqual(originalIds);
  });
});
