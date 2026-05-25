# Spec: Fix Agent Invocation — Stale src/ Paths and Ask Mode Regression — Issue #172

**Issue:** #172
**Branch:** `172-fix-agent-invocation-paths-and-mode`
**Type:** bug
**Status:** approved

---

## Overview

Three regressions broke agent invocation from the QuorumKit dashboard and CI runner
after the `src/` → `.github/` migration:

1. **Stale `src/` path references** — `engine/dashboard/server.js` and
   `src/.github/scripts/dev-agent-runner.cjs` still resolved agent definitions from
   `.github/agents/` and skills from `.github/skills/`, which no longer exist in consumer
   projects after `init.sh` installs to `.github/agents/` and `.github/instructions/`.

2. **`@workspace` prefix forces Ask mode** — The generated Copilot Chat prompt began
   with `@workspace You are acting as…`. The `@workspace` participant is only valid
   in VS Code Copilot Ask mode; pasting it into Agent mode silently reverts to Ask
   mode, stripping the agent of all tools.

3. **Agent prompt files not seeded** — `.github/prompts/{agent}.prompt.md` files
   (with `mode: agent` frontmatter) were not part of the QuorumKit seed and were
   not installed by `init.sh`. Users had no out-of-the-box mechanism to invoke
   agents in Agent mode from the VS Code prompt picker.

---

## User Stories

### US-1: Dashboard invokes agent with correct paths

As a **developer using the QuorumKit dashboard**, I want the generated Copilot Chat
prompt to reference `.github/agents/{agent}.md` (not `.github/agents/`), so that the
agent can load its role definition without a 404.

**Acceptance Scenarios:**
- Given the dashboard generates a Copilot Chat prompt for any agent
  When I inspect the prompt
  Then the agent role file path is `.github/agents/{agent}-agent.md`
  And no `src/` path appears anywhere in the prompt

### US-2: Agent opens in Agent mode (not Ask mode)

As a **developer using the QuorumKit dashboard**, I want the generated Copilot Chat
prompt to start agents in Agent mode, so that tools (`read_file`, `run_in_terminal`,
etc.) are available.

**Acceptance Scenarios:**
- Given the bridge extension has switched VS Code to Agent mode before submitting
  When the prompt is submitted
  Then the agent starts in Agent mode
  And `@workspace` does NOT appear at the start of the submitted prompt

### US-3: Prompt files installed out of the box

As a **developer setting up a new consumer project**, I want `init.sh` to install
`.github/prompts/{agent}.prompt.md` files so that I can invoke any QuorumKit agent
in Agent mode directly from the VS Code prompt picker, without manual copy-pasting.

**Acceptance Scenarios:**
- Given I run `init.sh` on a fresh project with `AI_MODE=copilot` or `AI_MODE=both`
  When the install completes
  Then `.github/prompts/{agent}.prompt.md` exists for each of the 8 standard agents
  And each file contains `mode: agent` frontmatter
  And re-running `init.sh` does NOT overwrite existing prompt files (skip-if-exists)

### US-4: CI runner reads agent manifests from `.github/` paths

As a **CI pipeline**, I want `dev-agent-runner.cjs` to load agent and instruction
manifests from `.github/agents/` and `.github/instructions/`, so that the Developer
Agent workflow has access to the correct role definition.

**Acceptance Scenarios:**
- Given the CI runner reads manifests on startup
  When the job runs in a consumer project
  Then `manifests.agent` is read from `.github/agents/developer-agent.md`
  And `manifests.skill` is read from `.github/instructions/dev-agent.instructions.md`
  And no `src/` path reference appears in the runner

---

## Functional Requirements

- **FR-001:** `engine/dashboard/server.js` — `buildAgentCmd` MUST resolve agent
  definition files from `.github/agents/<agent>-agent.md` (consumer project root
  first, then package `src/` fallback). The old `resolveApmFile` helper that searched
  `.github/agents/` and `.github/skills/` MUST be removed.

- **FR-002:** `engine/dashboard/server.js` — `buildAgentCmd` MUST resolve instruction
  files from `.github/instructions/<short>-agent.instructions.md`. The `.github/skills/`
  lookup path MUST be removed.

