# Feature Specification: Agent Inventory and Invocation Documentation

**Feature Branch**: `359-agent-inventory-and-invocation-docs`  
**Created**: 2026-01-08  
**Status**: Draft  
**Input**: "Agents inventarization across agents/instructions/workflows/agent-identities/runtimes and clear documentation of how workflows are being invoked and which agents are being used."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete Agent Inventory Table (Priority: P1)

As a QuorumKit maintainer or adopter, I want a single table showing every agent with its definition file, instruction file, prompt file, skill directory, workflows (Claude + Copilot), identity logins, default runtime, and which pipeline steps use it, so that I can quickly understand the full landscape without manually cross-referencing 8+ different locations.

**Why this priority**: This is the core deliverable. Without it, maintainers must manually grep across agents/, instructions/, prompts/, skills/, workflows/, identities, runtimes, and pipelines to answer "which artifacts belong to agent X?" — a 15+ minute task that should take 10 seconds.

**Independent Test**: Can be fully tested by running `node scripts/generate-agent-inventory.js` and verifying `docs/AGENT_INVENTORY.md` contains a row for each agent slug declared in `quorumkit.yml`, with columns populated from the correct file paths.

**Acceptance Scenarios**:

1. **Given** the repo with all agent artifacts scattered across multiple directories, **When** I run `node scripts/generate-agent-inventory.js`, **Then** `docs/AGENT_INVENTORY.md` is generated with a table containing one row per agent and columns for: agent slug, definition path, instruction path, prompt path, skill path, Claude workflow, Copilot workflow, identity logins, default runtime, and pipeline usage.

2. **Given** a new agent is added to `src/agents/new-agent.md`, **When** I run the generator script, **Then** the inventory table includes the new agent with all discoverable artifacts.

3. **Given** an agent is removed from `src/agents/`, **When** I run the generator script, **Then** the inventory table no longer includes that agent.

4. **Given** the `ba-enrich-agent` exists in identities and pipelines but has no definition file, **When** I inspect the inventory, **Then** the table includes a row for `ba-enrich-agent` with the definition column marked as `❌ MISSING`.

---

### User Story 2 - Invocation Flow Documentation (Priority: P2)

As a QuorumKit contributor or adopter debugging a pipeline run, I want a prose document explaining how a GitHub event becomes an agent invocation (with diagrams if helpful), so that I understand the orchestrator → pipeline → runtime → workflow → identity check → apm-msg reply flow without reading source code.

**Why this priority**: The orchestrator flow is complex and undocumented end-to-end. Contributors spend hours tracing `index.js` → `router-v2.js` → `agent-invoker-v2.js` → `runtime-registry.js` → workflow files to understand a single agent invocation. A single doc cuts that to minutes.

**Independent Test**: Can be fully tested by a new contributor reading `docs/AGENT_INVOCATION.md` and successfully answering: "When I label an issue with `triaged` + `type:feature`, which agent runs first, how is its runtime resolved, which workflow file executes, and where does the result comment come from?"

**Acceptance Scenarios**:

1. **Given** a GitHub issue labeled `triaged` + `type:feature`, **When** I read the invocation doc, **Then** I understand: (a) `orchestrator.yml` triggers on `issues.labeled`, (b) `router-v2.js` matches the label set to `feature-pipeline.yml`, (c) the pipeline's `entry` step is `ba`, (d) `agent-invoker-v2.js` resolves `ba-agent` to `ba-agent` slug, (e) `runtime-registry.js` resolves the runtime from `src/runtimes.yml`, (f) the invoker dispatches `copilot-agent-ba.yml` or `agent-ba.yml`, (g) the agent posts an `apm-msg` comment, (h) `identity-registry.js` validates the comment author, (i) `router-v2.js` reads the outcome and transitions to the next step.

2. **Given** a local dashboard invocation, **When** I read the invocation doc, **Then** I understand how it differs from the GitHub event flow (WebSocket bridge, no orchestrator.yml, direct workflow_dispatch).

3. **Given** a Claude vs. Copilot runtime choice, **When** I read the invocation doc, **Then** I understand how `src/runtimes.yml` selects the workflow file (`agent-*.yml` vs. `copilot-agent-*.yml`).

---

### User Story 3 - Automated Drift Detection (Priority: P3)

As a QuorumKit maintainer merging a PR, I want CI to fail if the generated inventory is out of sync with the actual files (similar to `verify-mirror.sh`), so that the inventory never drifts and becomes stale documentation.

**Why this priority**: Documentation rot is inevitable without enforcement. This story ensures the inventory stays accurate post-MVP.

**Independent Test**: Can be fully tested by (a) running `node scripts/generate-agent-inventory.js`, (b) committing the result, (c) adding a new agent file, (d) running the CI check, and (e) verifying the check fails with a clear message.

**Acceptance Scenarios**:

1. **Given** the inventory is up-to-date and committed, **When** CI runs, **Then** the drift check passes.

2. **Given** a developer adds `src/agents/new-agent.md` but does not regenerate the inventory, **When** CI runs, **Then** the drift check fails with a message: "Agent inventory is stale. Run `node scripts/generate-agent-inventory.js` and commit the result."

3. **Given** a developer deletes a workflow file referenced in the inventory, **When** CI runs, **Then** the drift check fails with a message indicating the missing file.

---

### Edge Cases

- What happens when an agent slug appears in `src/pipelines/*.yml` but has no definition, instruction, or workflow files?  
  → The inventory table includes the agent with `❌ MISSING` markers in the relevant columns.

