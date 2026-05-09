# Plan: 047 Repo Topology + Engine Distribution

**Spec**: `specs/047-repo-topology/spec.md`
**ADRs**: `docs/architecture/adr-047-repo-topology-and-engine-distribution.md`,
`docs/architecture/adr-047-action-runtime.md`
**Branch**: `047-repo-topology`
**Issue**: [#47](https://github.com/dmitry-nalivaika/agentic-dev-stack/issues/47)

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to `main` | Feature branch `047-repo-topology`; PR #51 is the merge target. |
| Tests before implementation | TDD applied to mirror gates: `scripts/tests/test-verify-mirror.sh` was authored to red-light M4–M9 before `verify-mirror.sh` was extended. Engine relocation will follow the same loop. |
| No hardcoded secrets | OIDC trusted publishing for npm (FR-010); no `NPM_TOKEN` in steady state. |
| Input validation at boundaries | Pipeline DSL: `apiVersion` validation via safe YAML loader (FR-013). Workflow inputs: existing `actions/github-script` schema. |
| Data access scoping | N/A — no auth required (open-source CLI tooling). Action `permissions:` defaults to `contents: read` (FR-014). |
| Coverage threshold | Engine module retains its existing 182-test vitest suite. New shell gates are exercised by `scripts/tests/test-verify-mirror.sh` (13 negative-test fixtures, 100% rule coverage for M4–M9). |
| Dual-AI compatibility | `.claude/agents/` and `.github/instructions/` are populated to parity with `.apm/agents/`; M7 enforces. |
| Observable, auditable automation | `verify-mirror.sh` failures name the rule ID + remediation per FR-020. Release workflow will publish provenance attestations (T-12). |

## Approach

**Sequencing** (the only safe order):

1. **Land additive parity work** (Phase A–E in this branch — done):
   delete drift, populate Claude tree, SHA-pin Actions, extend mirror gates.
2. **Move engine source** (T-04 — pending): `scripts/orchestrator/` →
   `engine/orchestrator/`, with workflow path rewrites in the **same commit**
   so CI doesn't break.
3. **Build + commit `engine/dist/`** (T-07..T-09).
4. **Author `engine/SECURITY.md`** (T-11) → request Security Agent sign-off.
5. **Release workflow** (T-12): OIDC trusted publishing, signed tags,
   protected release environment.
6. **Rewrite distributed workflows to `uses:` form** (T-13) → remove
   `apm-allow: M8` markers.
7. **Bump `apm.yml` to 3.0.0 + CHANGELOG entry** (T-24, T-25).

Each step lands as its own atomic commit; intermediate states keep
`bash scripts/verify-mirror.sh` green and `npx vitest run` clean.

## Risks

- **Engine relocation breaks CI** — every workflow that references
  `scripts/orchestrator/` is currently behind a documented `# apm-allow: M8`
  marker. The relocation commit must update both the file paths and the
  marker comments atomically.
- **`@vercel/ncc` build determinism** — addressed in ADR-047 amendment with
  `npm ci --ignore-scripts` and a CI rebuild gate.
- **Placeholder Action `github/copilot-code-action@v1`** — no public repo
  exists; documented `# apm-allow: placeholder` until upstream publishes.

## Out of scope (carried over from spec)

Air-gapped distribution; orchestrator behavioural refactor; v2.x maintenance
branch.

See `specs/047-repo-topology/tasks.md` for line-item progress.
