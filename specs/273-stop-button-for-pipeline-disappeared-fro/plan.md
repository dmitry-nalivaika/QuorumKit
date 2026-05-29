# Implementation Plan — Issue #273
## Stop/Join Buttons Restored to Pipeline Row Header

### Feature Branch
`273-stop-button-for-pipeline-disappeared-fro`

---

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `273-stop-button-for-pipeline-disappeared-fro` |
| Tests before implementation | TDD workflow: `dashboard-273.test.js` written first (RED), implementation follows (GREEN) |
| No hardcoded secrets | N/A — pure UI fix; no secrets, credentials, or API keys involved |
| Input validation at boundaries | N/A — no new API surface introduced; existing `/api/local-pipelines/stop` endpoint unchanged |
| Data access scoping | N/A — dashboard is a read-only observability surface; constitution §IX; no auth required |
| Coverage threshold | 80% lines required; new `buildPipelineCard` function is fully covered by unit tests |

---

## Problem Summary

After the split-panel navigation rework (#259), the **■ Stop** and **⎇ Join** buttons
on pipeline row cards became unreachable. They were left inside a collapsible body
`div` (`display:none`) that is never expanded in the new layout. The fix was partially
applied in commit `73d72cd` (merged via PR #270): buttons were moved into the
`hdrActions` div inside the always-visible `hdr` row. However:

1. **Dead code remains** that references the now-absent collapsible mechanic:
   - `openIssues` Set computed in `loadLocalPipelines` but never used
   - Orphaned `chevron` element created but never appended
   - `togglePipelineExpand` function defined but never called (still references the absent `body` child)
2. **No tests** verify the corrected structure — the buttons' position is untested.

This plan completes the fix by removing all dead collapsible-expand code, extracting a
testable `buildPipelineCard` helper, and adding a full test suite (FR-001 through FR-007).

---

## Architecture

### Affected Files

| File | Change type | Reason |
|------|------------|--------|
| `engine/dashboard/index.html` | Refactor + cleanup | Extract `buildPipelineCard`; remove dead `openIssues`, `chevron`, `togglePipelineExpand` |
| `engine/tests/dashboard-273.test.js` | New | Unit tests for `buildPipelineCard` covering FR-001 through FR-007 |
| `specs/273-stop-button-for-pipeline-disappeared-fro/tasks.md` | New | Ordered task list |

### No new dependencies. No server changes. No schema changes.

---

## Design: `buildPipelineCard(p, opts)`

A new pure helper is extracted from `loadLocalPipelines`:

```javascript
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
function buildPipelineCard(p, { onStop, onJoin, onDetail, doc = document } = {})
```

**Why extract?**
- Testable in isolation without a running server or browser
- Makes the "no collapsible body" invariant (`card.children.length === 1`) assertable
- Keeps `loadLocalPipelines` focused on fetch / list management

### `loadLocalPipelines` after refactor

```
loadLocalPipelines()
  ├─ fetch /api/local-pipelines
  ├─ for each pipeline p:
  │   ├─ buildPipelineCard(p, { onStop, onJoin, onDetail })
  │   └─ listEl.appendChild(card)
  └─ if restoredSelected matches: openPipelineDetail(card, p)
```

The dead `openIssues` tracking block and orphaned `chevron` element are removed.
`togglePipelineExpand` is removed entirely.

---

## Test Strategy

File: `engine/tests/dashboard-273.test.js`

| Test | FR | What is asserted |
|------|----|-----------------|
| Card has exactly 1 child (no collapsible body) | FR-006 | `card.children.length === 1` |
| Stop button present in header | FR-001 | `findByClass(card.children[0], 'lp-btn-stop')` not null |
| Join button present in header | FR-002 | `findByClass(card.children[0], 'lp-btn-join')` not null |
| Stop button click calls onStop | FR-004 | `vi.fn()` spy called with the button element |
| Join button click calls onJoin | FR-005 | `vi.fn()` spy called with the button element |
| Header click calls onDetail | FR-007 | `vi.fn()` spy called with the card element |
| Rebuilding card preserves buttons (poll cycle) | FR-003 | Run `buildPipelineCard` twice; same assertions hold both times |
| Running-agent dot appears when runningAgent=true | — | `.lp-num` sibling span with pulse animation found |
| Buttons NOT present outside header (not in body div) | FR-006 | Only 1 child element on card |

A minimal **FakeDocument** mock provides `createElement` without requiring jsdom or any
additional npm packages. It is self-contained in the test file.