- What happens when an agent definition exists in `src/agents/` but the slug naming is inconsistent (e.g., `developer-agent.md` but `dev-agent.instructions.md`)?  
  → The generator script uses a slug-mapping heuristic (same as `src/scripts/init.sh`) to resolve aliases.

- What happens when a workflow file in `.github/workflows/` is not mirrored in `src/.github/workflows/`?  
  → The inventory reports both locations if they differ, with a warning in the generated doc.

- What happens when `src/runtimes.yml` declares an `agent_defaults` override for an agent that doesn't exist?  
  → The drift check flags it as an error (dangling runtime reference).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The generator script MUST produce a markdown table at `docs/AGENT_INVENTORY.md` with columns: Agent Slug, Definition, Instruction, Prompt, Skill, Claude Workflow, Copilot Workflow, Identity Logins, Default Runtime, Pipeline Usage.

- **FR-002**: The generator script MUST discover agent slugs from ALL of: `quorumkit.yml`, `src/agent-identities.yml`, `src/runtimes.yml` agent_defaults, `src/pipelines/*.yml` step agent references, and `src/agents/*.md` filenames.

- **FR-003**: The generator script MUST mark missing artifacts with `❌ MISSING` instead of leaving cells blank, so gaps are immediately visible.

- **FR-004**: The generator script MUST use the same slug-mapping convention as `src/scripts/init.sh` (e.g., `ba-product-agent` → `ba-agent`, `developer-agent` → `dev-agent`, `qa-test-agent` → `qa-agent`).

- **FR-005**: The invocation documentation (`docs/AGENT_INVOCATION.md`) MUST cover: GitHub event → orchestrator.yml trigger → pipeline matching → step resolution → runtime resolution → workflow dispatch → agent execution → apm-msg reply → identity validation → transition resolution.

- **FR-006**: The invocation documentation MUST explain the difference between Claude and Copilot workflow invocation (workflow filename convention: `agent-*.yml` vs. `copilot-agent-*.yml`).

- **FR-007**: The invocation documentation MUST explain how local dashboard invocations differ from GitHub event-driven orchestrator runs.

- **FR-008**: The drift detection script MUST exit with code 1 if `docs/AGENT_INVENTORY.md` does not match the output of a fresh generator run.

- **FR-009**: The drift detection MUST be added to the `quality.yml` CI workflow so it blocks PRs when the inventory is stale.

- **FR-010**: The implementation MUST fix discovered gaps: (a) create a `ba-enrich-agent.md` definition if missing, (b) ensure all workflows in `src/.github/workflows/` are mirrored to `.github/workflows/`, (c) reconcile slug naming inconsistencies.

### Key Entities

- **Agent**: A slug identifier (e.g., `dev-agent`, `ba-agent`) representing a QuorumKit autonomous agent. Appears in pipelines, runtimes, identities, and has associated definition/instruction/prompt/skill/workflow artifacts.

- **Artifact**: A file associated with an agent: definition (`.md` in `src/agents/`), instruction (`.instructions.md` in `src/.github/instructions/`), prompt (`.prompt.md` in `src/.github/prompts/`), skill (`SKILL.md` in `src/skills/<slug>/`), workflow (`.yml` in `.github/workflows/`).

- **Runtime**: An entry in `src/runtimes.yml` specifying which LLM provider (copilot, claude, azure-openai) an agent uses. Agents inherit `default_runtime` or override via `agent_defaults`.

- **Identity**: An entry in `src/agent-identities.yml` mapping GitHub logins (e.g., `github-actions[bot]`) to agent slugs for apm-msg comment validation.

- **Pipeline Step**: A `steps[].agent` reference in `src/pipelines/*.yml` that invokes an agent by slug.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer can open `docs/AGENT_INVENTORY.md` and find the Claude workflow for `security-agent` in under 10 seconds (currently requires grepping 3+ directories).

- **SC-002**: A new contributor can read `docs/AGENT_INVOCATION.md` and correctly trace a feature-pipeline run from label event to BA agent invocation in under 5 minutes (currently requires 30+ minutes of code reading).

- **SC-003**: The CI drift check fails on at least one test PR where an agent file is added without regenerating the inventory.

- **SC-004**: All gaps identified during inventory generation are documented in the generated `docs/AGENT_INVENTORY.md` with `❌ MISSING` markers, making them actionable for future PRs.

- **SC-005**: The generator script completes in under 5 seconds on a MacBook Pro (inventory generation is fast enough to run in CI).

## Assumptions

- The repo structure remains `src/` as source-of-truth with `.github/` as mirror (per ADR-006). If the topology changes, the generator script will need updates.

- Agent slugs follow the `*-agent` suffix convention. Any agent not following this pattern (e.g., hypothetical `triage` without `-agent`) would require heuristic updates.

- The `quorumkit.yml` file is the authoritative list of "official" agents. Agents not listed there but found in identities/pipelines/runtimes are flagged in the inventory as "undeclared."

- Workflow files in `.github/workflows/` and `src/.github/workflows/` are expected to have identical counterparts (per ADR-006 mirroring). Drift warnings are advisory, not blocking.

- The `default_runtime` in `src/runtimes.yml` applies to all agents unless overridden in `agent_defaults`. This assumption is baked into the generator logic.

- The slug-mapping heuristic (ba-product-agent → ba-agent) matches `src/scripts/init.sh` exactly. If init.sh changes, the generator must stay in sync.
