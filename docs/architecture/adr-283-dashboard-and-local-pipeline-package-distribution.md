# ADR-283: Dashboard and Local-Pipeline Distribution via the Existing Engine Package

| Field | Value |
|---|---|
| **ADR Number** | 283 |
| **Issue** | #283 — Orchestrator with server and UI to be distributed within a package |
| **Spec** | `specs/283-orchestrator-with-server-and-ui-to-be-di/spec.md` |
| **Status** | Accepted |
| **Date** | 2026-07-27 |
| **Deciders** | Architect Agent, human maintainer (approved) |
| **Supersedes** | — |
| **Extends** | ADR-047 (three-zone repo topology + engine distribution) |
| **Related** | ADR-175 (local parallel pipeline worktree model), ADR-176 (dashboard pipeline lifecycle write path), ADR-177 (pipeline timeline data fetch) |

---

## Context

ADR-047 established two distribution channels published from `engine/` on every
tagged release: Channel A (reusable GitHub Action, for orchestrator invocation
in consumer CI) and Channel B (npm package `quorumkit-engine`, described as
letting "the dashboard \[...\] import orchestrator types/utilities" and letting
"power users build custom CLIs"). Channel B was scoped as a *library* consumed
by QuorumKit's own dashboard — not as a way to ship a standalone, runnable
dashboard server + UI to a consumer project.

Spec #283 (FR-001–FR-004) requires exactly the capability ADR-047 did not
decide: a consumer project installs the orchestrator, dashboard server, and
dashboard UI as one package via the existing setup script, and runs its own
project-scoped dashboard and local pipelines with no QuorumKit checkout
present.

Verified evidence that this is a real gap, not just an unstated intent:

