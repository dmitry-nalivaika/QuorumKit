# QuorumKit Constitution

## Core Principles

### I. Agent-First Design (NON-NEGOTIABLE)
Every feature must be expressible as agent behaviour: a clear trigger, a defined
responsibility boundary, and a deterministic output. Agents are the primary
consumers of all APIs, file formats, and workflows. Human-only workflows are
permitted only where agent execution is technically impossible. Every new agent or
skill must be self-contained, independently testable, and documented with its own
role definition file under `.apm/agents/` or `.apm/skills/`.

### II. NNN Traceability (NON-NEGOTIABLE)
Every unit of work is anchored to a GitHub Issue number, zero-padded to 3 digits
(`NNN`). The same NNN ties together: Issue → spec directory (`specs/NNN-slug/`) →
git branch (`NNN-slug`) → ADR (`docs/architecture/adr-NNN-slug.md`) → PR → release note. No
work begins without a GitHub Issue. No spec is created without an Issue number. No
exceptions.

### III. Spec-Before-Code (NON-NEGOTIABLE)
No implementation starts until a spec at `specs/NNN-slug/spec.md` exists, passes
`/speckit-checklist`, and has zero `[NEEDS CLARIFICATION]` markers. The BA/Product
Agent owns the spec; the Developer Agent owns implementation. These roles must not
be conflated. Constitution compliance is verified at spec-write time, not at
review time.

### IV. Dual-AI Compatibility
All agent definitions, skills, workflows, and templates must work correctly with
**both** Claude Code and GitHub Copilot. Copilot variants live in
`.github/instructions/` and `.github/workflows/copilot-agent-*.yml`; Claude
variants live in `.apm/agents/`, `.apm/skills/`, and `.claude/`. Behaviour must
be functionally equivalent across both runtimes. Copilot-only or Claude-only
shortcuts that create divergence are prohibited without an approved ADR.

### V. Reusability and Zero-Config Defaults
This project is a **package consumed by other projects**. Every template, agent,
workflow, and script must be portable and work out-of-the-box after `init.sh`
with no manual edits. Opinionated defaults are preferred over configuration
options. New configuration options require justification and must have documented
defaults. Breaking changes to the installed file layout require a MAJOR version
bump and a migration guide.

### VI. Observable, Auditable Automation
Every automated action (triage, spec, plan, implement, test, review, release,
deploy) must produce a human-readable audit trail: a GitHub Issue comment, PR
comment, or workflow run log. Silent failures are prohibited. The agent dashboard
(`dashboard/`) must reflect real-time agent activity. Observability is not
optional.

### VII. Simplicity and YAGNI
Start simple. Add complexity only when a concrete, justified need exists. Prefer
fewer, well-defined agents over many narrow ones. Prefer convention over
configuration. Prefer existing GitHub primitives (Issues, PRs, labels, workflows)
over external tooling. No new dependencies without an ADR.

### VIII. Orchestrator as Single Control Plane (NON-NEGOTIABLE)
The Orchestrator is the sole component permitted to sequence, trigger, and
coordinate agents across the SDLC loop. No agent may directly invoke another
agent; all cross-agent coordination must flow through the Orchestrator. The
Orchestrator must be stateless between runs — all state lives in GitHub Issues,
PRs, and spec files, not in memory or local files. The Orchestrator's routing
logic must be expressed as declarative rules (not imperative scripts) so it is
auditable and testable without execution.

### IX. Dashboard as Read-Only Observability Surface
The agent dashboard (`dashboard/`) is a **read-only** visualisation layer. It
must never trigger, modify, or approve agent actions. Its sole purpose is to
surface real-time and historical agent activity, pipeline status, and health
metrics derived from GitHub Events and workflow run data. Dashboard features that
require write access to any system are out of scope and prohibited without an ADR.
The dashboard must remain functional as a standalone static app (no mandatory
backend) and as a VS Code extension (`dashboard/extensions/quorumkit-copilot-bridge/`).

## Quality Gates

All PRs must pass the following gates before merge:

- **Spec compliance**: Reviewer Agent verifies implementation matches `specs/NNN-slug/spec.md` functional requirements
- **Checklist gate**: `/speckit-checklist` passes with no blocking items
- **Agent sign-off**: Relevant domain agents have reviewed (QA, Security, Reviewer — as defined in PR template)
- **Constitution check**: No principle from this document is violated; any exception requires a linked ADR
- **Dual-AI smoke test**: Changes to agent definitions or workflows must be validated against both Claude Code and Copilot runtimes before merge
- **Orchestrator routing test**: Any change to Orchestrator routing rules must include a test case covering the new/modified route before merge
- **Dashboard read-only audit**: Any dashboard change must be reviewed to confirm no write path to GitHub or any external system has been introduced

## Security and Privacy Constraints

- No secrets, tokens, or credentials may be committed to the repository
- GitHub Actions workflows must use least-privilege token scopes
- Agent prompts must not instruct agents to bypass security reviews
- The Security Agent (`/security-agent`) must review any change to workflow permissions, init scripts, or agent invocation logic
- This project handles no PII — standard open-source data classification applies

## Development Workflow

1. Create a GitHub Issue → get NNN
2. BA/Product Agent writes `specs/NNN-slug/spec.md` → `/speckit-checklist` passes
3. Architect Agent reviews cross-cutting concerns if ADR needed
4. Developer Agent implements via `/speckit-implement` (TDD)
5. QA Agent validates acceptance scenarios
6. Reviewer + Security Agents sign off on PR
7. Release Agent bumps semver, updates CHANGELOG, publishes GitHub Release
8. Docs Agent syncs README, agent reference, and inline comments

## Governance

This constitution supersedes all other practices defined in this repository.
Amendments require:
1. A GitHub Issue describing the proposed change and rationale
2. An ADR at `docs/architecture/adr-NNN-slug.md` if the change affects agent behaviour, file layout, or compatibility
3. A PR reviewed and approved by at least one human maintainer
4. An update to `LAST_AMENDED_DATE` and `CONSTITUTION_VERSION` in this file

All agents must read this constitution before generating any spec, plan, or
implementation artefact. Non-compliance must be flagged, not silently corrected.

**Version**: 1.1.0 | **Ratified**: 2026-05-04 | **Last Amended**: 2026-05-04
