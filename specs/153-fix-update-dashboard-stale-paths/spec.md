# Spec: Fix update-dashboard.yml Stale Paths After Rebranding — Issue #153

## Overview

The `update-dashboard.yml` workflow and `engine/dashboard/generate-dashboard.js` both reference `.apm/agents/` — a path that was removed when the project was rebranded to QuorumKit (Issue #067). Agent files now live at `.github/agents/`. The workflow silently never triggers on real changes and fails when dispatched manually. This spec updates both files to point to the correct post-rebranding paths.

## User Stories

### US-1: Dashboard auto-updates when agent definitions change

As a project maintainer,
I want `update-dashboard.yml` to trigger automatically when any file in `.github/agents/` changes and is merged to `main`,
so that the dashboard always reflects the current set of agents without manual intervention.

Acceptance Scenarios:
- Given a change to `.github/agents/developer-agent.md` is merged to `main`, When the push event fires, Then `update-dashboard.yml` triggers and runs the dashboard generator.
- Given `generate-dashboard.js` runs successfully, When agent data has changed, Then `engine/dashboard/index.html` is updated and committed with message `chore(dashboard): auto-sync agent data from .github/agents [skip ci]`.
- Given no agent files have changed, When the workflow runs, Then no commit is made and the workflow reports "Dashboard is already up to date."

### US-2: Manual dispatch succeeds

As a developer,
I want to be able to trigger `update-dashboard.yml` manually via `workflow_dispatch`,
so that I can force a dashboard refresh without needing to push a change.

Acceptance Scenarios:
- Given I dispatch the workflow manually from the GitHub Actions UI, When the workflow runs, Then `generate-dashboard.js` completes without error.
- Given the dashboard content is stale, When I dispatch manually and the generator detects changes, Then `engine/dashboard/index.html` is updated and committed.

## Functional Requirements

- FR-001: The `on.push.paths` trigger in `update-dashboard.yml` must be updated to watch `.github/agents/**` instead of `.apm/agents/**`.
- FR-002: The `on.push.paths` trigger must watch `quorumkit.yml` instead of `apm.yml`.
- FR-003: The `on.push.paths` trigger must continue to watch `engine/dashboard/generate-dashboard.js`.
- FR-004: In `generate-dashboard.js`, the `AGENTS_DIR` constant must be updated to `path.join(ROOT, '.github', 'agents')`.
- FR-005: In `generate-dashboard.js`, the `APM_YML` constant must be verified to point to `quorumkit.yml` at the repo root; update if incorrect.
- FR-006: The commit message in the workflow step must be updated from `"chore(dashboard): auto-sync agent data from .apm/agents [skip ci]"` to `"chore(dashboard): auto-sync agent data from .github/agents [skip ci]"`.
- FR-007: No other logic in `generate-dashboard.js` or `update-dashboard.yml` may be changed beyond the path updates.
- FR-008: The updated `generate-dashboard.js` must successfully read all agent markdown files from `.github/agents/` and produce a valid `engine/dashboard/index.html`.

## Success Criteria

- [ ] `update-dashboard.yml` `on.push.paths` lists `.github/agents/**` and `quorumkit.yml`.
- [ ] `generate-dashboard.js` `AGENTS_DIR` equals `path.join(ROOT, '.github', 'agents')`.
- [ ] `generate-dashboard.js` `APM_YML` points to the correct `quorumkit.yml` path.
- [ ] Manual `workflow_dispatch` of `update-dashboard.yml` completes with exit 0.
- [ ] Merging a change to any `.github/agents/*.md` file triggers the workflow automatically.
- [ ] The generated `engine/dashboard/index.html` is valid HTML and displays all current agents.
- [ ] All existing dashboard tests pass.

## Key Entities

- **update-dashboard.yml**: GitHub Actions workflow that auto-commits an updated dashboard on agent changes.
- **generate-dashboard.js**: Node.js script at `engine/dashboard/generate-dashboard.js` that reads agent markdown files and patches `engine/dashboard/index.html`.
- **AGENTS_DIR**: Path constant in `generate-dashboard.js` pointing to the directory containing agent markdown files.
- **APM_YML / quorumkit.yml**: The project configuration YAML file; was `apm.yml` pre-rebranding, now `quorumkit.yml`.

## Out of Scope

- Changes to `engine/dashboard/index.html` content.
- Changes to dashboard HTML/CSS/JS.
- Adding new agents or agent fields.
- Changing the dashboard generator logic beyond path corrections.

## Security and Privacy Considerations

The workflow commits to `main` using `GITHUB_TOKEN` with `contents: write`. This is an existing scope; no new permissions are required. The `[skip ci]` tag on the auto-commit must be preserved to prevent recursive workflow triggers.

No PII involved. Standard open-source data classification applies per the constitution.

## Assumptions

- All agent definition files are at `.github/agents/*.md` post-rebranding.
- `quorumkit.yml` is at the repository root (same location as the former `apm.yml`).
- No other scripts or workflows reference `.apm/agents/` (if found, they are out of scope for this issue).

## Open Questions

_None — root cause is confirmed by inspection. Ready for handoff._
