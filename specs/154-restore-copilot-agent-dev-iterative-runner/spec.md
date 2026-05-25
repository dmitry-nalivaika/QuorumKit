# Spec: Restore copilot-agent-dev.yml Iterative Runner — Issue #154

## Overview

PR #150 (commit `3da192a`) accidentally replaced the full iterative agentic runner in `.github/workflows/copilot-agent-dev.yml` with a one-shot inline GitHub Models script. The Developer Agent (Copilot runtime) is now functionally broken: it can read issues and post comments, but cannot write code, run tests, or open PRs. This spec restores the workflow to invoke the iterative `dev-agent-runner.cjs` with full Orchestrator traceability inputs.

## User Stories

### US-1: Restore iterative tool-calling loop

As the Orchestrator,
I want `copilot-agent-dev.yml` to invoke `dev-agent-runner.cjs` with all required env vars,
so that the Developer Agent (Copilot runtime) can execute the full iterative tool-calling loop: read files, write code, run tests, and open PRs.

Acceptance Scenarios:
- Given a valid issue number is dispatched to `copilot-agent-dev.yml`, When the workflow runs, Then `node .github/scripts/dev-agent-runner.cjs` is executed with `RUNTIME_KIND=copilot`, `ISSUE_NUMBER`, `RUN_ID`, `STEP`, and `ITERATION` env vars set from workflow inputs.
- Given the runner completes successfully, When the workflow finishes, Then a `signal_outcome` comment appears on the issue with `outcome: success` and a PR URL.
- Given the runner encounters an unresolvable blocker, When the workflow finishes, Then a `signal_outcome` comment appears on the issue with `outcome: needs-human`.

### US-2: Preserve Orchestrator traceability inputs

As the Orchestrator,
I want `copilot-agent-dev.yml` to accept `run_id`, `step`, and `iteration` workflow inputs,
so that the Orchestrator can track which pipeline step and iteration produced each agent run.

Acceptance Scenarios:
- Given the Orchestrator dispatches the workflow with `run_id=abc123`, `step=dev`, `iteration=2`, When the workflow runs, Then these values are passed as env vars to the runner.
- Given the workflow is triggered manually without supplying `run_id`, `step`, or `iteration`, When the workflow runs, Then these default to empty string / `dev` / `1` respectively (no hard failure).

### US-3: Mirror update in src/

As a downstream project consumer installing QuorumKit,
I want `src/.github/workflows/copilot-agent-dev.yml` to match the restored version,
so that `init.sh` distributes the correct iterative workflow to downstream projects.

Acceptance Scenarios:
- Given a downstream project runs `init.sh`, When the script copies workflow files, Then `copilot-agent-dev.yml` in the downstream project invokes the iterative runner, not the inline script.

## Functional Requirements

- FR-001: `.github/workflows/copilot-agent-dev.yml` must include a `workflow_dispatch` trigger with inputs: `issue_number` (required), `run_id` (optional, default `''`), `step` (optional, default `dev`), `iteration` (optional, default `1`).
- FR-002: The workflow must include an `actions/checkout` step with `fetch-depth: 0`.
- FR-003: The workflow must include an `actions/setup-node` step with `node-version: '20'`.
- FR-004: The workflow must invoke `node .github/scripts/dev-agent-runner.cjs` (not an inline `actions/github-script` step).
- FR-005: The `run` step must pass env vars: `RUNTIME_KIND=copilot`, `RUNTIME_NAME=copilot-default`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `ISSUE_NUMBER`, `RUN_ID`, `STEP`, `ITERATION`.
- FR-006: The `# apm-allow-divergence` header comment must be restored to document the known design split between the Copilot runner (which uses the shared `.cjs` runner) and the template version (which retains the v1 inline script for distribution).
- FR-007: `src/.github/workflows/copilot-agent-dev.yml` must be updated to match `.github/workflows/copilot-agent-dev.yml` exactly.
- FR-008: The restored workflow must not regress any currently passing CI checks.

## Success Criteria

- [ ] `.github/workflows/copilot-agent-dev.yml` invokes `node .github/scripts/dev-agent-runner.cjs`.
- [ ] All five Orchestrator env vars (`RUNTIME_KIND`, `RUNTIME_NAME`, `ISSUE_NUMBER`, `RUN_ID`, `STEP`, `ITERATION`) are passed.
- [ ] Workflow inputs include `run_id`, `step`, `iteration` with correct defaults.
- [ ] `actions/setup-node` (node 20) step is present.
- [ ] `fetch-depth: 0` is set on checkout.
- [ ] `src/.github/workflows/copilot-agent-dev.yml` is identical to the restored version.
- [ ] A manual end-to-end test dispatch on a test issue confirms the agent writes code and opens a PR.

## Key Entities

- **copilot-agent-dev.yml**: The GitHub Actions workflow that dispatches the Developer Agent in the Copilot runtime.
- **dev-agent-runner.cjs**: The iterative tool-calling loop script at `.github/scripts/dev-agent-runner.cjs`; this is the correct execution entrypoint.
- **Orchestrator traceability inputs**: The `run_id`, `step`, and `iteration` workflow inputs used by the Orchestrator to track pipeline state across multiple agent runs.
- **apm-allow-divergence comment**: A deliberate annotation marking that the `copilot-agent-dev.yml` in the repo intentionally differs from the distributed template (which retains the v1 inline script for downstream compatibility).

## Out of Scope

- Changes to `dev-agent-runner.cjs` itself (covered by Issue #136).
- Changes to any other workflow files.
- Adding new workflow inputs beyond the ones that existed pre-regression.
- Updating the distributed template version of the workflow (the `templates/` or `src/` version is updated only to match the restored `.github/` version).

## Security and Privacy Considerations

The restored workflow uses `GITHUB_TOKEN` with `contents: write`, `issues: write`, `pull-requests: write` — the same least-privilege scopes as before the regression. No new token scopes are introduced. The `apm-allow-divergence` comment must not be removed; it is auditable documentation of the intentional design split.

No PII involved. Standard open-source data classification applies per the constitution.

## Assumptions

- The pre-regression state (commit `af3df19`) represents the last known-good version of this workflow.
- The inline script introduced in PR #150 was unintentional collateral damage from the repo simplification PR, not a deliberate design change.
- `src/.github/workflows/copilot-agent-dev.yml` must always mirror `.github/workflows/copilot-agent-dev.yml` for downstream distribution.

## Open Questions

_None — the regression is confirmed by diff analysis and the fix is a targeted restore. Ready for handoff._
