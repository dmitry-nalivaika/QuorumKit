# ADR-003: Migrate Copilot Agent Workflows from `github/copilot-actions/ask@v1` to GitHub Models API

**Status:** Accepted  
**Date:** 2026-05-04  
**Issue:** #2 (Autonomous Agent Orchestration)  
**Supersedes:** n/a  
**Reviewers:** Architect Agent, Security Agent

---

## Context

The original Copilot-runtime agent workflows (e.g. `copilot-agent-triage.yml`,
`copilot-agent-reviewer.yml`, etc.) invoked agents using the
`github/copilot-actions/ask@v1` action. During implementation of Issue #2
(Autonomous Agent Orchestration), that action was replaced with a pattern using
`actions/github-script@v7` calling the GitHub Models inference endpoint
(`https://models.inference.ai.azure.com/chat/completions`) directly.

The reason for the change: `github/copilot-actions/ask@v1` does not expose a
stable, programmable response interface compatible with the Orchestrator's need
to parse agent output and post structured audit comments. The GitHub Models API
returns a standard OpenAI-compatible JSON response that can be consumed directly
in the `github-script` step with no additional tooling.

This change affects **Dual-AI Compatibility** (Constitution §IV) and introduces
a new external dependency (Constitution §VII), both of which require an ADR.

---

## Decision

Replace `github/copilot-actions/ask@v1` with `actions/github-script@v7` +
`fetch()` calling `https://models.inference.ai.azure.com/chat/completions` in
all Copilot-runtime agent workflows.

- **Model used:** `gpt-4o` (GitHub Models free tier; no extra credentials required — the `GITHUB_TOKEN` with `models: read` permission is sufficient)
- **Authentication:** `Authorization: Bearer $GITHUB_TOKEN` — the same token already granted to the workflow; no new secrets required
- **Permission added:** `models: read` added to every affected workflow's `permissions:` block

---

## Consequences

### Positive
- Agent output is a first-class JSON value in the `github-script` context; the
  workflow can extract, parse, and re-post it as a structured audit comment.
- No new third-party action dependency — `actions/github-script@v7` is a
  GitHub-maintained action already pinned to a semver tag.
- Authentication re-uses the existing `GITHUB_TOKEN`; no new repository secrets needed.
- Behaviour is functionally equivalent between Claude and Copilot runtimes:
  both receive the same system prompt (Constitution + agent definition file) and
  produce a GitHub Issue/PR comment as output.

### Negative / Risks
- **External endpoint dependency:** `models.inference.ai.azure.com` is a
  Microsoft-operated endpoint. If it is unavailable, Copilot-runtime agent
  workflows will fail. Mitigation: the Orchestrator's retry logic (FR-005) will
  catch transient failures; hard outages are surfaced as workflow run failures.
- **Model version drift:** `gpt-4o` is specified by name, not by a pinned
  model version. GitHub Models may silently update the underlying model.
  Mitigation: periodic smoke tests via the QA Agent.
- **Rate limits:** GitHub Models free tier has per-user and per-repo rate limits.
  High-volume repositories may hit limits. Mitigation: tracked as a follow-up
  issue; for the current scale of this project, limits are not a concern.

### Dual-AI Compatibility Assessment (Constitution §IV)
Both runtimes receive identical inputs (Constitution + agent definition + trigger
context) and produce the same output format (a GitHub Issue/PR comment). The
Orchestrator invokes each runtime via its own code path in `agent-invoker.js`
controlled by `aiTool` in `.apm-project.json`. No divergence in observable
behaviour is introduced.

---

## Alternatives Considered

| Alternative | Reason rejected |
|---|---|
| Keep `github/copilot-actions/ask@v1` | Response not machine-parseable; incompatible with Orchestrator audit trail requirement (FR-006) |
| Use OpenAI API directly with a stored secret | Requires a separate API key secret in every consumer repo; violates zero-config default principle (Constitution §V) |
| GitHub Copilot Extensions API | Not yet stable / GA at time of writing; no guaranteed SLA |

---

## Security Considerations

- `models: read` is a fine-grained permission scoped to GitHub Models only; it
  grants no write access to any resource.
- The `GITHUB_TOKEN` used is the standard short-lived workflow token; it is not
  stored or logged.
- The Security Agent reviewed this ADR as part of PR #8.
