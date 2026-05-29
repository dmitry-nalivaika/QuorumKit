/**
 * Tests for Issue #273 — Stop/Join buttons restored to pipeline row header
 *
 * Covers:
 *   FR-001: ■ Stop button rendered in always-visible header row
 *   FR-002: ⎇ Join button rendered in always-visible header row
 *   FR-003: Buttons survive re-renders (poll cycles — buildPipelineCard called again)
 *   FR-004: Stop button click invokes onStop handler with button element
 *   FR-005: Join button click invokes onJoin handler with button element
 *   FR-006: No collapsible body div rendered (card has exactly 1 child)
 *   FR-007: Header row click invokes onDetail handler with card element
 *
 * Pure-function unit tests. buildPipelineCard() is mirrored verbatim from
 * engine/dashboard/index.html — any change to that function MUST be reflected here.
 *
 * A self-contained FakeDocument mock is used so no jsdom or browser environment
 * is required. The test environment stays 'node'.
 */
import { describe, it, expect, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
//  Minimal DOM mock (no external deps required)
// ═══════════════════════════════════════════════════════════════════════════════

class FakeElement {
  constructor(tag) {
    this.tag        = tag.toLowerCase();
    this.children   = [];
    this.className  = '';
    this.textContent = '';
    this.title      = '';
    this.dataset    = {};
    this.style      = { cssText: '' };
    this._listeners = {};
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  /** Fire all registered listeners of `type`. */
  _fire(type, extraProps = {}) {
    const e = { type, stopPropagation: vi.fn(), ...extraProps };
    (this._listeners[type] || []).forEach(fn => fn(e));
    return e;
  }
}

class FakeDocument {
  createElement(tag) { return new FakeElement(tag); }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Function under test — mirrored verbatim from engine/dashboard/index.html
//  KEEP IN SYNC with the implementation.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a single pipeline card element for the Local Pipelines panel.
 * The card has exactly ONE child: the always-visible header row.
 * No collapsible body is created (FR-006).
 *
 * @param {Object}   p            - Pipeline: { issueNumber, branch, mode, runningAgent }
 * @param {Object}   opts
 * @param {Function} opts.onStop   - Called with (btn) when ■ Stop is clicked
 * @param {Function} opts.onJoin   - Called with (btn) when ⎇ Join is clicked
 * @param {Function} opts.onDetail - Called with (card) when the header row is clicked
 * @param {Document} [opts.doc]    - Document for element creation (default: global document)
 * @returns {HTMLElement}
 */
function buildPipelineCard(p, { onStop, onJoin, onDetail, doc = document } = {}) {
  const card = doc.createElement('div');
  card.className = 'lp-row';
  card.dataset.issue = p.issueNumber;
  card.style.cssText = 'flex-direction:column;gap:0;padding:0;border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden';

  // Header row — always visible (split-panel layout; no collapsible body)
  const hdr = doc.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 10px;cursor:pointer;background:var(--surface2)';
  hdr.addEventListener('click', () => onDetail(card));

  const num = doc.createElement('span');
  num.className = 'lp-num'; num.textContent = `#${p.issueNumber}`;

  const branch = doc.createElement('span');
  branch.className = 'lp-branch'; branch.textContent = p.branch;

  const modeBadge = doc.createElement('span');
  modeBadge.style.cssText = 'font-size:9px;padding:1px 5px;border-radius:3px;background:var(--surface3);color:var(--text3);font-weight:600';
  modeBadge.textContent = p.mode || 'isolated';

  if (p.runningAgent) {
    const dot = doc.createElement('span');
    dot.title = 'Agent running';
    dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block;animation:pulse 1.4s infinite;flex-shrink:0';
    hdr.appendChild(dot);
  }

  // Action buttons — always visible in header row (FR-001, FR-002)
  const hdrActions = doc.createElement('div');
  hdrActions.className = 'lp-actions';
  hdrActions.style.cssText = 'margin-left:auto;display:flex;gap:4px;align-items:center';

  const stopBtn = doc.createElement('button');
  stopBtn.className = 'lp-btn lp-btn-stop'; stopBtn.textContent = '■ Stop';
  stopBtn.title = `Stop pipeline #${p.issueNumber}`;
  stopBtn.addEventListener('click', e => { e.stopPropagation(); onStop(stopBtn); });

  const joinBtn = doc.createElement('button');
  joinBtn.className = 'lp-btn lp-btn-join'; joinBtn.textContent = '⎇ Join';
  joinBtn.title = `Open worktree for pipeline #${p.issueNumber}`;
  joinBtn.addEventListener('click', e => { e.stopPropagation(); onJoin(joinBtn); });

  hdrActions.appendChild(stopBtn);
  hdrActions.appendChild(joinBtn);

  hdr.appendChild(num);
  hdr.appendChild(branch);
  hdr.appendChild(modeBadge);
  hdr.appendChild(hdrActions);
  card.appendChild(hdr);

  return card;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Depth-first search for an element with className containing `cls`. */
function findByClass(el, cls) {
  if (typeof el.className === 'string' && el.className.split(' ').includes(cls)) return el;
  for (const child of el.children) {
    const found = findByClass(child, cls);
    if (found) return found;
  }
  return null;
}

/** Sample pipeline data. */
const P = { issueNumber: 42, branch: '42-add-login', mode: 'isolated', runningAgent: false };
const P_RUNNING = { ...P, runningAgent: true };

// ═══════════════════════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPipelineCard — FR-006: no collapsible body', () => {
  it('card has exactly 1 child (the header row; no collapsible body div)', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    expect(card.children).toHaveLength(1);
  });
});

describe('buildPipelineCard — FR-001: Stop button in header', () => {
  it('■ Stop button is present inside the header (first and only child)', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const hdr  = card.children[0];
    expect(findByClass(hdr, 'lp-btn-stop')).not.toBeNull();
  });

  it('■ Stop button has correct text', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const btn  = findByClass(card.children[0], 'lp-btn-stop');
    expect(btn.textContent).toBe('■ Stop');
  });

  it('■ Stop button has lp-btn class in addition to lp-btn-stop', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const btn  = findByClass(card.children[0], 'lp-btn-stop');
    expect(btn.className).toContain('lp-btn');
  });
});

