# QuorumKit Agent Invocation Flow

> Complete guide to how GitHub events trigger agents through the orchestrator

**Last updated**: 2026-01-08  
**Related**: [AGENT_INVENTORY.md](./AGENT_INVENTORY.md), [PIPELINES.md](./PIPELINES.md), Issue #359

---

## Table of Contents

1. [Overview](#overview)
2. [GitHub Event Flow](#github-event-flow)
3. [Pipeline Resolution](#pipeline-resolution)
4. [Agent Resolution](#agent-resolution)
5. [Runtime Resolution](#runtime-resolution)
6. [Workflow Dispatch](#workflow-dispatch)
7. [Agent Execution](#agent-execution)
8. [Comment Processing](#comment-processing)
9. [Transition Resolution](#transition-resolution)
10. [Dual Runtime (Claude vs. Copilot)](#dual-runtime-claude-vs-copilot)
11. [Local Invocation](#local-invocation)

---

## Overview

QuorumKit's **orchestrator** is the autonomous control system that routes GitHub events to AI agents via v2 pipelines. This document explains the complete path from event → agent → response → next step.

```
┌─────────────┐
│ GitHub Event│ (issue labeled, PR opened, comment created)
└──────┬──────┘
       ↓
┌──────────────────┐
│ orchestrator.yml │ (workflow trigger)
└──────┬───────────┘
       ↓
┌────────────────┐
│ pipeline-loader│ (read src/pipelines/*.yml)
└──────┬─────────┘
       ↓
┌──────────┐
│ router-v2│ (match event to pipeline, resolve entry step)
└────┬─────┘
     ↓
┌────────────────────┐
│ runtime-registry   │ (resolve agent → runtime → workflow file)
└────────┬───────────┘
         ↓
┌────────────────┐
│ agent-invoker-v2│ (workflow_dispatch to agent workflow)
└────────┬────────┘
         ↓
┌─────────────────────┐
│ Agent Workflow File │ (agent-*.yml or copilot-agent-*.yml)
└────────┬────────────┘
         ↓
┌──────────────────┐
│ Agent Execution  │ (reads .github/agents/*.md, performs work)
└────────┬─────────┘
         ↓
┌─────────────────┐
│ apm-msg Comment │ (agent posts outcome)
└────────┬────────┘
         ↓
┌──────────────────────┐
│ orchestrator.yml     │ (issue_comment trigger)
└────────┬─────────────┘
         ↓
┌────────────────────────┐
│ apm-msg-parser         │ (extract outcome from comment)
└────────┬───────────────┘
         ↓
┌──────────────────────┐
│ identity-registry    │ (validate comment author)
└────────┬─────────────┘
         ↓
┌──────────────┐
│ router-v2    │ (resolve (step, outcome) → next step)
└──────┬───────┘
       ↓
┌──────────────┐
│ state-manager│ (append audit comment, update live-status)
└──────┬───────┘
       ↓
     (loop: next agent invoked)
```

---

## GitHub Event Flow

### 1. Event Trigger

QuorumKit responds to GitHub webhook events:

```yaml
# .github/workflows/orchestrator.yml
on:
  issues:
    types: [opened, labeled]
  issue_comment:
    types: [created]
  pull_request:
    types: [opened, labeled, synchronize]
  pull_request_review_comment:
    types: [created]
  workflow_run:
    workflows:
      - "Triage Agent (Copilot)"
      - "BA / Product Agent (Copilot)"
      # ... all agent workflows
    types: [completed]
```

**Key points**:
- `issues.labeled` triggers pipeline entry (e.g., when `triaged` label is added)
- `issue_comment.created` triggers transition logic (when agent posts `apm-msg`)
- `workflow_run.completed` triggers schema-v1 pipelines (legacy, being phased out)

### 2. Orchestrator Entry Point

The orchestrator workflow invokes the engine:

```yaml
- name: Run QuorumKit Orchestrator
  uses: dmitry-nalivaika/QuorumKit/engine@v3
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

This calls `engine/orchestrator/index.js` which:
1. Parses the GitHub event payload
2. Loads pipeline definitions from `src/pipelines/*.yml`
3. Matches the event to a pipeline
4. Dispatches the appropriate agent

---

## Pipeline Resolution

### How Pipeline Matching Works

**Source**: `engine/orchestrator/pipeline-loader.js` + `router-v2.js`

**Algorithm**:
1. Load all YAML files from `src/pipelines/`
2. For each pipeline, check `trigger` block:
   ```yaml
   trigger:
     event: issues.labeled
     labels:
       - triaged
       - type:feature
   ```
3. Match if:
   - Event type matches (`issues.labeled`)
   - **All** required labels are present on the issue
4. First matching pipeline wins (pipelines are processed alphabetically by filename)

**Example**: When issue #123 is labeled `triaged` + `type:feature`:

```yaml
# src/pipelines/feature-pipeline.yml
name: feature-pipeline
trigger:
  event: issues.labeled
  labels:
    - triaged
    - type:feature
entry: ba
```

→ `feature-pipeline` matches, entry step is `ba`

---

## Agent Resolution

### From Pipeline Step to Agent Slug

**Source**: `engine/orchestrator/router-v2.js`

**Process**:
1. Pipeline has `entry: ba` → orchestrator looks up step named `ba`
2. Step definition:
   ```yaml
   steps:
     - name: ba
       agent: ba-agent
       timeout_minutes: 60
   ```
3. Agent slug is `ba-agent`

**Step → Agent Mapping**:
- Step `name` is the pipeline state identifier (e.g., `ba`, `dev`, `qa`)
- Step `agent` is the canonical agent slug (e.g., `ba-agent`, `dev-agent`, `qa-agent`)
- One step can only invoke one agent

### Special Case: Direct-Trigger Agents

**Triage Agent is NOT invoked by any pipeline** - it's triggered directly via GitHub webhook:

```yaml
# .github/workflows/copilot-agent-triage.yml
on:
  issues:
    types: [opened]  # Direct webhook trigger
```

**Why?** The triage agent is the **entry point** for all new issues. It runs BEFORE the orchestrator can match any pipeline, because:
1. New issue opens → triage workflow triggers immediately
2. Triage agent posts comment + applies `triaged` label + classification labels
3. Orchestrator sees `triaged` label + classification labels → matches to appropriate pipeline
4. Pipeline begins execution (e.g., `feature-pipeline` if `triaged` + `type:feature`)

**Other directly-triggered agents**: None currently. All other agents are invoked through pipelines.

---

## Runtime Resolution

### How Agent Slugs Map to Runtimes

**Source**: `engine/orchestrator/runtime-registry.js` + `src/runtimes.yml`

**Algorithm**:
1. Load `src/runtimes.yml`
2. Check if agent has an override in `agent_defaults`:
   ```yaml
   agent_defaults:
     triage-agent: azure-foundry-standard
     docs-agent: azure-foundry-standard
   ```
3. If override exists, use it; otherwise use `default_runtime`:
   ```yaml
   default_runtime: copilot-default
   ```
4. Look up runtime configuration:
   ```yaml
   runtimes:
     copilot-default:
       kind: copilot
       endpoint: https://models.github.ai/inference
       credential_ref: GITHUB_TOKEN
   ```

**Result**: Agent slug → runtime name → runtime kind (copilot, claude, azure-openai)

---

## Workflow Dispatch

### From Runtime to Workflow File

**Source**: `engine/orchestrator/agent-invoker-v2.js`

**Workflow Naming Convention**:
- **Claude runtime** (`kind: claude`): `.github/workflows/agent-{slug}.yml`
- **Copilot runtime** (`kind: copilot`): `.github/workflows/copilot-agent-{slug}.yml`
- **Azure OpenAI** (`kind: azure-openai`): `.github/workflows/copilot-agent-{slug}.yml` (uses Copilot workflow with different LLM backend)

**Slug to Filename Mapping**:
- `ba-agent` → `copilot-agent-ba.yml` (strip `-agent` suffix)
- `dev-agent` → `copilot-agent-dev.yml`
- `qa-agent` → `copilot-agent-qa.yml`
- `triage-agent` → `copilot-agent-triage.yml`

**Dispatch**:
```javascript
await client.triggerWorkflow(owner, repo, workflowFile, ref, {
  issue_number: String(issueNumber),
  pipeline_id: pipelineContext.pipeline_id,
  worktree_path: pipelineContext.worktree_path
});
```

**Inputs passed to workflow**:
- `issue_number`: The GitHub issue/PR number
- `pipeline_id` (optional): For v2 pipelines, enables state tracking
- `worktree_path` (optional): For local dashboard invocations, points to user's working directory

---

## Agent Execution

### What Happens Inside the Workflow

**Example**: `.github/workflows/copilot-agent-ba.yml`

**Steps**:
1. **Checkout** repository
2. **Read agent definition** from `.github/agents/ba-product-agent.md`
3. **Execute agent logic** via GitHub Copilot API or Claude API
4. **Post `apm-msg` comment** with structured outcome

**Agent Definition Structure**:
```markdown
# BA / Product Agent

## Agent Identity
The BA/Product Agent owns requirements specification...

## Capabilities
- Parse issue descriptions
- Generate spec.md, plan.md, tasks.md
...

## Agent Footprint
<!-- Templates for apm-msg comments -->
```

**Agent Posts Outcome**:
```markdown
<!-- agent-footprint: complete -->
**Agent complete:** `ba-agent`
- **Event type:** `agent-complete`
- **Issue / PR:** #123
- **Timestamp:** `2026-01-08T12:34:56Z`

\`\`\`apm-msg
{
  "agent": "ba-agent",
  "step": "ba",
  "outcome": "success",
  "pipeline_id": "feature-pipeline-123-20260108"
}
\`\`\`
```

---

## Comment Processing

### How the Orchestrator Reads Agent Responses

**Source**: `engine/orchestrator/apm-msg-parser.js` + `identity-registry.js`

**Process**:
1. Orchestrator triggers on `issue_comment.created`
2. Parse comment body, extract ```apm-msg``` block
3. Validate comment author against `src/agent-identities.yml`:
   ```yaml
   identities:
     - agent: ba-agent
       logins:
         - github-actions[bot]
         - apm-ba-bot
   ```
4. If author login NOT in allowed list → **ignore comment** (security gate)
5. If valid, extract `outcome` field (e.g., `success`, `fail`, `blocker`, `needs-human`)

**Supported Outcomes** (per [AGENT_PROTOCOL.md](./AGENT_PROTOCOL.md)):
- `success` - work complete, proceed to next step
- `fail` - recoverable failure, may retry or rework
- `blocker` - unrecoverable blocker, human intervention needed
- `needs-human` - agent requests human decision
- `spec_gap` - missing or unclear requirements, bounce back to BA
- `timeout` - agent exceeded time budget

---

## Transition Resolution

### How Outcomes Determine Next Steps

**Source**: `engine/orchestrator/router-v2.js` + `loop-budget.js`

**Process**:
1. Current state: `(step: ba, outcome: success)`
2. Look up transition in pipeline:
   ```yaml
   transitions:
     - { from: ba, outcome: success, to: architect }
   ```
3. Check if transition is **backward** (destination step index ≤ source step index)
4. If backward, increment loop counter for that edge
5. Check loop budget:
   ```yaml
   loop_budget:
     max_iterations_per_edge: 3
     max_total_steps: 30
     max_wallclock_minutes: 720
   ```
6. If budget exceeded → fail pipeline with `loop-budget-exceeded` outcome
7. Otherwise, invoke agent for destination step (`architect-agent`)

**State Management**:
- Orchestrator appends audit comment to issue:
  ```markdown
  **[Pipeline: feature-pipeline]** Transition: `ba` (success) → `architect`
  ```
- Updates live-status comment (pinned at issue top):
  ```markdown
  ## 🔄 Pipeline: feature-pipeline
  - [x] ba (success)
  - [ ] architect (running)
  ```

---

## Dual Runtime (Claude vs. Copilot)

### How QuorumKit Supports Two LLM Providers

**Why Two Runtimes?**
- **Copilot**: Free for public repos, uses GitHub Models API
- **Claude**: Anthropic's Claude API (requires API key), higher quality for complex tasks
- **Azure OpenAI**: Enterprise option (requires Azure AI Foundry deployment)

**Configuration** (`src/runtimes.yml`):
```yaml
default_runtime: copilot-default  # Global default

agent_defaults:
  architect-agent: azure-foundry-standard  # Override for specific agents

runtimes:
  copilot-default:
    kind: copilot
    endpoint: https://models.github.ai/inference
    credential_ref: GITHUB_TOKEN
  
  claude-default:
    kind: claude
    endpoint: https://api.anthropic.com/v1
    credential_ref: ANTHROPIC_API_KEY
  
  azure-foundry-standard:
    kind: azure-openai
    endpoint: https://quorum-kit-resource.services.ai.azure.com/...
    credential_ref: AZURE_OPENAI_API_KEY
    model: gpt-5.2-codex
```

**Workflow Selection**:
- Runtime `kind: copilot` → `.github/workflows/copilot-agent-{slug}.yml`
- Runtime `kind: claude` → `.github/workflows/agent-{slug}.yml`
- Runtime `kind: azure-openai` → `.github/workflows/copilot-agent-{slug}.yml` (uses Copilot workflow, but calls Azure endpoint)

**Credential Resolution**:
- Orchestrator reads `credential_ref` (e.g., `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`)
- Looks up secret from GitHub Actions secrets: `${{ secrets.ANTHROPIC_API_KEY }}`
- Passes credential to agent workflow as environment variable

**No Silent Fallback** (ADR-332):
- If configured runtime is unreachable → **fail loudly**
- If credential is missing → **fail with clear error**
- This prevents agents from silently using wrong LLM provider

---

## Local Invocation

### How Local Pipelines Differ from GitHub Actions

**Dashboard Invocation**:
1. User opens QuorumKit Dashboard (`http://localhost:3100`)
2. Clicks "Run Agent" button in UI
3. Dashboard sends WebSocket message to server
4. Server calls `agent-invoker-v2.js` **directly** (no `orchestrator.yml`)
5. `workflow_dispatch` triggered with `worktree_path` input pointing to user's local directory
6. Agent workflow clones the worktree directory instead of fetching from GitHub
7. Agent posts `apm-msg` comment, orchestrator processes it normally

**Key Differences**:
- **No GitHub event** - dashboard invokes agents programmatically
- **Local worktree** - agent operates on user's uncommitted changes
- **Same workflows** - reuses `.github/workflows/copilot-agent-*.yml` files
- **Same state tracking** - produces same audit comments and state transitions

**See Also**: [LOCAL_PIPELINES.md](./LOCAL_PIPELINES.md), [DASHBOARD.md](./DASHBOARD.md)

---

## Troubleshooting

### Common Issues

**Issue**: "Agent workflow not found"
- **Cause**: Slug-to-workflow mapping failed
- **Fix**: Check that workflow file exists in `.github/workflows/`
- **Example**: For `ba-agent`, ensure `copilot-agent-ba.yml` exists (strip `-agent` suffix)

**Issue**: "Comment ignored (untrusted author)"
- **Cause**: Comment author not in `src/agent-identities.yml`
- **Fix**: Add GitHub login to appropriate agent's `logins` list

**Issue**: "Runtime credential missing"
- **Cause**: `ANTHROPIC_API_KEY` or `AZURE_OPENAI_API_KEY` not configured
- **Fix**: Add secret to GitHub repo settings → Secrets → Actions

**Issue**: "Loop budget exceeded"
- **Cause**: Pipeline has cyclic transitions causing infinite loop
- **Fix**: Increase `max_iterations_per_edge` or redesign pipeline transitions

**Issue**: "Pipeline not matched"
- **Cause**: Issue labels don't match any pipeline's `trigger.labels`
- **Fix**: Add required labels (e.g., `triaged` + `type:feature`) or update pipeline trigger

---

## Related Documents

- **[AGENT_INVENTORY.md](./AGENT_INVENTORY.md)** - Complete agent artifact matrix
- **[PIPELINES.md](./PIPELINES.md)** - Pipeline DSL reference
- **[AGENT_PROTOCOL.md](./AGENT_PROTOCOL.md)** - `apm-msg` schema and footprint templates
- **[ADR-004](./architecture/adr-004-orchestrator-state-comment-model-v2.md)** - State management design
- **[ADR-005](./architecture/adr-005-pluggable-runtime-registry-interface.md)** - Runtime registry design
- **[ADR-006](./architecture/adr-006-dual-runtime-source-of-truth-and-sync.md)** - src/ vs .github/ topology
- **[ADR-007](./architecture/adr-007-orchestrator-github-actions-substrate-contract.md)** - Orchestrator contract

---

## Quick Reference

### Event → Pipeline Matching

```bash
# List all pipeline triggers
grep -A 3 "^trigger:" src/pipelines/*.yml
```

### Agent → Runtime → Workflow

```bash
# Show runtime configuration
cat src/runtimes.yml

# Show which agents have runtime overrides
yq '.agent_defaults' src/runtimes.yml

# List all Copilot workflows
ls .github/workflows/copilot-agent-*.yml

# List all Claude workflows
ls .github/workflows/agent-*.yml | grep -v copilot
```

### Identity → Agent Mapping

```bash
# Show which logins map to which agents
yq '.identities[] | "\(.agent): \(.logins | join(", "))"' src/agent-identities.yml
```

### Debug Pipeline Run

```bash
# Check orchestrator logs
gh run list --workflow=orchestrator.yml --limit 5
gh run view <RUN_ID> --log
```

---

**End of Document**
