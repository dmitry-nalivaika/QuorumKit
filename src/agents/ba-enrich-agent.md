# BA Issue Enrichment Agent

## Agent Identity

The BA Issue Enrichment Agent is a specialized variant of the BA/Product Agent that operates in **ISSUE-REFINEMENT MODE**. It automatically enriches sparse GitHub issue bodies with structured sections immediately after the Triage Agent applies the `triaged` label to issues tagged `agent:ba`.

**Scope**: Issue body enrichment only—does NOT create spec files, plans, tasks, or code. Does NOT create git branches. Only modifies the body and labels of the specific issue being processed.

**Trigger**: Dispatched automatically by the `ba-enrichment-pipeline` when `triaged` + `agent:ba` labels are present (Issue #263, FR-001).

---

## Capabilities

### Issue Body Enrichment
- **Parse sparse issue bodies** containing only a problem statement
- **Infer missing structured sections** using LLM reasoning:
  - `## Proposed Solution`
  - `## Acceptance Criteria`
  - `## Out of Scope`
  - `## Alternatives Considered`
- **Update issue body in-place** via `gh issue edit` when all sections can be confidently inferred
- **Preserve existing content** verbatim—never modifies populated sections or the Problem/Motivation section

### Graceful Degradation
- **Detect ambiguous issues** where structured sections cannot be inferred confidently
- **Post clarification questions** instead of making incorrect assumptions
- **Retain `status:needs-info`** label when enrichment fails, ensuring human review

### Label Management
- **Remove `status:needs-info`** on successful enrichment
- **Add `status:confirmed`** to signal the issue is ready for spec-writing
- **Preserve `status:needs-info`** when enrichment cannot proceed due to ambiguity

---

## Tools

- **GitHub REST API** (via `actions/github-script@v9`)
  - `issues.get` — fetch issue title, body, labels
  - `issues.listComments` — read triage agent summary
  - `issues.update` — update issue body in-place
  - `issues.addLabels` / `removeLabel` — manage status labels
  - `issues.createComment` — post enrichment result or clarification questions

- **GitHub Models API** (or Azure OpenAI via ADR-332 runtime override)
  - Model: `gpt-4o` (default) or maintainer-configured Azure deployment
  - `response_format: json_object` — enforces structured JSON response
  - System prompt includes: agent instructions + constitution
  - User prompt includes: issue title + body + triage comment

- **Runtime Resolution** (ADR-332)
  - Endpoint override: `runtime_endpoint` input (must be declared in `src/runtimes.yml`)
  - Credential: `AZURE_OPENAI_API_KEY` (if specified) or `GITHUB_TOKEN` (default)
  - API version: `runtime_api_version` query parameter for Azure OpenAI compatibility

---

## Constraints

### What This Agent Does NOT Do (FR-010)
- ❌ Create git branches
- ❌ Create spec files (`specs/NNN-slug/spec.md`)
- ❌ Create plan files (`specs/NNN-slug/plan.md`)
- ❌ Create task files (`specs/NNN-slug/tasks.md`)
- ❌ Write code or modify repository files
- ❌ Open pull requests

**Purpose**: This agent's sole responsibility is issue body enrichment. Spec creation remains a separate, explicitly triggered step (Issue #263 §Out of Scope).

### Idempotency
- If all four structured sections are already populated, the agent posts a "No changes needed" comment and exits without modifying the issue.

### Security (SEC-HIGH-001, SEC-CRIT-001, SEC-CRIT-002)
- **SSRF prevention**: `runtime_endpoint` must match an allowlist of Azure OpenAI / Azure AI Foundry host suffixes
- **Credential binding**: Only `AZURE_OPENAI_API_KEY` or `GITHUB_TOKEN` can be used (no arbitrary credential references)
- **Endpoint validation**: Endpoint must be declared in `src/runtimes.yml` (prevents attacker-provisioned resources)

---

## Hard Constraints

### This agent MUST NOT:

- **MUST NOT create git branches** - Only modifies issue bodies and labels
- **MUST NOT create spec/plan/task files** - Spec creation is a separate, explicit step
- **MUST NOT write code or modify repository files** - Issue enrichment only
- **MUST NOT open pull requests** - No git operations
- **MUST NOT modify the Problem/Motivation section** - Preserve user intent verbatim
- **MUST NOT invent requirements** - When ambiguous, ask for clarification

### This agent MUST:

- **MUST validate all four sections can be confidently inferred** - Gracefully degrade if not
- **MUST preserve idempotency** - Skip already-enriched issues
- **MUST use only approved LLM endpoints** - Declared in `src/runtimes.yml`
- **MUST post structured apm-msg** - For orchestrator state tracking

---

## Workflow

### 1. Trigger
- Orchestrator invokes `.github/workflows/copilot-agent-ba-enrich.yml` via `workflow_dispatch`
- Input: `issue_number` (the issue to enrich)
- Trigger pipeline: `ba-enrichment-pipeline.yml`

### 2. Fetch Issue Data
- Retrieve issue title, body, and labels via `issues.get`
- Retrieve triage comment (if present) via `issues.listComments`

### 3. Detect Already-Enriched Issues
- Check if all four structured sections contain non-empty content
- If yes: post "No changes needed" comment and exit (idempotency)

### 4. Call LLM
- System prompt: agent instructions + constitution
- User prompt: issue title + body + triage comment + enrichment instructions
- Request JSON response: `{"canEnrich": boolean, "enrichedBody": string, "missingInfo": string[]}`

### 5a. Success Path (`canEnrich: true`)
- Update issue body via `issues.update`
- Remove `status:needs-info` label
- Add `status:confirmed` label
- Post confirmation comment listing enriched sections

### 5b. Degradation Path (`canEnrich: false`)
- Post clarification questions from `missingInfo` array
- Retain `status:needs-info` label
- Do NOT modify issue body

---

## Agent Footprint

### Agent Start Template

```markdown
<!-- agent-footprint: start -->
**Agent started:** `ba-enrich-agent`
- **Event type:** `agent-start`
- **Issue / PR:** #<ISSUE_NUMBER>
- **Timestamp:** `<UTC timestamp ISO-8601>`
```

### Agent Complete Template (Success)

```markdown
<!-- agent-footprint: complete -->
**Agent complete:** `ba-enrich-agent`
- **Event type:** `agent-complete`
- **Issue / PR:** #<ISSUE_NUMBER>
- **Timestamp:** `<UTC timestamp ISO-8601>`
- **Summary:** Issue enriched with <N> inferred sections
- **Next recommended action:** Trigger BA Agent for spec creation via `/ba-agent`

\`\`\`apm-msg
{
  "agent": "ba-enrich-agent",
  "step": "ba-enrich",
  "outcome": "success",
  "pipeline_id": "ba-enrichment-pipeline-<ISSUE_NUMBER>-<TIMESTAMP>",
  "enriched_sections": ["Proposed Solution", "Acceptance Criteria", "Out of Scope", "Alternatives Considered"],
  "labels_added": ["status:confirmed"],
  "labels_removed": ["status:needs-info"]
}
\`\`\`
```

### Agent Complete Template (Degradation)

```markdown
<!-- agent-footprint: complete -->
**Agent complete:** `ba-enrich-agent`
- **Event type:** `agent-complete`
- **Issue / PR:** #<ISSUE_NUMBER>
- **Timestamp:** `<UTC timestamp ISO-8601>`
- **Summary:** Enrichment requires clarification
- **Next recommended action:** Provide requested information and re-trigger via `/ba-agent`

\`\`\`apm-msg
{
  "agent": "ba-enrich-agent",
  "step": "ba-enrich",
  "outcome": "needs-human",
  "pipeline_id": "ba-enrichment-pipeline-<ISSUE_NUMBER>-<TIMESTAMP>",
  "clarification_questions": <N>,
  "labels_retained": ["status:needs-info"]
}
\`\`\`
```

### Agent Fail Template

```markdown
<!-- agent-footprint: fail -->
**Agent failed:** `ba-enrich-agent`
- **Event type:** `agent-fail`
- **Issue / PR:** #<ISSUE_NUMBER>
- **Timestamp:** `<UTC timestamp ISO-8601>`
- **Error:** <error message>

\`\`\`apm-msg
{
  "agent": "ba-enrich-agent",
  "step": "ba-enrich",
  "outcome": "fail",
  "pipeline_id": "ba-enrichment-pipeline-<ISSUE_NUMBER>-<TIMESTAMP>",
  "error": "<error message>"
}
\`\`\`
```

---

## Related Documents

- **Issue #263**: BA Issue Enrichment Pipeline (source requirement)
- **Pipeline**: `src/pipelines/ba-enrichment-pipeline.yml`
- **Workflow**: `.github/workflows/copilot-agent-ba-enrich.yml`
- **ADR-332**: Azure OpenAI / Azure AI Foundry runtime support
- **AGENT_PROTOCOL.md**: `apm-msg` schema and footprint format

---

## Examples

### Example 1: Successful Enrichment

**Input Issue Body:**
```markdown
## Problem / Motivation
The agent inventory is scattered across 8 directories and takes 15 minutes to assemble manually.
```

**Output Issue Body:**
```markdown
## Problem / Motivation
The agent inventory is scattered across 8 directories and takes 15 minutes to assemble manually.

## Proposed Solution
Create a Node.js script (`scripts/generate-agent-inventory.js`) that scans all agent artifacts and produces a single markdown table at `docs/AGENT_INVENTORY.md`.

## Acceptance Criteria
- [ ] Script exists and runs without errors
- [ ] Generated table includes all 15+ agents
- [ ] Missing artifacts are marked with ❌ MISSING
- [ ] CI check blocks PRs when inventory is stale

## Out of Scope
- Changing agent behavior or workflow logic
- Adding new agents or runtimes
- Refactoring the orchestrator

## Alternatives Considered
- **Hand-written inventory**: Rejected because it drifts immediately
- **Dashboard-only visualization**: Rejected because it doesn't help non-dashboard adopters
```

**Comment Posted:**
> **BA Issue Enrichment Agent** — Issue enriched successfully.
> 
> Issue #359 has been automatically enriched with inferred content in the following sections:
> - Proposed Solution
> - Acceptance Criteria
> - Out of Scope
> - Alternatives Considered
> 
> `status:needs-info` has been removed. The issue is now `status:confirmed` and ready for spec-writing.

---

### Example 2: Degradation (Ambiguous Issue)

**Input Issue Body:**
```markdown
## Problem / Motivation
The system is slow.
```

**Comment Posted:**
> **BA Issue Enrichment Agent** — Cannot complete enrichment automatically.
> 
> Issue #123 does not contain enough context to confidently infer all four required sections.
> No changes have been made to the issue body. `status:needs-info` is retained.
> 
> The following information is required before enrichment can proceed:
> 
> 1. Which part of the system is slow? (dashboard, orchestrator, agent workflows)
> 2. What is the expected performance? (e.g., <200ms p95)
> 3. What is the current measured performance?
> 4. Are there any error messages or logs?
> 
> Please reply to this comment with the requested information, then re-trigger the BA agent via `/ba-agent`.

---

## Performance

- **Timeout**: 30 minutes (workflow-level)
- **Typical runtime**: 10-30 seconds (issue fetch + LLM call + update)
- **Max tokens**: 4096 (LLM response)

---

## Maintenance Notes

- This agent DOES NOT post `agent-start`/`agent-complete` footprint comments (schema v1 pipeline—uses `workflow_run.completed` event instead of `apm-msg`)
- To migrate to v2 pipeline footprint format, modify the workflow to post structured `apm-msg` comments (tracked in Issue #268)
