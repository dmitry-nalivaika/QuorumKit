# Contributing Guide

This project uses the **Agentic Dev Stack** — eight specialised AI agents drive
the development workflow. This guide explains how human contributors work alongside
the agents.

---

## Quick Reference

| You want to… | Do this |
|---|---|
| Report a bug | Open a GitHub Issue using the Bug Report template |
| Request a feature | Open a GitHub Issue using the Feature Request template |
| Report a security issue | See [SECURITY.md](SECURITY.md) — do NOT use a public issue |
| Implement a feature | Follow the [Feature Workflow](#feature-workflow) below |
| Review a PR | Comment `@reviewer-agent` on the PR, or review manually |
| Ask an architecture question | Open an issue and comment `@architect-agent` |

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Git | Version control |
| [GitHub CLI (`gh`)](https://cli.github.com) | Interacting with PRs and issues |
| Project language toolchain | See `README.md` for language-specific setup |

To use the AI agents locally:

| Tool | Mode |
|------|------|
| [Claude Code](https://claude.ai/code) + `ANTHROPIC_API_KEY` | Claude mode |
| GitHub Copilot subscription | Copilot mode |

---

## Project Constitution

Read `.specify/memory/constitution.md` **before contributing anything**. It defines:

- Technology stack and language standards
- Non-negotiable quality rules (TDD, no secrets in code, etc.)
- Data access and security requirements
- Coverage thresholds and linting rules
- Environment names and deployment process

If something in this guide appears to conflict with the constitution,
**the constitution takes precedence**.

---

## Feature Workflow

### 1. Open a GitHub Issue

Every feature starts with a GitHub Issue. Use the Feature Request template.
The Triage Agent will classify it automatically within 1 business day.

### 2. Write the Spec (BA Agent)

```
/ba-agent <feature description from the issue>
```

The BA Agent creates `specs/NNN-feature/spec.md` where NNN = the Issue number
(zero-padded to 3 digits). Review the spec, add clarifications if needed:

```
/ba-agent clarify specs/NNN-feature/spec.md
```

### 3. Create the Feature Branch

Branch name must match the spec directory:

```bash
git checkout -b NNN-short-slug   # e.g. 042-user-auth
```

Or use speckit:

```
/speckit-git-feature
```

### 4. Implement (Developer Agent)

```
/dev-agent Implement the spec at specs/NNN-feature/spec.md
```

The Developer Agent will:
1. Create `specs/NNN-feature/plan.md` (with Constitution Check)
2. Create `specs/NNN-feature/tasks.md`
3. Implement each task using TDD (test first, then code)

**Manual implementation**: follow the same TDD workflow — write the failing test,
write the minimum code to pass it, refactor, commit.

### 5. Open a PR

Use the PR template (`.github/pull_request_template.md`). Link the spec and issue.

### 6. Agent Reviews

Comment on the PR to trigger reviews:

```
@reviewer-agent    — spec + constitution compliance review
@qa-agent          — quality gates + acceptance scenarios
@security-agent    — OWASP security review (always on security-sensitive PRs)
@architect-agent   — architectural review (for significant design changes)
```

All BLOCKERs must be resolved before merge.

### 7. Merge

Once all agents approve and CI passes, merge via GitHub (squash or merge commit
per the constitution's preference).

---

## Commit Message Convention

```
<type>(<scope>): <short summary>

[optional body — what and why, not how]

Refs: #<issue-number>
```

Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `perf`, `security`

Examples:
```
feat(auth): add email/password login endpoint
fix(api): return 404 instead of 500 for unknown resource IDs
test(auth): add acceptance tests for login rate limiting
```

---

## Brownfield Contributions (existing projects)

If this project was set up with `--ai=both` on an existing codebase:

- Legacy code without a `spec.md` is **exempt** from spec-compliance checks
- New features and significant changes to legacy code **must** follow the full workflow
- When fixing bugs in legacy code: a minimal spec is appreciated but not mandatory;
  a clear PR description referencing the issue is sufficient
- If you are refactoring legacy code without changing behaviour, use type `refactor`
  and note that no spec is required in the PR description

---

## Spec and Branch Naming

| Artifact | Convention | Example |
|----------|-----------|---------|
| GitHub Issue | Created first | Issue #42 |
| Spec directory | `specs/NNN-short-slug/` | `specs/042-user-auth/` |
| Feature branch | `NNN-short-slug` | `042-user-auth` |
| spec.md | `specs/NNN-short-slug/spec.md` | `specs/042-user-auth/spec.md` |

NNN = Issue number, zero-padded to 3 digits.

---

## Code Standards

All code standards are defined in `.specify/memory/constitution.md`. Key rules:

- **TDD** — tests are written before the code they test
- **No hardcoded secrets** — use environment variables or a secret manager
- **Structured logging** — no raw debug output in committed code
- **Parameterised queries** — no dynamic query string construction
- **Input validation** — validate at every system boundary

---

## Getting Help

- Open a GitHub Issue with your question
- Comment `@architect-agent` on a PR for design guidance
- Read the agent definitions in `.claude/agents/` (Claude) or `.github/agents/` (Copilot)
