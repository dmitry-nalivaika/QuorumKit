# Spec: Remove QuorumKit-Specific ADR/FR/Tool References from Distributed Agent Definitions — Issue #156

## Overview

Agent markdown files distributed via `src/agents/` (and mirrored in `.github/agents/`) contain hard-coded QuorumKit-specific identifiers — ADR numbers, FR numbers, and internal CI tool names — that are meaningless to downstream projects that install QuorumKit as a package. This spec removes or generalises all such references so the distributed agent definitions are self-contained and portable.

## User Stories

### US-1: Agent definitions are portable for downstream projects

As a developer at a downstream project that has installed QuorumKit via `init.sh`,
I want agent definition files to use generic, self-explanatory rule descriptions instead of QuorumKit-internal ADR/FR identifiers,
so that I can follow the agent instructions without needing to understand QuorumKit's internal numbering system.

Acceptance Scenarios:
- Given I read `.github/agents/reviewer-agent.md` in my downstream project, When I encounter a rule about CI workflow timeouts, Then the rule reads e.g. "All workflows must declare `timeout-minutes:` — see your project's ADR governing CI policy" rather than "ADR-007 §4".
- Given I read `.github/agents/devops-agent.md`, When I encounter a rule about the orchestrator concurrency block, Then the rule reads in plain English what the constraint is and why, without referencing `FR-027` or `ADR-007 §2`.
- Given I read `.github/agents/incident-agent.md`, When I encounter an example about manual override, Then the example uses a generic domain placeholder rather than "dark factory".

### US-2: Agent behaviour is preserved

As the QuorumKit project maintainer,
I want the de-specifed agent definitions to enforce exactly the same rules as before,
so that removing the internal identifiers does not weaken or change any agent constraint.

Acceptance Scenarios:
- Given a reviewer-agent processes a PR, When the PR adds a workflow without `timeout-minutes:`, Then the agent still raises a BLOCKER — the rule is preserved even though the ADR number is removed from the file.
- Given a devops-agent reviews a workflow, When the `concurrency:` block is missing, Then the agent still flags it — the rule is preserved.

## Functional Requirements

### reviewer-agent.md

- FR-001: Replace `ADR-007 §4` with an inline description: "the project's ADR governing CI workflow timeout policy (all workflows must declare `timeout-minutes:`)".
- FR-002: Replace `ADR-005` with an inline description: "the project's ADR governing agent `kind` values in the pipeline registry".
- FR-003: Replace all `FR-NNN` citations (FR-024, FR-028, FR-007, FR-027, FR-029, FR-001, FR-005, FR-010 to FR-014) with inline descriptions of the rule being enforced. The parenthetical `(FR-NNN)` suffix may be removed; the meaning of each rule must be preserved in the surrounding prose.
- FR-004: Replace `docs/AGENT_PROTOCOL.md (FR-024)` references with `docs/AGENT_PROTOCOL.md` (keeping the file reference, removing only the FR citation).
- FR-005: Replace `orchestrator's regulation-lint CI job` with `the project's regulation-lint CI job (if configured)`.

### devops-agent.md

- FR-006: Replace `ADR-007 §2`, `ADR-007 §4`, `ADR-007 §6` with inline descriptions of the specific constraint (concurrency block, timeout, fallback audit step respectively).
- FR-007: Replace `FR-027`, `FR-028`, `FR-029` citations with inline rule descriptions. Meaning must be preserved.
- FR-008: Replace `quality-check.sh gate #14` with `the project's quality-check gate for workflow timeouts (if configured)`.
- FR-009: Replace `orchestrator workflow's` with `the orchestrator workflow's` (keep generic; do not reference specific file names that may differ in downstream projects).

### incident-agent.md

- FR-010: Replace the domain-specific example `for dark factory: can operators safely run in manual mode?` with a generic example: `for safety-critical systems: can operators safely run in manual mode?`.

### General

- FR-011: Both `.github/agents/` and `src/agents/` copies of all three files must be updated identically.
- FR-012: No other content in any agent file may be changed — only the specific references identified in FR-001 through FR-010.
- FR-013: The updated files must pass a diff review confirming no behavioural rules have been removed or weakened.

## Success Criteria

- [ ] `grep -rn "ADR-007\|ADR-005\|FR-024\|FR-028\|FR-007\|FR-027\|FR-029\|FR-001\|FR-005\|FR-010\|FR-011\|FR-012\|FR-013\|FR-014" .github/agents/ src/agents/` returns zero results.
- [ ] `grep -rn "dark factory" .github/agents/ src/agents/` returns zero results (or only in comments, not instructions).
- [ ] `grep -rn "regulation-lint\|quality-check.sh gate" .github/agents/ src/agents/` returns zero results or only generic descriptions.
- [ ] All three affected files are updated in both `.github/agents/` and `src/agents/`.
- [ ] A reviewer confirms that no agent rule has been removed or weakened — only the internal identifiers replaced.

## Key Entities

- **Distributed agent definitions**: Markdown files in `src/agents/` that are copied to downstream projects by `init.sh`; these must be portable and self-contained.
- **ADR reference**: A citation like `ADR-007 §4` that points to a QuorumKit-specific Architecture Decision Record; meaningful only within the QuorumKit project.
- **FR reference**: A citation like `FR-028` that points to a Functional Requirement from the QuorumKit Orchestrator spec; meaningful only within the QuorumKit project.

## Out of Scope

- Rewriting or restructuring agent instructions beyond the specific identifier replacements.
- Removing the `docs/AGENT_PROTOCOL.md` file reference (only the FR citation next to it).
- Changes to any agent file not listed in FR-001–FR-010.
- Changes to workflow files, scripts, or non-agent markdown files.
- Creating a mechanism to auto-generate generic descriptions from ADR/FR source files (future enhancement).

## Security and Privacy Considerations

N/A — documentation change only. No code, no credentials, no PII.

## Assumptions

- The three files identified (reviewer-agent.md, devops-agent.md, incident-agent.md) are the only distributed agent files containing QuorumKit-specific ADR/FR identifiers. If additional files are found during implementation, they should be fixed in the same PR.
- Removing internal identifiers does not affect the functional correctness of agent behaviour, since agents enforce rules based on the prose description, not the citation numbers.

## Open Questions

_None — scope is fully defined by the acceptance criteria. Ready for handoff._
