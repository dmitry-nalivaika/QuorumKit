# Tasks: Periodic Full-Set Documentation Audit

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)
**Rule**: tests first (red), then the minimum code (green), commit per task group.

## Phase 1: Engine core (US-1, US-3)

- [x] T001 [US1] Test + implement `collectDocSet(root)`: root `*.md`, `docs/**`, `specs/**`, ADRs, CHANGELOG; skips `node_modules`, `.git`
- [x] T002 [US1] Test + implement `checkLinks`: relative file + GitHub-slug anchors; fenced code ignored; ignore patterns honoured; finding has file + section/line
- [x] T003 [US1] Test + implement external link check with injected fetch: 3 attempts, only definitive failures reported, 429/5xx/timeout never reported (FR-019)
- [x] T004 [US1] Test + implement `collectFacts`: versions (`quorumkit.yml`, `engine/package.json`, CHANGELOG top release), agent and workflow counts vs README claims, spec dirs with no `adr-NNN-*` (candidates), match by NNN not slug
- [x] T005 [US1] Test + implement deterministic version/count findings (cross-reference category)

## Phase 2: Findings, dedup, publish (US-2, US-3, US-4)

- [x] T006 [US2] Test + implement `validateFindings`: schema, category/severity vocab, file must exist, section or line required, missing-doc needs `feature` + `expectedPath`, length caps, secret redaction, marker stripping
- [x] T007 [US4] Test + implement `fingerprint` (stable under description rewording and ordering)
- [x] T008 [US2] Test + implement `renderReport`: grouped by category, severity labels, fp markers, chunking at 60k with `part i of n`, nothing dropped
- [x] T009 [US2] Test + implement `findTrackingIssue` (label + marker, ignores PRs and non-marker issues, oldest wins, creates label if missing)
- [x] T010 [US3] Test + implement `publish` decision table: clean -> no create/comment/edit/close; all known -> nothing; new -> create or comment; closed issue -> new issue; resolved list in next comment
- [x] T011 [US2] Test + implement footprint on report only (start + complete via `agent-report.cjs`), none on clean/known; no result marker
- [x] T012 [US1] Test + implement failure path: any error -> non-zero exit, summary says FAILED, never prints the clean message (FR-016)
- [x] T013 [US3] Test: clean run writes the "executed, covered N files, 0 findings" record (FR-014)
- [x] T014 Test + implement CLI (`collect`, `publish`) and the judge-output reader (accepts a JSON array in prose or fence, rejects anything else)

## Phase 3: Workflows (US-1, FR-001/002/017/018/020)

- [x] T015 Test (structural) then write `src/.github/workflows/copilot-agent-docs-audit.yml`: weekly cron + dispatch, `contents: read` / `issues: write`, concurrency group, runtime resolution identical to siblings, judge prompt built from `docs-agent.md`, output in `$RUNNER_TEMP`, publish step, `if: always()` summary
- [x] T016 Test (structural) then write `src/.github/workflows/agent-docs-audit.yml` (Claude): same collect and publish steps, judge via claude-code-action, `--allowedTools Read,Glob,Grep,Write`
- [x] T017 Mirror to `.github/` (copilot variant + script); Claude variant stays gitignored; byte-parity test; M5/M8/M9 pass
- [x] T018 Test: existing `copilot-agent-docs.yml` / `agent-docs.yml` unchanged (FR-018); no new workflow edits the work tree

## Phase 4: Agent definition and docs (FR-005, FR-006, FR-022)

- [x] T019 Edit `src/agents/docs-agent.md`: "Scheduled Audit Mode" (activation, checklist-to-category map, "merged change" read as current repo state, judge output contract); mirror to `.github/agents/` (M6)
- [x] T020 Test: audit prompt references `docs-agent.md` and does not restate the checklist (single source of truth)
- [x] T021 Docs: README (workflow counts, Docs row, automatic triggers table), CHANGELOG `[Unreleased]`, `docs/PIPELINES.md` or new short section on schedule, what is checked, how to act, known limits; `src/scripts/quality-check.sh` required workflows; `quorumkit.yml` count
- [x] T022 Run markdown link check on changed `.md`, `verify-mirror.sh`, `quality-check.sh`, `verify-agent-inventory.sh`, full vitest; compare to the pre-existing failures (dashboard tests, need `ws`)

## Phase 5: Handoff

- [ ] T023 Dual-AI smoke test notes, Security Agent review request, PR description from template, `agent-complete` footprint
  - Done: Security Agent review (approved), PR #394, footprints. Open: the Dual-AI smoke test can only run after merge (both workflows are `workflow_dispatch`); compare the Claude and Copilot findings, see "Known limits" in `docs/PIPELINES.md`.

## Phase 6: Review rework (PR #394, REQUEST_CHANGES)

- [x] T024 [US1] BLOCKER (FR-016): tests first, then `collectFacts` records a failed issue-state lookup in `facts.unchecked` (not `skipped`); `collect` throws naming the specs before writing any file; no token / repository counts as a failed lookup. Replaced the test that pinned the silent skip
- [x] T025 Process: `.specify/feature.json` restored to the merge-base version, so the PR no longer touches it and no longer conflicts with `main`
- [x] T026 [US2] Suggestion: `cleanText` neutralises images, markdown and reference links, autolinks, bare URLs and raw HTML (code spans kept); the external-link finding puts the URL in a code span
- [x] T027 Suggestion: Claude judge `Write` scoped to `judge.json`; the unchanged check compares `git status --porcelain --ignored` before and after the judge
- [x] T028 Suggestion (#335): Copilot judge calls `report.recordUsage`; `USAGE` goes to the publish step and into the complete footprint; wiring test added (the audit is not in `SLUGS` because it has no "Report result" step)
- [x] T029 Suggestion: "Known limits" in `docs/PIPELINES.md` document the runtime evidence difference, one model finding per category/file/section, and the plain-text rule; failure table and CHANGELOG updated
- [ ] T030 Not done, left for a follow-up: reconcile the pre-existing workflow count mismatch (README 28, `quorumkit.yml` 27, 36 files in `src/.github/workflows/`)

## Dependencies

T001-T005 -> T006-T008 -> T009-T014 -> T015-T018 -> T019-T022 -> T023 -> T024-T029.
