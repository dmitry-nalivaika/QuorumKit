# Tasks — Issue #273
## Stop/Join Buttons Restored to Pipeline Row Header

Branch: `273-stop-button-for-pipeline-disappeared-fro`

---

## Task List

### T-1 · Write failing tests (RED)
**File:** `engine/tests/dashboard-273.test.js` (NEW)

Create the unit test file that mirrors the (not-yet-extracted) `buildPipelineCard`
function verbatim using a self-contained FakeDocument mock.

Tests to write:
- [ ] Card has exactly 1 child — no collapsible body div (FR-006)
- [ ] Stop button (`lp-btn-stop`) found in header (FR-001)
- [ ] Join button (`lp-btn-join`) found in header (FR-002)
- [ ] Stop button click fires onStop spy with button reference (FR-004)
- [ ] Join button click fires onJoin spy with button reference (FR-005)
- [ ] Header click fires onDetail spy with card reference (FR-007)
- [ ] Calling buildPipelineCard twice produces identical structure (FR-003 — poll cycle)
- [ ] Running-agent pulse dot present when `runningAgent: true`
- [ ] No pulse dot when `runningAgent: false`

**Definition of done:** `npm test` in `engine/orchestrator` shows these tests as FAIL
(function not found / not exported yet).

---

### T-2 · Extract `buildPipelineCard` helper (GREEN)
**File:** `engine/dashboard/index.html`

Add `buildPipelineCard(p, { onStop, onJoin, onDetail, doc = document })` immediately
before `loadLocalPipelines`. The function body is extracted from the existing inline
card-building block inside `loadLocalPipelines`.

- [ ] Function creates card with `lp-row` class and `data-issue` attribute
- [ ] Card has **exactly one** child (the header `hdr` div) — no collapsible body
- [ ] Header contains: `lp-num`, `lp-branch`, mode badge, and `lp-actions` div
- [ ] `lp-actions` contains `lp-btn-stop` and `lp-btn-join` buttons
- [ ] Stop button click: `e.stopPropagation()` then `onStop(stopBtn)`
- [ ] Join button click: `e.stopPropagation()` then `onJoin(joinBtn)`
- [ ] Header click: `onDetail(card)`
- [ ] `doc` defaults to global `document` so existing runtime is unchanged
- [ ] Running-agent pulse dot added when `p.runningAgent` is truthy

---

### T-3 · Refactor `loadLocalPipelines` to use `buildPipelineCard`
**File:** `engine/dashboard/index.html`

Replace the inline card-building block inside `loadLocalPipelines` with a call to
`buildPipelineCard`.

- [ ] Remove dead `openIssues` Set computation (was tracking collapsible state)
- [ ] Remove orphaned `chevron` element creation (was never appended)
- [ ] Card-building delegated to `buildPipelineCard`
- [ ] `listEl.appendChild(card)` preserved
- [ ] `restoredSelected` restore logic preserved (calls `openPipelineDetail`)
- [ ] Function still handles fetch errors gracefully (unchanged error branch)

---

### T-4 · Remove `togglePipelineExpand` dead function
**File:** `engine/dashboard/index.html`

Delete the `togglePipelineExpand` function in its entirety. It references the
now-absent collapsible body `div` and is never called after the #259 rework.

- [ ] Function definition removed
- [ ] No call sites exist (verified by grep)

---

### T-5 · Run tests and confirm GREEN
**Command:** `cd engine/orchestrator && npm test -- --reporter=verbose 2>&1 | grep -A3 "273"`

- [ ] All T-1 tests pass
- [ ] No regressions in existing test suite

---

### T-6 · Commit
**Message:** `feat(dashboard): extract buildPipelineCard; remove collapsible-expand dead code (#273)`

- [ ] `engine/dashboard/index.html` in commit
- [ ] `engine/tests/dashboard-273.test.js` in commit
- [ ] `specs/273-stop-button-for-pipeline-disappeared-fro/plan.md` in commit
- [ ] `specs/273-stop-button-for-pipeline-disappeared-fro/tasks.md` in commit

---

## Dependency Order

```
T-1 → T-2 → T-3 → T-4 → T-5 → T-6
```
(T-1 must fail before T-2; T-3/T-4 can be done alongside T-2 in the same edit.)