- **FR-003:** `engine/dashboard/server.js` — `handleCopilotInvoke` MUST set
  `agentRelPath` to `.github/agents/<agent>-agent.md`. The `skillRelPath` variable
  MUST be removed (instructions apply automatically via `applyTo` patterns and do not
  need to be referenced in the prompt).

- **FR-004:** `engine/dashboard/server.js` — `handleCopilotInvoke` MUST NOT prefix
  the generated Copilot Chat prompt with `@workspace`. The prompt MUST start directly
  with `You are acting as the **<AgentName>**.`.

- **FR-005:** `src/.github/scripts/dev-agent-runner.cjs` — `manifests.agent` MUST be
  read from `.github/agents/developer-agent.md`. `manifests.skill` MUST be read from
  `.github/instructions/dev-agent.instructions.md`. All `src/` references in this
  file MUST be removed.

- **FR-006:** `src/.github/prompts/` MUST contain one `{agent}.prompt.md` file for
  each of the 8 standard agents: `architect`, `ba-product`, `developer`, `devops`,
  `qa-test`, `reviewer`, `security`, `triage`. Each file MUST carry `mode: agent`
  in its YAML frontmatter so VS Code opens Agent mode automatically when selected.

- **FR-007:** `src/scripts/init.sh` — the `install_copilot()` function MUST install
  each `src/.github/prompts/{agent}.prompt.md` to `.github/prompts/{agent}.prompt.md`
  in the consumer project, using a skip-if-exists guard consistent with existing
  instruction install logic.

- **FR-008:** The 8 `{agent}.prompt.md` files MUST also be installed to
  `.github/prompts/` in the QuorumKit repository itself (so the repo is self-hosting).

- **FR-009:** `scripts/test-dev-init.sh` MUST verify that `.github/prompts/` is
  created and contains exactly 8 files when `AI_MODE=copilot` or `AI_MODE=both`.

---

## Success Criteria

- [ ] Dashboard-generated Copilot Chat prompts reference `.github/agents/` paths only
- [ ] No `src/` path appears in any generated prompt or manifest load
- [ ] Agents start in Agent mode when invoked via the dashboard (no `@workspace` in prompt)
- [ ] `init.sh` installs 8 `{agent}.prompt.md` files on a fresh consumer project
- [ ] Re-running `init.sh` skips existing prompt files without error
- [ ] `dev-agent-runner.cjs` loads manifests from `.github/agents/` and `.github/instructions/`
- [ ] All existing tests pass (`cd engine && npm test`)
- [ ] `verify-mirror.sh` passes (ADR-006 invariants hold)

---

## Key Entities

- **`resolveFile(...candidates)`** — Replacement for the removed `resolveApmFile`
  helper. Accepts an ordered list of candidate paths and returns the first one that
  exists on disk, falling back to the first candidate as a last resort.
- **`.github/prompts/{agent}.prompt.md`** — VS Code prompt file with `mode: agent`
  frontmatter. When selected from the VS Code prompt picker, VS Code automatically
  opens Copilot in Agent mode and submits the file content as the initial prompt.

---

## Out of Scope

- Changes to agent role definitions (content of `.github/agents/*.md`)
- Orchestrator routing logic
- Dashboard UI changes beyond the prompt generation fix
- Changes to the bridge extension itself
- New agent types not already present in the system

---

## Security and Privacy Considerations

No PII is handled. The fix removes path references that no longer resolve; no new
permissions, secrets, or external services are introduced.
The `resolveFile` helper resolves only local filesystem paths; no user-controlled
input is passed to it.

---

## Assumptions

- Consumer projects run `init.sh` at least once before invoking agents via the dashboard.
- The bridge extension is responsible for switching VS Code to Agent mode before
  submitting the prompt; the dashboard only needs to ensure `@workspace` is absent.
- The 8 standard agents listed in FR-006 cover all agents currently distributed by QuorumKit.

---

## Open Questions

_All questions resolved._

1. **Should `skillRelPath` be included in the prompt body (not just omitted from the
   `@workspace` line)?**
   → No. Instructions apply automatically via `applyTo` patterns when the agent reads
   its role definition file. Referencing a skill path explicitly in the prompt is
   unnecessary and was the source of the stale path bug.
   **Status: RESOLVED.**
