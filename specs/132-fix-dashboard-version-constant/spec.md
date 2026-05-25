# Spec: Fix Dashboard QUORUMKIT_VERSION Constant — Issue #132

## Overview

`engine/dashboard/index.html` hard-codes `QUORUMKIT_VERSION = "2.1.0"` while `engine/package.json` reports `3.1.0`. The dashboard displays the wrong version in the header and boot console. This spec corrects the constant and extends `generate-dashboard.js` to auto-inject the version from `engine/package.json` so future version bumps cannot cause drift.

## User Stories

### US-1: Dashboard displays the correct version

As a project user viewing the QuorumKit dashboard,
I want the version number shown in the header and boot console to match the installed version of the engine,
so that I can verify I am running the correct release.

Acceptance Scenarios:
- Given `engine/package.json` has `"version": "3.1.0"`, When I open the dashboard, Then the header displays `v3.1.0` and the boot console logs `QuorumKit Dark Factory  v3.1.0`.
- Given a future release bumps `engine/package.json` to `"version": "4.0.0"` and `generate-dashboard.js` is run, When I open the regenerated dashboard, Then the version shown is `v4.0.0` without requiring a manual edit to `index.html`.

### US-2: Version injection is part of the dashboard generation pipeline

As a maintainer,
I want `engine/dashboard/generate-dashboard.js` to read the version from `engine/package.json` and patch the `QUORUMKIT_VERSION` constant in `index.html`,
so that the version stays in sync automatically whenever the dashboard is regenerated.

Acceptance Scenarios:
- Given `generate-dashboard.js` runs (locally or via `update-dashboard.yml`), When it processes `index.html`, Then it replaces the `QUORUMKIT_VERSION` constant value with the value read from `engine/package.json`.
- Given `index.html` already has the correct version, When `generate-dashboard.js` runs, Then no file change is produced (idempotent).

## Functional Requirements

- FR-001: `engine/dashboard/generate-dashboard.js` must read the `version` field from `engine/package.json`.
- FR-002: The generator must patch `engine/dashboard/index.html` by replacing the `QUORUMKIT_VERSION = "X.Y.Z"` constant with the version read from `engine/package.json` using a targeted string replacement (not a full file rewrite).
- FR-003: The replacement must be idempotent: if the version in `index.html` already matches `package.json`, no write occurs.
- FR-004: The implementation must use a minimal string replacement — equivalent to `replace_in_file` semantics — to avoid destroying unrelated dashboard content.
- FR-005: The `QUORUMKIT_VERSION` constant in `engine/dashboard/index.html` must read `"3.1.0"` (or the version current in `engine/package.json` at time of implementation) after the fix is applied.
- FR-006: The dashboard must render correctly after the version update: header shows `v{version}`, boot console logs `v{version}`.
- FR-007: This fix must not modify any other content in `engine/dashboard/index.html` beyond the version string.

## Success Criteria

- [ ] `grep 'QUORUMKIT_VERSION' engine/dashboard/index.html` shows the value from `engine/package.json`.
- [ ] Opening the dashboard in a browser shows the correct version in the top-right header and in the boot console output.
- [ ] Running `node engine/dashboard/generate-dashboard.js` after bumping `engine/package.json` version automatically updates the constant in `index.html`.
- [ ] `git diff` after the fix shows only the version string changed — no other lines modified.
- [ ] All existing dashboard tests pass.

## Key Entities

- **QUORUMKIT_VERSION**: JavaScript constant in `engine/dashboard/index.html` (line 920) that is rendered in the dashboard header and boot console.
- **engine/package.json**: The canonical source of truth for the QuorumKit engine version.
- **generate-dashboard.js**: The dashboard generator at `engine/dashboard/generate-dashboard.js`; extended to inject the version constant.

## Out of Scope

- Changes to the dashboard UI, CSS, or any content other than the version constant.
- Changes to the release workflow or version bump process.
- Adding a build step that compiles `index.html` from a template (that is a future enhancement).
- Modifying `engine/orchestrator/` or any non-dashboard files.

## Security and Privacy Considerations

N/A — this is a single-constant string update in a static dashboard file. No authentication, no PII, no sensitive data involved. Single-user / no-auth system per the constitution.

## Assumptions

- The fix is implemented using `replace_in_file` (Issue #136) or an equivalent minimal-diff approach. If Issue #136 is not yet merged, the implementer must apply the fix manually with a direct regex replacement — never a full file rewrite.
- `engine/package.json` is the single source of truth for the version. If `engine/package.json` version changes, `generate-dashboard.js` propagates it automatically after this spec is implemented.
- The `QUORUMKIT_VERSION` constant appears exactly once in `engine/dashboard/index.html`.

## Open Questions

_None — fully scoped. Note: implementation depends on Issue #136 (replace_in_file tool) being available or bypassed with a direct sed/regex replacement. Ready for handoff._
