# ADR-006: Single Source of Truth + `init.sh` Mirroring for Dual-Runtime Artifacts

| Field | Value |
|---|---|
| **ADR Number** | 006 |
| **Issue** | #44 — Orchestrator v2 Design |
| **Status** | Accepted |
| **Date** | 2026-05-08 |
| **Deciders** | Architect Agent |
| **Supersedes** | — |

---

## Context

Constitution §IV (NON-NEGOTIABLE) requires every agent definition, skill,
workflow, and template to work with **both** Claude Code and GitHub Copilot,
with file homes:

- Claude variants: `.apm/agents/`, `.apm/skills/`, `.claude/`
- Copilot variants: `.github/instructions/`, `.github/workflows/`

Spec #44 introduces three new orchestrator-meaningful artifacts whose location
is asserted but not justified against §IV:

1. Pipeline files (`.apm/pipelines/*.yml`, FR-002)
2. Runtime registry (`.apm/runtimes.yml`, FR-007)
3. Regulation document (`docs/AGENT_PROTOCOL.md`, FR-014)

Without an explicit decision, three failure modes are possible:

- **Drift**: a maintainer edits `.apm/pipelines/foo.yml` but forgets the Copilot
  mirror; runtimes silently diverge.
- **Duplication tax**: every change requires editing two files; over time the
  trees fall out of sync (we already see this risk in `templates/github/`).
- **Wrong owner**: it is unclear which tree the *orchestrator code* reads at
  runtime, so a Copilot-only project might be running orchestrator logic that
  consults a non-existent `.apm/` path.

---

## Decision

For all orchestrator-meaningful configuration (pipelines, runtime registry,
regulation document, agent identity registry), the project adopts a
**Single-Source-of-Truth + Mirror-at-Init** pattern:

1. **`.apm/` is the canonical source of truth** for:
   - `.apm/pipelines/*.yml`
   - `.apm/runtimes.yml`
   - `.apm/agent-identities.yml`
   - The regulation document (`docs/AGENT_PROTOCOL.md` is in `docs/` because it
     is human documentation, not a runtime config; it is a sibling SoT).

2. **The orchestrator code reads only from `.apm/`** at runtime, regardless of
   which AI runtime is selected. This is enforced in `pipeline-loader.js` by
   hard-coding the search root.

3. **Copilot-tree mirroring is generated**, not authored. `scripts/init.sh`
   (and a new `scripts/sync-copilot-tree.sh` invokable in CI) mirrors the
   needed subset into `.github/` derivatives:
   - `.apm/pipelines/*.yml` → not mirrored (orchestrator reads `.apm/` directly
     in both runtimes; only the dispatched workflows differ, and those already
     live under `.github/workflows/`).
   - Agent prompts (already mirrored): `.apm/agents/*.md` →
     `.github/instructions/*-agent.instructions.md`.
   - The runtime registry is **not** mirrored; it is read by the orchestrator
     only (which always runs on GitHub Actions and can read `.apm/` directly).

4. **CI gate**: a `verify-mirror.sh` check runs on every PR that modifies
   `.apm/agents/`, fails the build if the corresponding
   `.github/instructions/` mirror is stale, and prints the exact diff. This
   makes the §IV invariant machine-checkable.

5. **Regulation document home**: `docs/AGENT_PROTOCOL.md` is the canonical
   location. It is human-authored (per spec #44 Out of Scope: "the regulation
   document is human-authored and source/CI must conform to it"). No mirror is
   generated; both runtimes link to the same path.

### Why one tree as SoT (not two equal trees)

Two equal trees with bidirectional sync invariably drift. The `.apm/` tree was
chosen as canonical because:
- It is the home of the foundational artifacts (constitution, agent role
  definitions). The Copilot tree is already a mirror in practice.
- It is shorter / closer to the repo root, simplifying tooling paths.
- Existing `init.sh` already populates the Copilot tree; the pattern is proven.

---

## Consequences

**Positive**
- Drift becomes mechanically impossible (CI fails on stale mirrors).
- Editors edit one file, not two.
- Constitution §IV is upheld with a single, testable invariant rather than
  reviewer vigilance.
- Spec #44's reference to `.apm/pipelines/`, `.apm/runtimes.yml`, and
  `docs/AGENT_PROTOCOL.md` is now grounded in an explicit dual-runtime contract.

**Negative / Trade-offs**
- Maintainers cannot directly edit files under `.github/instructions/`; doing
  so will be reverted by the next mirror run. Mitigation: a header comment
  `<!-- GENERATED FROM .apm/agents/<file>.md — DO NOT EDIT -->` is injected by
  the mirror script.
- A new CI check is added. Mitigation: it is a single shell script, no new
  dependencies (Constitution §VII compliant).

**Risks**
- *Risk*: A consumer project disables `init.sh` mirroring and ends up with
  divergent trees.
  *Mitigation*: The `verify-mirror.sh` check is part of the shipped CI; turning
  it off requires deliberate action and surfaces in PR diffs.

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| Two equal trees, manually maintained | Each runtime "owns" its files | Drift is inevitable; §IV becomes aspirational | Violates §IV's non-negotiability |
| Symlinks from `.github/` → `.apm/` | Zero duplication | Symlinks unsupported on Windows; breaks GH Actions checkout in some contexts | Cross-platform fragility |
| Single tree with runtime-aware path resolution at read time | Truly zero duplication | Both Claude Code and Copilot tooling expect their canonical paths; breaking either's UX is a §IV violation | Fights the tooling instead of the file system |
| `.apm/` SoT + `init.sh` mirror + CI verify (chosen) | Single edit point; mechanically enforced | Generated files in repo (small cost) | Accepted |

---

## References

- `specs/044-orchestrator-v2-design/spec.md` — FR-002, FR-007, FR-014
- Constitution §IV (Dual-AI Compatibility — NON-NEGOTIABLE), §V (Zero-config
  defaults), §VII (Simplicity)
- `scripts/init.sh` — existing mirroring entry point
- ADR-005 (Runtime registry interface) — registry path consumed by this ADR
