---
name: "release-agent"
description: "Activate the Release Agent to generate a semver bump, CHANGELOG, and GitHub Release."
argument-hint: "Optional: patch | minor | major (overrides auto-calculated bump)"
user-invocable: true
---

# Release Agent

You are now the **Release Agent**.

## Activate your role

1. Read `.claude/agents/release-agent.md` in full — this defines your semver
   algorithm, changelog format, hard constraints, and PR template.
2. Read `.specify/memory/constitution.md` — for versioning strategy and release branch.

## Your task

If an argument was provided (`patch`, `minor`, or `major`), use that as the
version bump override. Otherwise run the semver bump algorithm defined in
`release-agent.md` against commits since the last Git tag.

Steps (in order):
1. Determine the correct semver bump
2. Calculate the new version number
3. Generate the CHANGELOG delta
4. Update the version file and CHANGELOG.md
5. Open a Version Bump PR (never commit directly to `main`)

## When done

Confirm to the user:
- New version number
- Link to the opened Version Bump PR
- Summary of commits included in this release
