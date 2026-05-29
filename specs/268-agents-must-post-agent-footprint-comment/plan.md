# Plan: Agents Must Post Agent-Footprint Comments — Issue #268

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to main | Feature branch: `268-agents-must-post-agent-footprint-comment` |
| Tests before implementation | No executable code — agent definition `.md` files only; verification is by manual inspection against spec FRs |
| No hardcoded secrets | N/A — only markdown documentation files are modified |
| Input validation at boundaries | N/A — no code boundaries introduced |
| Data access scoping | N/A — no auth required; no data access added |
| Coverage threshold | N/A — no test suite; acceptance validated against FR checklist in spec |

## Overview

This plan covers adding explicit, imperative `gh issue comment` invocation instructions to the five affected agent definition files (`ba-product-agent.md`, `developer-agent.md`, `qa-test-agent.md`, `reviewer-agent.md`, `security-agent.md`) in both `src/agents/` and `.github/agents/`.

The root cause (spec §Overview) is that agents run as local Copilot Chat sessions and post plain-text prose instead of the structured `agent-start` / `agent-complete` / `agent-fail` comments the dashboard parser expects. The fix is **instruction enforcement, not a parser change** (FR-011).

## Approach

### What to add (FR-008)

A `## Mandatory Footprint Steps` section inserted immediately after the `## Agent Identity` section in each of the 10 files. Placement at the top of the file (before Capabilities, Tools, Constraints, and workflow steps) ensures the instruction is impossible to miss regardless of how much of the file the agent reads before acting.

The section contains three named sub-sections:
1. **Mandatory First Action — Post `agent-start`**: explicit `gh issue comment` command, fires **before** any other action.
2. **Mandatory Last Action (success) — Post `agent-complete`**: explicit `gh issue comment` command with filled `apm-msg` block, fires as the **final** action of every successful session.
3. **On Any Unrecoverable Error — Post `agent-fail`**: explicit `gh issue comment` command with `"outcome": "fail"` `apm-msg` block, fires **instead of** plain-text prose.

### What NOT to change (FR-009, FR-011)

- The existing `## Agent Footprint` section and its templates remain untouched.
- No changes to dashboard parser, orchestrator, or any file outside `src/agents/` and `.github/agents/`.

### Sync requirement (FR-010)

Every change applied to `src/agents/<name>.md` is applied identically to `.github/agents/<name>.md`.

## Affected Files (10 total)

| File | Action |
|------|--------|
| `src/agents/ba-product-agent.md` | Insert `## Mandatory Footprint Steps` after `## Agent Identity` |
| `.github/agents/ba-product-agent.md` | Identical insert |
| `src/agents/developer-agent.md` | Insert `## Mandatory Footprint Steps` after `## Agent Identity` |
| `.github/agents/developer-agent.md` | Identical insert |
| `src/agents/qa-test-agent.md` | Insert `## Mandatory Footprint Steps` after `## Agent Identity` |
| `.github/agents/qa-test-agent.md` | Identical insert |
| `src/agents/reviewer-agent.md` | Insert `## Mandatory Footprint Steps` after `## Agent Identity` |
| `.github/agents/reviewer-agent.md` | Identical insert |
| `src/agents/security-agent.md` | Insert `## Mandatory Footprint Steps` after `## Agent Identity` |
| `.github/agents/security-agent.md` | Identical insert |

## Out of Scope

- Dashboard parser, orchestrator, or any other infrastructure file (FR-011).
- Any agent not in the affected list (FR-001 to FR-007 scope).
- Schema changes to `apm-msg` (FR-012).