describe('buildPipelineCard — FR-002: Join button in header', () => {
  it('⎇ Join button is present inside the header', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const hdr  = card.children[0];
    expect(findByClass(hdr, 'lp-btn-join')).not.toBeNull();
  });

  it('⎇ Join button has correct text', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const btn  = findByClass(card.children[0], 'lp-btn-join');
    expect(btn.textContent).toBe('⎇ Join');
  });
});

describe('buildPipelineCard — FR-004: Stop button click', () => {
  it('clicking ■ Stop calls onStop with the button element', () => {
    const doc    = new FakeDocument();
    const onStop = vi.fn();
    const card   = buildPipelineCard(P, { onStop, onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const btn    = findByClass(card.children[0], 'lp-btn-stop');
    btn._fire('click');
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith(btn);
  });

  it('clicking ■ Stop calls e.stopPropagation()', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const btn  = findByClass(card.children[0], 'lp-btn-stop');
    const e    = btn._fire('click');
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('clicking ■ Stop does NOT call onJoin or onDetail', () => {
    const doc      = new FakeDocument();
    const onJoin   = vi.fn();
    const onDetail = vi.fn();
    const card     = buildPipelineCard(P, { onStop: vi.fn(), onJoin, onDetail, doc });
    findByClass(card.children[0], 'lp-btn-stop')._fire('click');
    expect(onJoin).not.toHaveBeenCalled();
    expect(onDetail).not.toHaveBeenCalled();
  });
});

describe('buildPipelineCard — FR-005: Join button click', () => {
  it('clicking ⎇ Join calls onJoin with the button element', () => {
    const doc    = new FakeDocument();
    const onJoin = vi.fn();
    const card   = buildPipelineCard(P, { onStop: vi.fn(), onJoin, onDetail: vi.fn(), doc });
    const btn    = findByClass(card.children[0], 'lp-btn-join');
    btn._fire('click');
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledWith(btn);
  });

  it('clicking ⎇ Join calls e.stopPropagation()', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const btn  = findByClass(card.children[0], 'lp-btn-join');
    const e    = btn._fire('click');
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
  });
});

describe('buildPipelineCard — FR-007: header row click opens detail panel', () => {
  it('clicking the header row calls onDetail with the card element', () => {
    const doc      = new FakeDocument();
    const onDetail = vi.fn();
    const card     = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail, doc });
    const hdr      = card.children[0];
    hdr._fire('click');
    expect(onDetail).toHaveBeenCalledTimes(1);
    expect(onDetail).toHaveBeenCalledWith(card);
  });
});

describe('buildPipelineCard — FR-003: buttons survive poll cycles', () => {
  it('a second call produces a card with the same structure (simulates re-render)', () => {
    const doc = new FakeDocument();
    const opts = { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc };

    const card1 = buildPipelineCard(P, opts);
    const card2 = buildPipelineCard(P, opts);

    // Both cards have exactly 1 child
    expect(card1.children).toHaveLength(1);
    expect(card2.children).toHaveLength(1);

    // Both cards have stop and join buttons in the header
    expect(findByClass(card1.children[0], 'lp-btn-stop')).not.toBeNull();
    expect(findByClass(card2.children[0], 'lp-btn-stop')).not.toBeNull();
    expect(findByClass(card1.children[0], 'lp-btn-join')).not.toBeNull();
    expect(findByClass(card2.children[0], 'lp-btn-join')).not.toBeNull();
  });
});

describe('buildPipelineCard — running-agent pulse dot', () => {
  it('shows pulse dot when runningAgent is true', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P_RUNNING, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const hdr  = card.children[0];
    const dot  = hdr.children.find(c => c.title === 'Agent running');
    expect(dot).toBeDefined();
  });

  it('does NOT show pulse dot when runningAgent is false', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const hdr  = card.children[0];
    const dot  = hdr.children.find(c => c.title === 'Agent running');
    expect(dot).toBeUndefined();
  });
});

describe('buildPipelineCard — card metadata', () => {
  it('card has className lp-row', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    expect(card.className).toBe('lp-row');
  });

  it('card dataset.issue matches pipeline issueNumber', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    expect(card.dataset.issue).toBe(42);
  });

  it('lp-num span shows correct issue number', () => {
    const doc  = new FakeDocument();
    const card = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const num  = findByClass(card.children[0], 'lp-num');
    expect(num.textContent).toBe('#42');
  });

  it('lp-branch span shows correct branch name', () => {
    const doc    = new FakeDocument();
    const card   = buildPipelineCard(P, { onStop: vi.fn(), onJoin: vi.fn(), onDetail: vi.fn(), doc });
    const branch = findByClass(card.children[0], 'lp-branch');
    expect(branch.textContent).toBe('42-add-login');
  });
});
