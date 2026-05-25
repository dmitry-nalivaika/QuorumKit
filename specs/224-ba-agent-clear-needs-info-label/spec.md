# Spec: BA Agent Clears status:needs-info When Refining an Issue — Issue #224

## Overview

When the triage agent cannot gather enough information to confirm an issue, it labels it `status:needs-info` and routes it to the BA agent. The BA agent currently has no instruction to clear this label after refining the issue, leaving issues in a misleading `needs-info` state even after a complete spec has been written. This spec adds explicit guidance to the BA agent definition to update the issue label and body when processing `status:needs-info` issues.

## User Stories

### US-1: BA Agent clears needs-info status after refinement

As a project maintainer reviewing the issue tracker,
I want issues to transition from `status:needs-info` to `status:confirmed` when the BA agent successfully refines them,
so that the issue status accurately reflects whether the problem is understood and ready for action.

Acceptance Scenarios:
- Given an issue has the `status:needs-info` and `agent:ba` labels, When the BA agent refines the issue description and writes a spec, Then the `status:needs-info` label is removed and `status:confirmed` is added.
- Given an issue has the `status:needs-info` label but the BA agent cannot resolve the missing information (e.g. the issue is genuinely ambiguous), When the BA agent processes it, Then `status:needs-info` is retained and the agent posts a comment explaining what additional information is still needed from the reporter.
- Given an issue does NOT have `status:needs-info`, When the BA agent processes it normally, Then the agent does not modify labels (existing behaviour preserved).

### US-2: BA Agent updates the issue body when it resolves needs-info

As a project maintainer,
I want the BA agent to fill in the empty fields of a `status:needs-info` issue (Steps to Reproduce, Expected Behaviour, Actual Behaviour) based on its analysis,
so that the issue record is complete and auditable even if the original reporter left the template blank.

Acceptance Scenarios:
- Given an issue body has empty "Steps to Reproduce", "Expected Behaviour", and "Actual Behaviour" sections, When the BA agent refines the issue, Then it fills in those sections with the inferred content derived from the issue title and any available context.
- Given the BA agent fills in the issue body, When it posts the update, Then a comment is added: `@ba-agent: status:needs-info resolved — issue description updated based on analysis. Status changed to confirmed.`

## Functional Requirements

- FR-001: The BA agent definition (`ba-product-agent.md`) must include an explicit step in its processing workflow: "If the issue has `status:needs-info`, analyse the issue title, context, and codebase to infer the missing information and update the issue body with completed Steps to Reproduce, Expected Behaviour, and Actual Behaviour sections."
- FR-002: The BA agent definition must instruct the agent to remove the `status:needs-info` label using `gh issue edit --remove-label "status:needs-info"` after successfully updating the issue body.
- FR-003: The BA agent definition must instruct the agent to add the `status:confirmed` label using `gh issue edit --add-label "status:confirmed"` at the same time as removing `status:needs-info`.
- FR-004: The BA agent definition must instruct the agent to post a comment on the issue confirming the status transition: `@ba-agent: status:needs-info resolved — issue description updated. Status changed to confirmed.`
- FR-005: If the BA agent cannot resolve the missing information (issue genuinely ambiguous), the agent must retain `status:needs-info`, post a comment listing the specific questions still unresolved, and NOT write a spec until the information is provided.
- FR-006: Both `.github/agents/ba-product-agent.md` and `src/agents/ba-product-agent.md` must be updated identically.
- FR-007: The change must be confined to the "Responsibilities" or "Workflow" section of `ba-product-agent.md`. No other section may be modified.

## Success Criteria

- [ ] `ba-product-agent.md` contains explicit instructions for clearing `status:needs-info`.
- [ ] Both `.github/agents/ba-product-agent.md` and `src/agents/ba-product-agent.md` are updated.
- [ ] A test issue with `status:needs-info` and `agent:ba` labels, processed by the BA agent, ends with `status:confirmed` and a complete issue body.
- [ ] A test issue with genuinely ambiguous content retains `status:needs-info` and receives a comment listing unresolved questions.

## Key Entities

- **status:needs-info label**: A GitHub Issue label applied by the triage agent to indicate that the issue description is too sparse to act on; the issue needs more detail before it can be confirmed or implemented.
- **status:confirmed label**: A GitHub Issue label indicating the issue has been reproduced or confirmed and is ready for spec/implementation.
- **BA Agent**: The agent responsible for writing feature specifications; also responsible for filling in missing issue information when `status:needs-info` is present.

## Out of Scope

- Changes to the triage agent's `status:needs-info` assignment logic.
- Automatically sending a notification to the original issue reporter.
- Changes to any other agent definition.
- Changes to the GitHub Actions workflow (the label management is done by the agent via `gh` CLI, not via a separate workflow step).

## Security and Privacy Considerations

N/A — agent definition documentation change. The `gh issue edit` commands use the existing `GITHUB_TOKEN` with `issues:write` scope already required. No PII, no new permissions.

## Assumptions

- The `gh issue edit --remove-label` and `gh issue edit --add-label` commands are available in the runner environment (this is already the case per existing BA agent usage).
- The `status:confirmed` label exists in the repository label set (verified: it is present).
- The `status:needs-info` label exists in the repository label set (verified: it is present).

## Open Questions

_None — the gap in the BA agent definition is clearly identified. Ready for handoff._
