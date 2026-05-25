# Spec: replace_in_file Tool + write_file Size-Shrink Guard — Issue #136

## Overview

The agentic dev-runner (`dev-agent-runner.cjs`) only provides a `write_file` tool that requires the model to re-emit entire file contents to make edits. On large files this causes the LLM to truncate or hallucinate content, destroying hundreds of lines. This spec defines two complementary safeguards: a new `replace_in_file` tool for targeted string-replacement edits, and a size-shrink guard on `write_file` that refuses to overwrite a file with content smaller than 50% of the original.

## User Stories

### US-1: Targeted file editing with replace_in_file

As the dev-agent (LLM acting as developer),
I want a `replace_in_file` tool that applies a targeted old_str → new_str replacement without re-emitting the whole file,
so that small edits to large files are safe and accurate.

Acceptance Scenarios:
- Given `engine/dashboard/index.html` contains the string `QUORUMKIT_VERSION = "2.1.0"`, When the agent calls `replace_in_file` with `old_str="QUORUMKIT_VERSION = \"2.1.0\""` and `new_str="QUORUMKIT_VERSION = \"3.0.0\""`, Then the file is updated with a +1/-1 diff and all other content is preserved.
- Given `old_str` does not appear in the file, When the agent calls `replace_in_file`, Then the tool returns `ERROR: old_str not found in <path>` and the file is unchanged.
- Given `old_str` appears more than once in the file, When the agent calls `replace_in_file`, Then the tool returns `ERROR: ambiguous match in <path> — include more context in old_str` and the file is unchanged.
- Given `path` is outside the repo root sandbox, When the agent calls `replace_in_file`, Then the tool returns `ERROR: path outside repo root rejected: <path>` and no file is written.

### US-2: write_file size-shrink guard

As the dev-agent (LLM acting as developer),
I want `write_file` to refuse to overwrite an existing file when the new content is less than 50% of the original size,
so that accidental truncations are caught before they destroy working code.

Acceptance Scenarios:
- Given `engine/dashboard/index.html` is 2100 bytes and the agent calls `write_file` with 800 bytes of new content, When the tool runs, Then it returns `ERROR: write_file would shrink <path> from 2100 bytes to 800 bytes (>50% reduction); use replace_in_file for edits or pass force=true to truncate intentionally.` and the file is unchanged.
- Given the same scenario but `force: true` is passed, When the tool runs, Then the file is overwritten with the new content (800 bytes).
- Given a new file path that does not yet exist, When `write_file` is called with any content size, Then the file is created normally (no size guard for new files).
- Given `write_file` is called with new content ≥ 50% of the existing file size, When the tool runs, Then the file is overwritten normally.

### US-3: System prompt instructs patch-style editing

As the dev-agent (LLM acting as developer),
I want the system prompt to explicitly instruct me to use `replace_in_file` for edits to existing files,
so that I default to safe patch behaviour without relying on the size-shrink guard as a backstop.

Acceptance Scenarios:
- Given the runner starts a dev-agent session, When the system prompt is examined, Then it contains the instruction: "For edits to existing files, ALWAYS use `replace_in_file`. Reserve `write_file` for creating new files only. Never use `write_file` to make a small edit to a large file — use `replace_in_file` and supply 3–5 lines of context around the change."

## Functional Requirements

- FR-001: A new `replace_in_file` tool must be added to `toolDefs` in `.github/scripts/dev-agent-runner.cjs` with schema: `{ path: string, old_str: string, new_str: string }`.
- FR-002: `replace_in_file` must be sandboxed to the repo root (same `resolved.startsWith(repoRoot)` check as `write_file`).
- FR-003: `replace_in_file` must count occurrences of `old_str` in the file content. If count === 0: return error. If count > 1: return error. If count === 1: replace and write back.
- FR-004: `replace_in_file` must add a `force` parameter (boolean, optional, default false) that when true, skips the occurrence check and replaces the first occurrence — this is NOT exposed to the model by default; it is for testing only.
- FR-005: The `write_file` tool executor must check, when the target path already exists, whether `new content bytes < 0.5 × existing file bytes`. If so, return the size-shrink error without writing.
- FR-006: `write_file` must accept an optional `force` parameter (boolean, default false) that bypasses the size-shrink guard.
- FR-007: The `write_file` tool schema must be updated to include the optional `force` field.
- FR-008: The model system prompt in dev-agent-runner.cjs must include the instruction from US-3 acceptance scenario verbatim.
- FR-009: Both `.github/scripts/dev-agent-runner.cjs` and `src/.github/scripts/dev-agent-runner.cjs` must be updated identically (they are mirrors — see Issue #129).
- FR-010: All changes must be covered by unit tests in `engine/orchestrator/` (vitest) or a dedicated test file adjacent to the runner.

## Success Criteria

- [ ] `replace_in_file` tool is present and functional in both runner files.
- [ ] `replace_in_file` with a unique `old_str` produces a minimal diff (only the changed lines are touched).
- [ ] `replace_in_file` with missing `old_str` returns error; file unchanged.
- [ ] `replace_in_file` with ambiguous `old_str` returns error; file unchanged.
- [ ] `write_file` with new content < 50% of existing returns error; file unchanged.
- [ ] `write_file` with `force: true` and new content < 50% overwrites successfully.
- [ ] System prompt contains the patch-style editing instruction.
- [ ] Re-running the demo scenario from issue #132 (version constant change in `engine/dashboard/index.html`) produces a +1/-1 diff, not +4/-2146.
- [ ] All existing unit tests pass.
- [ ] New unit tests cover all FR paths above.

## Key Entities

- **dev-agent-runner**: The Node.js script (`.github/scripts/dev-agent-runner.cjs` / `src/.github/scripts/dev-agent-runner.cjs`) that provides the tool surface to the LLM and executes tool calls.
- **replace_in_file**: New tool that performs a single, unambiguous string replacement within an existing file.
- **write_file**: Existing tool for creating or fully overwriting files; extended with a size-shrink guard.
- **size-shrink guard**: The check that refuses a `write_file` call when new content is < 50% of existing file size.
- **system prompt**: The instruction block prepended to all dev-agent LLM calls, which governs tool-use behaviour.

## Out of Scope

- Changes to tools other than `write_file` and the new `replace_in_file`.
- Regex-based or multi-occurrence replace (out of scope for this issue; single exact-string match only).
- Changes to the GitHub Actions workflow files (beyond what is needed to distribute updated runner — see Issue #129).
- Changes to the orchestrator routing logic.
- Exposing `force` parameter to the LLM model (internal/testing use only).

## Security and Privacy Considerations

`replace_in_file` must apply the same repo-root sandbox as `write_file` (path traversal guard). The `old_str` / `new_str` content is LLM-generated and subject to prompt injection; no evaluation or execution of these strings is permitted — they are treated as plain string literals only. The `force` parameter is an internal override and should not appear in the tool description exposed to the model.

No PII involved. Standard open-source data classification applies per the constitution.

## Assumptions

- The 50% threshold is a reasonable first-pass heuristic; it can be tuned via a follow-up issue if false-positive rates are high.
- Both runner files (`.github/` and `src/.github/`) must always be kept in sync; this spec treats them as a single logical unit.
- The vitest test runner already configured at `engine/orchestrator/vitest.config.js` is the target test framework.

## Open Questions

_None — root cause is confirmed and the fix is fully scoped. Ready for handoff._
