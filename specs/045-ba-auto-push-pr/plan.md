# Plan: BA Agent — Auto Branch, Commit & PR on Spec Write — Issue #45

**Spec:** `specs/045-ba-auto-push-pr/spec.md`
**Branch:** `045-ba-auto-push-pr`
**Issue:** #45

---

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `045-ba-auto-push-pr` |
| Tests before implementation | TDD workflow enforced per task; regulation test updated before doc change |
| No hardcoded secrets | `GITHUB_TOKEN` consumed from environment; never logged |
| Input validation at boundaries | Branch name validated against `NNN-slug` pattern before any push; dirty-tree check before any commit |
| Data access scoping | N/A — no auth/multi-user requirements |
| Coverage threshold | Existing vitest suite covers regulation parsing; new test assertions added for `spec-ready` outcome |

---

## Scope

This feature consists entirely of **documentation, configuration, and workflow
changes** — no new JavaScript modules are introduced. The implementation touches:

1. `docs/AGENT_PROTOCOL.md` — register `spec-ready` outcome + `type:spec` label (FR-016)
2. `.github/agents/ba-product-agent.md` — add push/PR/apm-msg step to Responsibilities + Handoff Checklist (FR-017)
3. `src/agents/ba-product-agent.md` — same changes (mirrors `.github/agents/`) (FR-017)
4. `.github/workflows/copilot-agent-ba.yml` — elevate permissions to `contents: write` + `pull-requests: write`; add PR-creation step (FR-015, FR-018)
5. `engine/tests/regulation.test.js` — add test asserting `spec-ready` is a declared outcome (regression guard)

The orchestrator source code (`engine/orchestrator/`) is **not** modified —
`spec-ready` is registered in the regulation document (the source of truth) and
the existing `regulation.js` parser will pick it up automatically.

---

## Approach

### Task 1 — Extend regulation test (TDD: write failing test first)

Add a test case to `engine/tests/regulation.test.js` that loads the real
`docs/AGENT_PROTOCOL.md` and asserts `outcomes.has('spec-ready')`. This test
fails until Task 2 is complete (red).

Also assert `labels.has('type:spec')` — this label must be declared in the
regulation document so it can legally appear on a PR (FR-010).

### Task 2 — Add `spec-ready` outcome + `type:spec` label to AGENT_PROTOCOL.md

- Under §2 `apm-msg` Outcomes table: add row for `spec-ready`
- Under §1.5 `type:*` — add `type:spec` with semantics "A spec-only PR created by the BA agent"
- Under §2 Per-outcome `payload` schemas: add schema for `spec-ready`

The regulation test (Task 1) turns green.

### Task 3 — Update BA agent role definitions (both files)

Add to **Responsibilities** (both `.github/agents/ba-product-agent.md` and
`src/agents/ba-product-agent.md`):

> - After writing or updating a spec, create (or check out) branch `NNN-slug`,
>   commit `spec.md` + `.specify/feature.json` (if modified), push to `origin`,
>   open (or update) a PR with labels `type:spec` and `agent:architect` or
>   `agent:dev`, post the PR URL as a comment on the originating issue, and emit
>   an `apm-msg` block with `outcome: "spec-ready"`.

Update the **Handoff Checklist** to include the new push/PR/apm-msg steps.

Add a new **Branch, Commit & PR** section documenting the exact rules (branch
naming, commit message format, PR title/body format, label heuristic, apm-msg
payload shape, idempotency, dirty-tree abort, permission error handling) — all
sourced directly from the spec FRs.

### Task 4 — Elevate workflow permissions and add PR logic (copilot-agent-ba.yml)

- Change `contents: read` → `contents: write`
- Change `pull-requests: read` → `pull-requests: write`
- After the GitHub Models API call produces the spec content (and the agent has
  written `spec.md` to the workspace), add a `git` + `gh api` sequence:
  1. Dirty-tree guard: `git status --porcelain` filtered to files outside
     `specs/` and `.specify/`; abort with error comment if any.
  2. `git config user.email` and `user.name` for the actions bot.
  3. `git checkout -B NNN-slug` (creates or resets to current HEAD).
  4. `git add specs/NNN-slug/spec.md .specify/feature.json` (ignore if
     feature.json absent).
  5. `git commit -m "docs(spec): add spec for #NNN — <title>"`.
  6. `git push --force-with-lease origin NNN-slug`.
  7. Check for existing PR via `github.rest.pulls.list`.
  8. Create or update PR with title, body (Refs #NNN, spec path, handoff
     summary), and labels (`type:spec`, `agent:dev` as default).
  9. Post PR URL as comment on originating issue.
  10. Emit `apm-msg` block with `outcome: "spec-ready"`.

---

## Files Changed

| File | Change type | FR |
|------|-----------|----|
| `engine/tests/regulation.test.js` | Test addition | FR-016 (regression guard) |
| `docs/AGENT_PROTOCOL.md` | `spec-ready` outcome + `type:spec` label | FR-016 |
| `.github/agents/ba-product-agent.md` | Responsibilities + Handoff Checklist + new section | FR-017 |
| `src/agents/ba-product-agent.md` | Same as above (mirror) | FR-017 |
| `.github/workflows/copilot-agent-ba.yml` | Permissions + push/PR/apm-msg steps | FR-015, FR-018 |

---

## Out of Scope (not implemented here)

- Orchestrator source code changes — regulation.js already reads from AGENT_PROTOCOL.md
- New agent modules or libraries
- Claude Code runtime changes (Claude reads the updated agent definition file; no code change needed)
- Implementation PR automation for other agents
