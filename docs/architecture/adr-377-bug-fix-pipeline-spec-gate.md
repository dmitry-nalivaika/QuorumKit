# ADR-377: Bug-Fix Pipeline Satisfies Spec-Before-Code via a BA Step and a Lightweight Bug Spec

| Field | Value |
|---|---|
| **ADR Number** | 377 |
| **Issue** | #377 — Dev agent blocks bug-fix pipeline: "Spec for issue not found at specs/NNN-*/spec.md" |
| **Status** | Approved |
| **Date** | 2026-10-06 |
| **Deciders** | Architect Agent |
| **Supersedes** | — |
| **Related** | Constitution §II, §III, §VII, §VIII; ADR-004 (orchestrator state v2); `specs/011-docs-agent-pr-diff` |

---

## Context

`bug-fix-pipeline` is `dev → qa → reviewer` ([`src/pipelines/bug-fix-pipeline.yml`](../../src/pipelines/bug-fix-pipeline.yml)).
It has no step that produces `specs/NNN-slug/spec.md`. The Developer Agent refuses to
start without one, so every `type:bug` issue stops at `dev` (observed on #376 and #377).

The refusal is correct behaviour, not a defect in the dev agent:

- **Constitution §III (NON-NEGOTIABLE, Spec-Before-Code):** no implementation starts until
  `specs/NNN-slug/spec.md` exists, passes `/speckit-checklist`, and has zero
  `[NEEDS CLARIFICATION]` markers. "The BA/Product Agent owns the spec; the Developer Agent
  owns implementation. These roles must not be conflated."
- **Constitution §II (NON-NEGOTIABLE, NNN Traceability):** Issue → spec directory → branch →
  ADR → PR → release note, "no exceptions".
- [`src/agents/developer-agent.md`](../../src/agents/developer-agent.md) lists "write specs"
  as something the agent does **not** do.
- The Reviewer Agent's "Spec compliance review" and the QA Agent's acceptance validation
  both consume `spec.md`. A bug-fix PR without one has nothing to be verified against.

So the real fault is in the pipeline definition: it omits a role the constitution requires.

Two further defects in the same file make the failure worse than a clean stop:

1. `dev` + `spec_gap` transitions to `dev` (a self-loop). `feature-pipeline.yml` routes the
   same outcome to `ba`. In the bug pipeline the run spins with nobody able to resolve it.
2. The dev agent reported the missing spec as `blocker`, not `spec_gap` (the #377 run's
   apm-msg), so even a corrected `spec_gap` edge would not have fired. The gate lives in the
   agent prompt and constitution reading; `dev-agent-runner.cjs` contains no spec check.

A constraint on the solution space: step `condition` fields are **not evaluated by the
engine**. They appear only in `pipeline.schema.json` and the loader docs, and
`engine/tests/worked-example.test.js:147` states the orchestrator does not skip-evaluate
v2 conditions. A design of the form "run BA only for non-trivial bugs" cannot be built
today.

## Decision

**Keep Spec-Before-Code intact. Add an unconditional `ba` entry step to `bug-fix-pipeline`
and give the BA Agent a lightweight bug-fix spec template. Fix the `spec_gap` routing.**

Concretely (to be implemented by the Developer Agent against a BA spec for #377):

1. **Pipeline:** `bug-fix-pipeline.yml` becomes `ba → dev → qa → reviewer`, with `entry: ba`
   and a `ba` step (`agent: ba-agent`, `timeout_minutes: 60`).
2. **Transitions:**
   - `ba` success → `dev`
   - `ba` `spec_gap` → `ba`, `ba` `needs-human` → `ba` (same as `feature-pipeline.yml`)
   - `dev` `spec_gap` → `ba` (was `dev`)
   - `reviewer` `spec_gap` → `ba` (mirrors `feature-pipeline.yml`)
   - All existing `qa`/`reviewer` → `dev` and `dev` `blocker`/`needs-human` edges are unchanged.
3. **BA Agent — Template C (Bug Fix):** a short spec template, used when the issue carries
   `type:bug`. It requires only: Overview (observed vs expected), Reproduction, one or more
   testable FRs describing the corrected behaviour, a regression-test success criterion,
   Out of Scope, and a one-line Security note. Open Questions must still be empty at handoff.
   It remains a full `spec.md` at `specs/NNN-slug/spec.md`, so `/speckit-checklist`, QA
   and Reviewer work unchanged.
4. **Dev Agent manifest** (`developer-agent.md`, both copies): state explicitly that a missing
   `specs/NNN-*/spec.md` is reported with outcome `spec_gap` (not `blocker`), so the
   orchestrator routes to `ba`. No runner code change is expected.
5. **Docs:** update the chain in `docs/PIPELINES.md` (table and footnote ³), the
   `docs/AGENT_INVENTORY.md` rows for `ba-agent`/`dev-agent`, and `CHANGELOG.md`.
6. **Tests:** an orchestrator routing test for the new `ba → dev` and `dev spec_gap → ba`
   routes (Constitution Quality Gates: "Orchestrator routing test"), and a pipeline-validator
   test that the file still validates.

**No constitution amendment is required.** This decision conforms to §II, §III and §VIII.

## Rationale

- **Compliance without a human-gated amendment.** The constitution's amendment path needs a
  human maintainer PR. This option unblocks the pipeline using only already-ratified rules.
- **Role separation is the point of §III.** Having the dev agent draft its own spec lets the
  implementer define "correct", which removes the check the Reviewer and QA rely on.
- **Cost is bounded by the template, not by skipping the step.** The overhead of a BA run is
  mostly the size of the spec it must write; Template C keeps it to one short page.
- **The BA agent already handles bugs.** Its `status:needs-info` flow (Steps to Reproduce,
  Expected/Actual) is bug-shaped, and the feature pipeline's `ba → dev` handoff, spec branch
  and spec PR mechanics are proven.
- **Traceability for free.** Every bug gets `specs/NNN-slug/` and a branch, which is what
  `agent-report.cjs` and the Branch Guard already assume.

## Consequences

**Positive**
- `type:bug` issues can complete end to end with no manual spec authoring.
- A missing spec routes to the role that can fix it, rather than a self-loop.
- Reviewer and QA keep a concrete artefact to verify a fix against.

**Negative**
- Every bug pays for one extra BA run and a spec PR, including one-line fixes.
- Bug-fix latency rises by roughly the BA step (budget: up to 60 minutes).
- `max_total_steps` headroom shrinks by one step per run (budget is 20; no change needed).

**Risks**
- *BA over-writes bug specs* (feature-grade ceremony for a typo). Mitigation: Template C is
  explicitly short; the BA manifest must say so and the checklist must not demand feature
  sections for it.
- *BA mis-describes the bug from a sparse report.* Mitigation: existing `status:needs-info`
  handling; BA outcome `needs-human` stops the run for a person.
- *Already-running bug pipelines.* Orchestrator state records `currentStep`; an in-flight run
  on the old definition may reference a step order that changed. Mitigation: apply the
  change when no bug-fix run is active; stuck runs (#376, #377) are re-triggered.
- *Consumers with their own copy of `bug-fix-pipeline.yml`* (the file header invites
  customisation) will not pick up the new chain automatically; the Developer Agent must
  verify `init.sh` behaviour for existing pipeline files. Mitigation: a CHANGELOG entry and a
  `docs/MIGRATION.md` note with the exact diff. This is a MINOR change (no layout break).

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|--------|-----|-----|-----------------|
| **A. Dev agent drafts a minimal spec** | No new step; fastest | Conflates BA and Dev roles; implementer defines acceptance; contradicts `developer-agent.md` | Violates §III, which is NON-NEGOTIABLE. Would need a constitution amendment |
| **B. Add `ba` step (chosen)** | Constitution-compliant; reuses proven BA flow; no amendment | One extra agent run per bug | — chosen |
| **C. Amend §III to exempt `type:bug`** | Zero added latency; simplest pipeline | Human-gated amendment; weakens the project's core rule; leaves Reviewer/QA with no spec; breaks §II chain "no exceptions" | Disproportionate for a pipeline defect; the existing rule can already be met cheaply |
| **D. BA step only for non-trivial bugs (`condition`)** | Avoids cost for tiny bugs | Engine does not evaluate `condition`; would need engine work first | Not buildable today; see Concern 1 |
| **E. Dev skips spec when `type:bug` (prompt exception)** | Smallest change | Same §III violation as C, but done silently in a prompt rather than ratified | Prohibited: "Agent prompts must not instruct agents to bypass" the constitution's gates |

## Architecture Review

- **ARCH-APPROVE (with conditions):** Option B. No `ARCH-BLOCKER`.
- **ARCH-CONCERN 1 — `condition` is documented but inert.** `docs/PIPELINES.md` says the
  `architect` step "is skipped unless this evaluates to true", but the engine never evaluates
  it (no evaluator exists in `engine/orchestrator/`), so `feature-pipeline` likely runs the
  architect step on every feature. Either implement
  condition evaluation or correct the docs. Recommend a separate issue. This also gates any
  future "skip BA for trivial bugs" optimisation (YAGNI until then, §VII).
- **ARCH-CONCERN 2 — `dev` has no `timeout` transition.** The #377 run ended `timed-out`
  with "no `timeout` transition declared". `qa` has `timeout → dev`; `dev` has none. Out of
  scope here; recommend a follow-up.
- **ARCH-CONCERN 3 — dual copies of agent manifests.** `src/agents/*.md` and
  `.github/agents/*.md` (and `src/.github/workflows/*` vs `.github/workflows/*`) must be kept
  in sync (Constitution §IV, dual-AI). Every manifest edit in this change must be applied to
  both, and the Dual-AI smoke test gate applies.

## Handoff

1. **BA Agent:** write `specs/377-bug-fix-pipeline-spec-gate/spec.md` for the Decision above
   (this issue also needs a spec under §III). Include the FRs: pipeline chain, transitions,
   Template C, `spec_gap` outcome from dev, docs.
2. **Developer Agent:** implement per the Decision, TDD. Routing tests are mandatory.
3. **Security Agent:** not required; no workflow permission or init-script change.
4. **Human maintainer:** confirm the cost trade-off (extra BA run per bug) before merge.
   If the maintainer prefers Option C, that is a constitution amendment and must go through
   the §Governance path; this ADR would then be superseded.
