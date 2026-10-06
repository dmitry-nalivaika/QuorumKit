/**
 * Dashboard Cost & Tokens panel (Issue #335, FR-009, FR-012, FR-013, FR-014, FR-016).
 * Structural checks on index.html — no browser runner exists in this suite.
 */
import { describe, it, expect } from 'vitest';
import fs   from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(new URL(import.meta.url).pathname, '../../..');
const html = fs.readFileSync(path.join(REPO_ROOT, 'engine/dashboard/index.html'), 'utf8');

function functionBody(name) {
  const start = html.indexOf(`function ${name}(`);
  expect(start, `function ${name} not found`).toBeGreaterThan(-1);
  const next = html.indexOf('\nfunction ', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

describe('Timeline Cost & Tokens panel', () => {
  it('has a panel container between the toolbar and the event list', () => {
    const toolbar = html.indexOf('class="tl-toolbar"');
    const panel   = html.indexOf('id="tl-cost"');
    const events  = html.indexOf('id="tl-events"');
    expect(toolbar).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(toolbar);
    expect(events).toBeGreaterThan(panel);
  });

  it('renders from data.costTokens inside renderTimeline', () => {
    expect(functionBody('renderTimeline')).toContain('renderCostTokens(data.costTokens)');
  });

  it('shows total tokens, estimated cost, per-agent rows, and the not-tracked / partial notes', () => {
    const body = functionBody('renderCostTokens');
    for (const needle of ['totalTokens', 'estimatedCostUsd', 'byAgent', 'untrackedInvocations', 'costUnknownInvocations', 'disclaimer']) {
      expect(body).toContain(needle);
    }
    expect(body).toMatch(/not tracked/i);
    expect(body).toMatch(/incomplete/i);
    expect(body).toMatch(/unknown/i);
  });

  it('is read-only: no network calls, handlers, or innerHTML writes (FR-012)', () => {
    const body = functionBody('renderCostTokens');
    expect(body).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|onclick|addEventListener|innerHTML/);
  });
});

describe('Cost & Tokens main view (cross-feature, US-3, FR-010, FR-011)', () => {
  it('adds a main-nav tab and a view container wired to the workspace view class', () => {
    expect(html).toMatch(/<button class="mnav-tab"\s+data-mv="cost">[^<]*Cost &amp; Tokens<\/button>/);
    expect(html).toContain('id="cost-view"');
    expect(html).toContain('#workspace.view-cost #cost-view');
    expect(html).toContain('#workspace.view-cost #pm-view');
  });

  it('switchMainView toggles the view class and loads the overview on entry', () => {
    const body = functionBody('switchMainView');
    expect(body).toContain("'view-cost'");
    expect(body).toContain('loadCostOverview()');
  });

  it('renders per-feature and per-agent totals with partial / not-tracked indicators and the estimate label', () => {
    const body = functionBody('renderCostOverview');
    for (const needle of ['byFeature', 'byAgent', 'totalTokens', 'estimatedCostUsd', 'untrackedInvocations', 'costUnknownInvocations', 'disclaimer']) {
      expect(body).toContain(needle);
    }
    expect(body).toMatch(/not tracked/i);
    expect(body).toMatch(/incomplete/i);
  });

  it('render function is read-only: no network calls, handlers, or innerHTML writes (FR-012)', () => {
    expect(functionBody('renderCostOverview')).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|onclick|addEventListener|innerHTML/);
  });

  it('loads data with a single GET to /api/cost-tokens and never writes (FR-012)', () => {
    const body = functionBody('loadCostOverview');
    expect(body).toContain('/api/cost-tokens');
    expect(body).not.toMatch(/method\s*:|POST|PUT|DELETE|body\s*:/);
  });
});