- `engine/package.json`'s npm `files` whitelist is `["dist/", "action.yml",
  "RELEASING.md", "SECURITY.md"]` — `dashboard/` is not published at all.
- `engine/dashboard/server.js` resolves the project root and the pipeline
  script path relative to `__dirname` (`DASHBOARD_DIR/..` for project root,
  `DASHBOARD_DIR/../../scripts/pipeline.sh` for the pipeline runner). This
  only resolves correctly when the code lives at `<repo>/engine/dashboard/`
  inside a QuorumKit checkout. Loaded from
  `node_modules/quorumkit-engine/dashboard/` in a consumer project, both
  paths resolve to locations inside `node_modules`, not the consumer project.
- `scripts/pipeline.sh` (and its siblings `cleanup.sh`, `branch-guard.sh`)
  live only in this repo's self-host zone (`scripts/`, per ADR-047's Zone 3)
  and are never copied to consumer repos by `src/scripts/init.sh` — the
  distributable installer (Zone 1). US-3 (local pipelines in a consumer
  project) has no current distribution path.
- `src/scripts/init.sh`'s dashboard guidance prints
  `bash $QUORUMKIT_PACKAGE_DIR/engine/dashboard/start.sh`, which only works
  if a full QuorumKit clone sits alongside the consumer project — the exact
  problem statement #283 exists to fix.

This is an extension of an already-decided pattern (ADR-047's "one source,
two channels" distribution model), not a new external dependency or a new
channel, so per the Architect Agent's ADR-required criteria this qualifies
as "an existing architectural pattern is deviated from" — Channel B's scope
is widened from library-only to a runnable, project-scoped application.

---

## Decision

Widen **Channel B** (npm package `quorumkit-engine`) to include the
dashboard and local-pipeline capability as runnable, project-scoped
artifacts, instead of introducing a third distribution channel.

1. **Package contents**: add `dashboard/` and the local-pipeline scripts
   (`pipeline.sh`, `cleanup.sh`, `branch-guard.sh`) to `engine/package.json`'s
   `files` whitelist so they ship on every `quorumkit-engine` release.
   Placement within `engine/` (e.g. `engine/dashboard/`, `engine/scripts/`)
   is an implementation detail for the Developer Agent, provided it stays
   inside the already-established `engine/` publish root.

2. **One-command start (FR-002)**: add a `bin` entry to `engine/package.json`
   (e.g. `quorumkit-dashboard`) wrapping today's `start.sh` logic in a Node
   entrypoint, so a consumer project can start the dashboard via
   `npx quorumkit-dashboard` or a one-line `package.json` script — with no
   dependency on a sibling QuorumKit checkout.

3. **Project scoping (FR-003)**: replace `server.js`'s `__dirname`-relative
   resolution of project root and pipeline-script path with explicit
   resolution rooted at the *invoking* project, following the pattern
   `start.sh` already uses for `QUORUMKIT_PROJECT_DIR` (capture the
   invocation directory / git root before doing any other work). The
   pipeline script path must resolve against that project root, never
   against the package's own install location, so the dashboard shows only
   the consumer's own agents, specs, and pipelines whether the code is
   running from `node_modules/quorumkit-engine/` or from a QuorumKit
   checkout during self-host dogfooding (Zone 3 must keep working
   identically).

4. **Installer changes (FR-001, FR-004)**: `src/scripts/init.sh` (the
   distributable Zone 1 installer) is extended to copy the local-pipeline
   scripts into the consumer's own `scripts/` directory and to add the
   dashboard start command (`package.json` script or generated shim) —
   replacing today's guidance that assumes a sibling QuorumKit clone.

5. **Versioning (FR-005, FR-009)**: this changes the installed file layout
   for consumers (new files under their `scripts/`, a new `package.json`
   script/bin). Ship it through the `init.sh --upgrade` path ADR-047 already
   established, with a version bump and `CHANGELOG.md`/migration entry
   sized to the actual breakage (Developer Agent determines the exact
   SemVer bump per Constitution Principle V).

---

## Rationale

- **Principle V (Reusability & Zero-Config)**: the package must work
  out-of-the-box after `init.sh` with no manual edits — today it does not,
  for anything beyond the Action-based orchestrator path.
- **Principle VI (Observable, Auditable Automation)**: the dashboard must
  reflect real-time agent activity for the *consumer's own* project; a
  dashboard that can't resolve the consumer's project root can't do this.
- **Principle VII (Simplicity/YAGNI)**: widening Channel B's scope reuses
  the release pipeline, versioning, and provenance machinery ADR-047 and
  `engine/RELEASING.md` already built. A third channel (e.g. a separate
  `quorumkit-dashboard` package) would duplicate that machinery for no
  added benefit.
- **ADR-047 honoured, not re-litigated**: the "one source (`engine/`), two
  channels" model stands; only Channel B's published contents and the
  server's path-resolution strategy change.

---

## Consequences

**Positive**
- Fulfils #283 US-1 through US-4 without introducing a new distribution
  channel or new external dependency.
- Reuses the existing signed-tag + npm-provenance release pipeline
  (`engine/RELEASING.md`) unchanged.
- Self-host (Zone 3) and consumer (installed-package) code paths converge
  on one path-resolution strategy, reducing drift risk between them.

**Negative**
- The `quorumkit-engine` npm package grows (ships dashboard UI assets in
  addition to the orchestrator bundle).
- `server.js` path-resolution logic requires rework and must be tested in
  both execution contexts: running from a QuorumKit checkout (self-host)
  and running from `node_modules/quorumkit-engine/` (consumer install).

**Risks**
- **Regression in self-host dogfooding**: changing path resolution could
  break the dashboard in this repo's own Zone 3 usage. Mitigation: the
  existing dashboard/pipeline test suite (`engine/tests/pipeline.test.sh`
  and dashboard tests) must cover both execution contexts before merge —
  this is a QA Agent gate, not an Architect one.
- **Breaking change for any existing early consumers** who already worked
  around the missing distribution (e.g. via manual copy or symlink).
  Mitigation: document in the migration guide per FR-009, consistent with
  ADR-047's `init.sh --upgrade` precedent.

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| **New third channel** — separate `quorumkit-dashboard` npm package | Clean separation of concerns | Duplicates release/versioning/provenance machinery already built for Channel B; two packages to keep in version lock-step | Violates Principle VII (YAGNI); ADR-047's Channel B already exists for exactly this purpose, just under-scoped |
| **Status quo** — require a sibling QuorumKit checkout | Zero implementation cost | Directly contradicts the spec's problem statement and Principle V | Insufficient — does not address #283 at all |
| **Vendor-copy dashboard source into consumer via `init.sh`** | No runtime npm dependency | Un-patchable, drifts from engine source, consumers must manually pull updates | Same reasoning ADR-047 already rejected for the orchestrator engine itself |
| **Widen Channel B to include dashboard + local-pipeline scripts** *(this ADR)* | Reuses existing release pipeline; single source of truth preserved; minimal new machinery | Requires path-resolution rework in `server.js` | **Selected** |

---

## Open Questions for Downstream Agents

- Exact placement of `pipeline.sh`/`cleanup.sh`/`branch-guard.sh` within
  `engine/` vs. keeping them installer-copied from a new `src/scripts/`
  location — either satisfies this ADR; Developer Agent decides at plan time.
- Exact `bin` command name and whether it takes a `--project-dir` flag or
  relies solely on invocation-directory/git-root capture — release-time
  choice, not architectural.
- SemVer bump size for the breaking installed-file-layout change (FR-009) —
  determined once the Developer Agent's plan quantifies the actual breakage.

These are implementation choices, not architectural ones; they do not block
the Developer Agent from starting `plan.md`.
