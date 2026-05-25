# Tasks: BA Agent — Auto Branch, Commit & PR on Spec Write — Issue #45

**Plan:** `specs/045-ba-auto-push-pr/plan.md`
**Branch:** `045-ba-auto-push-pr`

---

## Task List

### TASK-1 — Add regulation test for `spec-ready` outcome and `type:spec` label

**File:** `engine/tests/regulation.test.js`
**Type:** Test (TDD — write failing test first)
**Depends on:** nothing (test added before implementation)

Add a new `describe` block (or extend the existing "loads real AGENT_PROTOCOL"
test if one exists) that:

- Loads the real `docs/AGENT_PROTOCOL.md` via `loadRegulation(REPO_ROOT)`.
- Asserts `outcomes.has('spec-ready')` is `true`.
- Asserts `labels.has('type:spec')` is `true`.

This test MUST fail before TASK-2 is done (red phase).

**Done when:** test file updated and `npm test` in `engine/` shows the new
assertions failing with "expected false to be true".

---

### TASK-2 — Register `spec-ready` outcome and `type:spec` label in AGENT_PROTOCOL.md

**File:** `docs/AGENT_PROTOCOL.md`
**Type:** Documentation / regulation
**Depends on:** TASK-1 (test must be red first)

Changes:

1. In §1.5 `type:*` table, add row:
   ```
   | `type:spec` | BA Agent | Applied to spec-only PRs opened by the BA Agent. |
   ```

2. In §2 `apm-msg` Outcomes table, add row:
   ```
   | `spec-ready` | BA Agent finished writing/refining a spec and published it to a branch + PR; orchestrator routes to next-agent label. | BA Agent | → activate next-agent label (`agent:architect` or `agent:dev`) |
   ```

3. In §2 "Per-outcome `payload` schemas", add entry:
   ```
   - `spec-ready`: `{ "specPath": string, "branch": string, "prUrl": string }`
   ```

**Done when:** `npm test` in `engine/` shows the TASK-1 assertions now passing
(green phase). Regulation-lint CI job also passes.

---

### TASK-3 — Update BA agent role definitions (both files)

**Files:** `.github/agents/ba-product-agent.md`, `src/agents/ba-product-agent.md`
**Type:** Documentation
**Depends on:** TASK-2

Both files are identical; apply the same changes to both:

1. Add to **Responsibilities** (after the `.specify/feature.json` bullet):
   > - After writing or updating a spec: create (or check out) branch `NNN-slug`;
   >   commit `spec.md` + `.specify/feature.json` (if modified); push to `origin`;
   >   open (or update) a PR titled `docs(spec): #NNN — <feature title>` with
   >   labels `type:spec` and `agent:architect` / `agent:dev`; post PR URL as a
   >   comment on the originating issue; emit `apm-msg` with `outcome: "spec-ready"`.

2. Add a new top-level section **## Branch, Commit & PR** (after ## Permitted Commands) with:
   - Branch naming rule (derive from spec directory name)
   - Commit message formats (new vs. updated spec)
   - Dirty-tree guard rule
   - PR title/body format
   - Label heuristic (keyword scan → `agent:architect` vs. default `agent:dev`)
   - Idempotency rule (update existing PR, no duplicates)
   - Permission error handling
   - `apm-msg` payload shape

3. Add to **Handoff Checklist** (after the `.specify/feature.json` bullet):
   - Branch `NNN-slug` created or checked out
   - Spec committed and pushed to `origin`
   - PR opened (or existing PR updated) with correct title, body, labels
   - PR URL posted as comment on originating issue
   - `apm-msg` block emitted with `outcome: "spec-ready"`

**Done when:** Both files contain the new section and updated checklist; no
`[NEEDS CLARIFICATION]` markers remain; diff is identical between the two files.

---

### TASK-4 — Elevate permissions and add push/PR/apm-msg logic to copilot-agent-ba.yml

**File:** `.github/workflows/copilot-agent-ba.yml`
**Type:** Workflow
**Depends on:** TASK-2, TASK-3

Changes:

1. Permissions block:
   - `contents: read` → `contents: write`
   - `pull-requests: read` → `pull-requests: write`

2. After the GitHub Models API call and comment-creation, add a new step
   `name: Push spec branch and open PR` using `actions/github-script` that:
   a. Computes `branchName` = spec directory name (derived from issue title/number;
      falls back to `NNN-ba-spec` if slug cannot be determined).
   b. Runs `git config`, `git checkout -B`, `git add`, `git commit`, `git push`.
   c. Calls `github.rest.pulls.list` to check for an existing PR.
   d. Calls `github.rest.pulls.create` or `github.rest.pulls.update` accordingly.
   e. Applies labels `type:spec` and `agent:dev` via `github.rest.issues.addLabels`.
   f. Posts PR URL comment on originating issue.
   g. Ends with `apm-msg` block: `outcome: "spec-ready"`, payload with
      `specPath`, `branch`, `prUrl`.

3. Dirty-tree guard: before git add, run `git status --porcelain` and filter
   for files outside the expected paths; if any found, post error comment and
   `core.setFailed`.

4. Permission guard: wrap push and PR-create calls; if 403, post clear error
   comment identifying the missing scope and `core.setFailed`.

**Done when:** Workflow file has `contents: write`, `pull-requests: write`, and
the new step present. YAML is valid (can be checked with `actionlint` or
`yamllint`).

---

## Completion Criteria

- [ ] TASK-1 done: new test assertions in `regulation.test.js` present (initially failing)
- [ ] TASK-2 done: `spec-ready` and `type:spec` in `AGENT_PROTOCOL.md`; TASK-1 tests now pass
- [ ] TASK-3 done: both BA agent definition files updated identically
- [ ] TASK-4 done: workflow has elevated permissions + push/PR/apm-msg step
- [ ] All tests pass: `cd engine && npm test`
- [ ] Markdown link check passes: `git diff --name-only --diff-filter=AM origin/main...HEAD -- '*.md' | xargs -I{} markdown-link-check --quiet --config .markdown-link-check.json {}`
- [ ] No hardcoded credentials in any file
- [ ] PR ready to open against `main`
