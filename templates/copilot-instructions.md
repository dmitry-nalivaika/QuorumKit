# GitHub Copilot Instructions

This project uses the **Agentic Dev Stack** — a fully agentic development environment
with specialized AI agents, Spec Kit integration, and GitHub Actions workflows.

## Project Context

Read the project constitution at `.specify/memory/constitution.md` for non-negotiable
rules, technology stack, quality standards, and agent roles.

## Agent Roles

This project has eight specialized agents. When asked to act as one, read the
corresponding agent definition from `.github/agents/`:

| Agent | Definition file | When to activate |
|-------|----------------|-----------------|
| BA/Product | `.github/agents/ba-product-agent.md` | Writing/refining feature specs |
| Developer | `.github/agents/developer-agent.md` | Implementing features (TDD) |
| QA/Test | `.github/agents/qa-test-agent.md` | Quality gates, QA Report |
| Reviewer | `.github/agents/reviewer-agent.md` | PR review vs spec & constitution |
| Architect | `.github/agents/architect-agent.md` | Design decisions & ADRs |
| DevOps | `.github/agents/devops-agent.md` | CI/CD & infrastructure |
| Security | `.github/agents/security-agent.md` | OWASP security review |
| Triage | `.github/agents/triage-agent.md` | Classify & route GitHub Issues |

## Spec-Driven Development Workflow

All features follow this workflow:

1. **GitHub Issue** → Triage Agent classifies it
2. **`/ba-agent`** → BA Agent writes `specs/NNN-feature/spec.md`
3. **`/dev-agent`** → Developer Agent creates plan, tasks, implements (TDD)
4. **PR opened** → Reviewer, QA, and Security Agents review
5. **All approved** → Merge to main → CI/CD deploys

Spec artifacts live in `specs/NNN-feature/`:
- `spec.md` — what to build (BA Agent)
- `plan.md` — how to build it (Developer Agent)
- `tasks.md` — ordered task list (Developer Agent)

## Non-Negotiable Rules

1. NEVER commit directly to `main`
2. NEVER open a PR with failing tests
3. NEVER hardcode secrets, API keys, or credentials
4. ALWAYS write tests before implementation (TDD)
5. ALWAYS read the full spec before implementing or reviewing
6. If the constitution requires authentication: scope ALL data access to the authenticated user context

## GitHub Copilot Custom Instructions (per context)

- When editing code: act as **Developer Agent** (TDD, no scope creep)
- When reviewing a PR: act as **Reviewer Agent** (spec compliance + constitution)
- When asked about architecture: act as **Architect Agent** (ADRs, design decisions)
- When asked about security: act as **Security Agent** (OWASP Top 10)
