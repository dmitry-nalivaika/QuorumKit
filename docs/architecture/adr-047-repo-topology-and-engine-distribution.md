# ADR-047: Three-Zone Repo Topology + Engine Distribution Strategy

| Field | Value |
|---|---|
| **ADR Number** | 047 |
| **Issue** | [#47](https://github.com/dmitry-nalivaika/agentic-dev-stack/issues/47) — Structural cleanup + engine distribution |
| **Spec** | `specs/047-repo-topology/spec.md` |
| **Status** | Proposed |
| **Date** | 2026-05-09 |
| **Deciders** | Architect Agent, @dmitry-nalivaika |
| **Supersedes** | — |
| **Extends** | ADR-006 (SoT + mirroring), ADR-007 (GitHub Actions substrate) |

---

## Context

This repository simultaneously serves three roles, with no structural separation
between them:

1. **Distributable package** consumed by other projects (Constitution Principle V).
2. **Engine** (orchestrator + dashboard) that runs on GitHub Actions (ADR-007).
3. **Self-hosted consumer** that dogfoods itself (specs in `specs/`, workflows
   in `.github/workflows/`).

Two latent defects emerge from the conflation:

### Defect 1 — Mirror enforcement is incomplete (Principle V drift)

ADR-006 enforces only `.apm/agents/ → templates/github/instructions/` parity
via `verify-mirror.sh`. Three additional mirror surfaces drift today:

- **`templates/.apm/pipelines/`** exists, contradicts ADR-006 §3 ("pipelines are
  not mirrored"), and has *already* drifted from `.apm/pipelines/`. Verified by
  `diff`: `feature-pipeline.yml` is v2 in `.apm/`, v1 in `templates/`. A
  consumer running `init.sh` today receives a stale orchestrator config.
- **`.github/agents/`** is a byte-identical duplicate of `.apm/agents/` in this
  repo (`diff` returns empty) with no enforcement — pure tax.
- **14 of 25 workflow files** are duplicated between `templates/github/workflows/`
  and `.github/workflows/` with no parity gate. Workflow changes can silently
  fail to propagate in either direction.
- **`.claude/agents/` is empty** in this repo while `.github/agents/` is
  populated → Constitution Principle IV (Dual-AI Compatibility) violated in
  the SoT repo itself.

### Defect 2 — Engine is not distributed (Principle V "full power")

`init.sh` distributes prompts, agents, instructions, workflows, and pipeline
DSL files. It does **not** distribute the orchestrator engine
(`scripts/orchestrator/`) or the dashboard. Distributed workflows like
`orchestrator.yml` therefore reference paths (`node scripts/orchestrator/...`)
that do not exist in any consumer repo.

The user-stated requirement that triggered this ADR: *"I want pipelines and
the agentic environment to be distributed as well — full power in all my
other projects."*

Constitution Principle V demands every template and script be portable and
work out-of-the-box after `init.sh`. Today's package fails that test for
anything beyond single-agent prompt invocation.

---

## Decision

Adopt a **three-zone repo topology** plus a **two-channel engine distribution**
(reusable Action + npm package). Extend `verify-mirror.sh` with parity gates
for every drift surface.

### Part 1 — Three-zone repo topology

```
.apm/                    ← Zone 1: SoT — agents, skills, pipelines, runtimes, identities
docs/AGENT_PROTOCOL.md   ← regulation (sibling SoT, not mirrored)
templates/
  seed/                  ← first-init seeds (CLAUDE.md, CONTRIBUTING.md,
                           SECURITY.md, copilot-instructions.md)
  github/                ← generated mirrors only (instructions/, workflows/,
                           PR & issue templates)
installer/
  init.sh                ← was scripts/init.sh (kept as symlink for v3.x BC)
  verify-mirror.sh
  quality-check.sh
apm.yml

engine/                  ← Zone 2: Engine source — published, not copied
  orchestrator/          ← was scripts/orchestrator/
  dashboard/             ← was dashboard/
  tests/                 ← was tests/orchestrator/
  action.yml             ← reusable GitHub Action manifest (NEW)
  RELEASING.md           ← release procedure for both channels (NEW)
  SECURITY.md            ← required permissions justification (NEW)

.github/                 ← Zone 3: Self-host (this repo dogfoods itself)
  workflows/             ← MUST be byte-identical to templates/github/workflows/
                           for the overlapping subset; quality.yml and
                           update-dashboard.yml are self-host-only.
  instructions/          ← Copilot self-host mirror (Principle IV)
  prompts/               ← speckit prompts (self-host only)
  ISSUE_TEMPLATE/, pull_request_template.md, copilot-instructions.md
.claude/agents/          ← MUST be populated (Principle IV in SoT repo)
.claude/skills/          ← MUST be populated
.specify/, specs/        ← This repo's own specs
.apm-workspaces/         ← gitignored (transient orchestrator scratch)
```

`templates/.apm/pipelines/` is **deleted**.
`.github/agents/` is **deleted from this repo only** — `init.sh` still creates
it in *consumer* repos.

### Part 2 — Engine distribution (two channels, one source)

Both channels are published from `engine/` on every tagged release via a
single transactional CI release workflow:

#### Channel A — Reusable GitHub Action (primary)

Published as `dmitry-nalivaika/agentic-dev-stack/engine@v3` (sub-action of this repo) or
sibling repo. All distributed workflows call it instead of
`node scripts/orchestrator/...`:

```yaml
# templates/github/workflows/orchestrator.yml (NEW form)
- uses: dmitry-nalivaika/agentic-dev-stack/engine@v3   # consumers may SHA-pin
  with:
    pipeline: feature
    issue: ${{ github.event.issue.number }}
    runtime: ${{ vars.APM_RUNTIME || 'copilot' }}
```

The Action reads the consumer's local `.apm/pipelines/`, `.apm/runtimes.yml`,
and `.apm/agent-identities.yml` at runtime. Engine source is **never copied**
into the consumer; only invoked.

#### Channel B — npm package

Published as `@dmitry-nalivaika/apm-orchestrator` so:

- The dashboard (`engine/dashboard/`) imports orchestrator types/utilities
- The VS Code extension (`apm-copilot-bridge`) consumes the same source
- Power users can build custom CLIs against the published API

### Part 3 — `init.sh` distributes the full agentic environment

```
Consumer project after `installer/init.sh --ai=both`:
  .apm/
    agents/              ← copied (15 .md files)
    skills/              ← copied
    pipelines/           ← copied — NOW REACHABLE because Action reads them
    runtimes.yml         ← copied
    agent-identities.yml ← copied
  .claude/agents/        ← copied (--ai=claude|both)
  .claude/skills/        ← copied
  .github/
    agents/              ← copied (--ai=copilot|both) — only in consumers
    instructions/        ← copied
    workflows/           ← copied; reference engine via `uses:` Action
    copilot-instructions.md
  CLAUDE.md, CONTRIBUTING.md, SECURITY.md   ← seeded if absent
```

Engine source code is never copied. Consumers receive engine bug-fixes by
bumping the Action ref tag; no re-`init.sh` required.

### Part 4 — CI mirror enforcement (`verify-mirror.sh` extensions)

| Check | Rule |
|---|---|
| **M1** *(existing)* | `.apm/agents/<x>.md` MUST have a counterpart in `templates/github/instructions/` |
| **M2** *(existing)* | `.apm/runtimes.yml` and `.apm/agent-identities.yml` MUST exist and parse as YAML |
| **M3** *(existing)* | `docs/AGENT_PROTOCOL.md` MUST exist |
| **M4** *(NEW)* | `templates/.apm/pipelines/` MUST NOT exist (anti-mirror, ADR-006 §3) |
| **M5** *(NEW)* | Workflows present in **both** `.github/workflows/` and `templates/github/workflows/` MUST be byte-identical |
| **M6** *(NEW)* | `.github/agents/` MUST NOT exist in the SoT repo |
| **M7** *(NEW)* | Every `.apm/agents/<x>.md` MUST have a counterpart in `.claude/agents/` AND `.github/instructions/` (self-host Principle IV) |
| **M8** *(NEW)* | Distributed workflows MUST NOT contain `node scripts/orchestrator/`; engine is invoked via `uses:` |

Each failure message MUST include the rule ID, offending file path, and
exact remediation command.

---

## Rationale

- **Principle V (Reusability/Zero-Config)** is finally satisfied: `init.sh`
  produces a consumer repo that *actually works end-to-end* — pipelines run,
  the orchestrator routes, agents are invoked. Today's package is silently
  broken below the prompt-invocation level.
- **Principle VII (YAGNI)**: engine ships once, runs everywhere. No
  per-consumer vendor copy. Three redundant trees deleted.
- **Principle VIII (Single control plane)** preserved: still exactly one
  orchestrator implementation, now with explicit versioned distribution.
- **Principle IV (Dual-AI)**: the Action is runtime-agnostic; both Claude and
  Copilot consumers call the same Action; M7 enforces self-host parity.
- **ADR-006 §3 honoured**: pipelines are not mirrored; they live in `.apm/`
  in both SoT and consumer repos, read by the Action at runtime.
- **ADR-007 honoured**: substrate stays GitHub Actions; the Action wrapper is
  the natural expression of that contract.
- **Supply-chain hygiene**: consumers can SHA-pin the Action ref (Dependabot
  supports this) — better than copying mutable Node code.

---

## Consequences

**Positive**
- Consumers get the *full* agentic environment with one `init.sh` invocation.
- Engine bug-fixes propagate to all consumers via tag bump (no re-init).
- Drift becomes mechanically impossible across all four mirror surfaces.
- Engine, installer, and self-host are visually separated; new contributors
  orient in seconds.
- Dashboard and VS Code extension share one published package.

**Negative**
- One-time migration: rename `scripts/orchestrator/`→`engine/orchestrator/`,
  rename `dashboard/`→`engine/dashboard/`, rewrite distributed workflows to
  use `uses:` syntax, set up npm + Action publishing CI. ~2–3 days mechanical
  work.
- Consumers gain a runtime dependency on the published Action. Mitigation:
  SHA-pinning, hosted on GitHub (same availability surface as their workflows).
- npm package name + Action name require a stable scope/owner.
- Many import paths and workflow `working-directory:` fields update at once.

**Risks**
- **Breaking existing v2.x consumers**: workflows in their repo still
  reference `node scripts/orchestrator/`. **Mitigation**: ship `init.sh
  --upgrade` in v3.0.0 that idempotently rewrites those references; document
  in `BROWNFIELD_GUIDE.md` and `CHANGELOG.md`. Bump to **v3.0.0** (MAJOR).
- **Action permissions surface**: the reusable Action needs the same scopes
  the current orchestrator uses (`issues:write`, `pull-requests:write`,
  `actions:write`, `contents:write`). **Mitigation**: documented per-scope
  justification in `engine/SECURITY.md`; Security Agent reviews before publish.
- **Versioning skew**: a consumer pinned to `@v3.0.0` may use a pipeline DSL
  feature only available in `@v3.1.0`. **Mitigation**: pipeline-loader
  validates `apiVersion:` and fails fast with an actionable message
  (FR-013).
- **Partial release failure** (Action tag pushed but npm publish errors):
  release workflow MUST be transactional; rollback procedure documented in
  `engine/RELEASING.md`. (FR-029, SC-008.)
- **Air-gapped consumers** cannot reach the Action: explicitly out of scope
  for v3.0.0; vendor-copy mode reserved for future v3.x.

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| **Two-repo split** (`apm-package` / `apm-engine` / `apm-dev`) | Cleanest separation; zero ambiguity | High migration cost; loses single-PR cross-cutting changes; community fragmentation | Disproportionate effort for current team size |
| **Vendor copy** of `engine/` into every consumer | Offline-capable; no external dep | Bloated; un-patchable; consumers commit `node_modules` or run `npm install`; security patching nightmare | Violates Principles V & VII |
| **npm-only** (no Action wrapper) | Simpler release | Distributed workflows become verbose `run: npx ...` boilerplate × 25 files | Action wrapper is one extra file with massive UX win |
| **Action-only** (no npm) | Single artefact | Dashboard + extension can't reuse engine code | Loses Channel B benefits (programmatic consumers) |
| **Status quo + only fix `templates/.apm/pipelines/` drift** | Minimal effort | Leaves three of four BLOCKERs unaddressed; Principle IV violation persists; engine still undistributed | Insufficient — addresses symptom, not cause |
| **Three-zone topology + Action + npm** *(this ADR)* | All Principles upheld; full power distributed; mechanical drift prevention | 2–3 days migration; breaks external bookmarks | **Selected** |

---

## Migration plan (high-level — Developer Agent owns details)

Ordered to keep `main` green at every step:

1. ~~Open Issue → assign NNN.~~ Done — **#47**.
2. ~~Architect commits ADR-047.~~ This file.
3. ~~BA writes `specs/047-repo-topology/spec.md`.~~ Done.
4. Create `engine/action.yml` wrapping the existing entry point; verify with `act`.
5. Move `scripts/orchestrator/` → `engine/orchestrator/`; update internal imports.
6. Move `tests/orchestrator/` → `engine/tests/`. Update `vitest.config.js`.
7. Move `dashboard/` → `engine/dashboard/`. Update `package.json` paths.
8. Add release workflow that publishes Action tag + npm package on `v*` tags
   (transactional). Security Agent reviews `permissions:` block first.
9. Rewrite distributed workflows in `templates/github/workflows/` to use
   `uses: dmitry-nalivaika/agentic-dev-stack/engine@v3`.
10. Sync `.github/workflows/` byte-identically to `templates/github/workflows/`
    (the overlapping subset).
11. Delete `templates/.apm/pipelines/`. Update `init.sh` to copy from
    `.apm/pipelines/` directly.
12. Delete `.github/agents/` from this repo. `init.sh` still creates it in
    consumer repos.
13. Populate `.claude/agents/` + `.claude/skills/` in this repo (run
    `installer/init.sh --ai=both` on this repo).
14. Add `verify-mirror.sh` checks M4–M8 with negative-test fixtures.
15. Add `.apm-workspaces/` to `.gitignore`. Bump `apm.yml` to **3.0.0**.
    Update `CHANGELOG.md`, `BROWNFIELD_GUIDE.md`, `INIT.md`. Add
    `init.sh --upgrade` for v2.x consumers.

---

## Open questions for downstream agents

- **Action ref form**: sub-action of this repo (`dmitry-nalivaika/agentic-dev-stack/engine@v3`)
  vs sibling repo (`dmitry-nalivaika/apm-orchestrator@v3`). Either satisfies
  this ADR. Decision deferred to release time; recommend sub-action for
  simpler initial release.
- **npm scope**: `@dmitry-nalivaika/apm-orchestrator` is the working name.
  Confirmed at first publish.
- **`scripts/init.sh` BC symlink lifetime**: keep through v3.x; remove in v4.0.0.

These are release-time choices, not architectural choices; they do not block
implementation.
