# Spec: Agentic Dev-Agent Runner (Copilot + Claude)

**Issue:** #101
**Branch:** `101-agentic-dev-runner`
**Type:** feature
**Status:** draft

## Problem

The current `copilot-agent-dev.yml` workflow only **plans** a fix and posts a
comment. It cannot write code, run tests, commit, or open a PR. As a result the
orchestrator chain (dev → qa → reviewer) stalls at dev because no PR ever
materialises and no `outcome: success` apm-msg is posted.

There is also no working Claude dev-agent workflow — only the registry adapter
exists.

## Goal

Deliver a single **shared agentic runner** that:

1. Reads the canonical agent manifests (same files used by manually-invoked
   agents from VS Code / dashboard) so behaviour is identical regardless of
   trigger source.
2. Calls the LLM with **agentic tool-use**: read_file, list_dir, write_file,
   run_command, git_commit, open_pr, post_comment, signal_outcome.
3. Supports **two runtimes** via a single `RUNTIME_KIND` env var:
   - `copilot` → GitHub Models API (`gpt-4o`)
   - `claude` → Anthropic Messages API (native tool-use)
4. Posts an orchestrator-compatible apm-msg comment with the outcome
   (`success | fail | needs-human | blocker`) so the pipeline advances.

The two workflow files (`copilot-agent-dev.yml`, `agent-dev.yml`) become thin
wrappers that set `RUNTIME_KIND` and call the runner.

## Non-goals

- Changing the orchestrator itself
- Changing the runtime registry schema (already supports per-step `runtime`)
- Adding new runtime kinds (still `copilot` + `claude` only per ADR-005)

## Source-of-truth manifests (read by the runner)

| File | Purpose |
|---|---|
| `.apm/agents/developer-agent.md` | Role definition, responsibilities, hard constraints |
| `.apm/skills/dev-agent/SKILL.md` | Activation guide, common invocations, TDD reminder |
| `.specify/memory/constitution.md` | Project-wide non-negotiable rules |

These same files are read by the dashboard's manual `/dev-agent` invocation
today, so the runner inherits identical guardrails.

## Tool surface

| Tool | Purpose |
|---|---|
| `read_file(path)` | Read repo file content |
| `list_directory(path)` | List a directory |
| `write_file(path, content)` | Create or overwrite a file (sandboxed to repo root) |
| `run_command(command)` | Run shell command (`npm test` etc.) — destructive commands blocked |
| `git_commit(message)` | `git add -A && git commit` |
| `open_pull_request(branch, title, body)` | Push branch and `gh pr create` |
| `post_issue_comment(body)` | Post a regular comment on the source issue |
| `signal_outcome(outcome, summary, pr_url?)` | Post the orchestrator apm-msg comment and end the loop |

## Pipeline change

Pin the dev step's runtime explicitly in `.apm/pipelines/bug-fix-pipeline.yml`:

```yaml
steps:
  - name: dev
    agent: dev-agent
    runtime: copilot-default      # ← swap to claude-default to switch
    timeout_minutes: 90
```

The schema already supports the `runtime` field (per `pipeline.schema.json`).

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | One `.cjs` runner script works for both runtimes |
| AC-2 | Both workflow files are `<40 lines` and only set env + call runner |
| AC-3 | Bug-fix pipeline triggers: triage → dev (writes code + opens PR) → qa → reviewer |
| AC-4 | Switching `runtime:` in the pipeline swaps Copilot ↔ Claude without other changes |
| AC-5 | All three manifests are read by the runner (single source of truth) |
| AC-6 | No commits to `main`; merge only via PR |

## Constitution Check

| Rule | Compliance |
|---|---|
| No direct commits to main | All work on `101-agentic-dev-runner`, merged via PR |
| Tests before implementation | Runner unit-tested with mock LLM responses (see `tests/`) |
| No hardcoded secrets | All keys via `${{ secrets.* }}`; only `credential_ref` names in YAML |
| Input validation at boundaries | LLM responses validated against tool schema; `write_file` paths sandboxed |
| Coverage threshold | Runner: 80% line coverage on tool dispatcher |

## Risks

- **LLM hallucinations** writing wrong files → mitigated by sandboxed paths +
  feature-branch-only commits + PR review gate
- **Loop runaway** → bounded to 20 iterations + workflow `timeout-minutes: 30`
- **Anthropic API rate limits** → only triggered when pipeline pins
  `claude-default`; not used for Copilot path
