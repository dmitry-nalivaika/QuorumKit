# ADR-067: QuorumKit Full Rebranding — Identity, Package, and Config Rename

| Field | Value |
|---|---|
| **ADR Number** | 067 |
| **Issue** | [#67](https://github.com/dmitry-nalivaika/quorumkit/issues/67) — QuorumKit Full Rebranding |
| **Spec** | `specs/067-quorumkit-rebranding/spec.md` |
| **Status** | Accepted |
| **Date** | 2026-05-09 |
| **Deciders** | Architect Agent, @dmitry-nalivaika |
| **Supersedes** | — |
| **Extends** | ADR-047 (repo topology + engine distribution) |

---

## Context

The project has been developed under the name **APM / Agentic Dev Stack** and the
GitHub repository slug `quorumkit`. Issue #61 gates the v3 NPM release; that
release must ship under a stable public identity from day one. Shipping `apm-engine`
to NPM and renaming to `quorumkit-engine` in a subsequent release would require
consumers to migrate twice and leave a stale published package on the NPM registry
that cannot be cleanly withdrawn once published.

Three distinct decisions are bundled in this rebranding and each individually meets
the ADR-required threshold:

1. **NPM publish identity** (`apm-engine` → `quorumkit-engine`, `"private": false`)
   — publishing to NPM is irreversible; a package once published cannot be fully
   unpublished without registry-level escalation.

2. **Consumer configuration manifest hard break** (`apm.yml` → `quorumkit.yml`)
   — changes the installed file layout (Constitution Principle V) and breaks all
   existing consumer projects without migration. Requires a MAJOR semver bump.

3. **Constitution amendment** (`.specify/memory/constitution.md` header and
   self-referential "APM" → "QuorumKit") — any amendment to the constitution
   requires an explicit record and human approval gate.

Internal wire-format tokens (`apm-msg`, `apm-state`, `apm-pipeline-state`) and the
`.apm/` directory are **intentionally excluded** from this decision; they carry their
own future ADR requirement.

---

## Decision

1. **Publish the engine to NPM** as `quorumkit-engine` (from `engine/package.json`)
   and `quorumkit-orchestrator` (from `engine/orchestrator/package.json`). Remove
   `"private": true` from both manifests simultaneously with the v3 MAJOR tag push.
   There will be no backward-compatible shim or deprecation alias for `apm-engine`.

2. **Rename the consumer configuration manifest** from `apm.yml` to `quorumkit.yml`
   as a hard, non-backward-compatible break. v3 will not recognise `apm.yml`.
   `installer/init.sh` will detect legacy `apm.yml`, emit a human-readable migration
   warning, and exit non-zero until `quorumkit.yml` is present.

3. **Amend the constitution** (`.specify/memory/constitution.md`) to replace "APM
   (Agentic Dev Stack)" with "QuorumKit" in the header and all self-referential
   mentions. This amendment is implemented in a **dedicated PR, separate from all
   other rename work**, and requires explicit human approval before merge.

4. **Wire-format tokens and `.apm/` directory are frozen** in this release.
   All references to `apm-msg`, `apm-state`, `apm-pipeline-state`, and `.apm/`
   paths remain unchanged. A follow-up spec and ADR are required before these can
   be renamed.

---

## Rationale

### Why no NPM shim for `apm-engine`?

Constitution Principle VII (Simplicity / YAGNI) prohibits maintaining parallel
published packages without concrete justification. A shim would require ongoing
maintenance, create confusion about canonical identity, and could never be safely
deleted once published. The v3 MAJOR bump provides the correct migration signal;
`MIGRATION.md` (FR-012) provides the upgrade path.

### Why is `apm.yml → quorumkit.yml` a hard break?

Constitution Principle V mandates that breaking changes to the installed file layout
require a MAJOR version bump. v3 is a MAJOR bump; this is the appropriate moment.
Allowing both filenames in parallel would require indefinite dual-parsing logic in
`init.sh` and would delay any ability to deprecate the old name cleanly.

### Why must the constitution amendment be a separate PR?

The constitution is the root authority for all architectural and process decisions.
Amending it as a side effect of a large mechanical rename PR creates risk that the
change is not reviewed with appropriate rigour. Separating the PR ensures human
review is focused and the approval is explicit and auditable.

### Why are wire-format tokens frozen?

Changing embedded HTML comment tokens (`<!-- apm-state -->`, `<!-- apm-msg -->`)
would silently corrupt state recovery for all existing consumer Issues that contain
these markers. There is no in-place migration path for content already written into
GitHub Issue bodies. This risk is disproportionate to the branding benefit at v3
launch, and merits its own dedicated protocol-migration ADR.

---

## Consequences

**Positive**
- Unified public identity from v3 launch; no double-migration for consumers.
- NPM package under `quorumkit-engine` establishes the canonical namespace cleanly.
- Constitution amendment is traceable and human-gated.
- Wire-format stability preserves backward compatibility for all existing consumer
  issue timelines.

**Negative**
- No deprecation shim: consumers on `apm-engine` must update before they can adopt
  v3 features.
- `apm.yml` is a hard break: existing consumer projects will fail at `init.sh` until
  they rename the file.
- Brand inconsistency between public `QuorumKit` identity and internal `apm-*`
  protocol tokens will persist until the protocol-migration ADR is resolved.

**Risks**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Consumer projects break silently on v3 upgrade | Medium | High | `installer/init.sh` detects `apm.yml`, exits non-zero with explicit error message (FR-005). `MIGRATION.md` provides step-by-step upgrade guide (FR-012). |
| `quorumkit-engine` NPM publish fails on first attempt, leaving no package at the new name | Low | High | Publish step is gated on CI success and a dry-run `npm pack` check (Success Criterion #2). Maintainer retains npm account control; no automation has unilateral publish rights. |
| Constitution amendment PR merged without adequate review | Low | High | Branch protection rule requires human approval on the constitution PR; Reviewer Agent flags any auto-merge attempt as `ARCH-BLOCKER`. |
| Wire-format protocol rename deferred indefinitely | Medium | Medium | Track as open tech-debt item; protocol-migration ADR must be filed before v4 planning begins. |

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|--------|-----|-----|-----------------|
| Publish `apm-engine` v3 then add `quorumkit-engine` as alias in a follow-up | Softer migration | Two publishes, two registry entries, permanent confusion about canonical name | Violates Principle VII; NPM aliases are not first-class and create long-term maintenance debt |
| Accept both `apm.yml` and `quorumkit.yml` in v3 with a deprecation warning | Zero-breakage migration | Requires indefinite dual-parsing in `init.sh`; delays clean deprecation | Violates Principle VII; complexity cost exceeds benefit at a MAJOR bump boundary |
| Rename wire-format tokens in this release | Completes the full brand migration | Silently corrupts all existing consumer issue timelines; no in-place migration path | Safety risk is disproportionate; excluded explicitly in spec Out of Scope |
| Amend constitution inline in the main rename PR | Fewer PRs | Constitution change buried in large mechanical rename; reduced review rigour | Constitution amendments require dedicated, human-gated approval — non-negotiable |

---

## Process Constraints (ARCH-BLOCKERs resolved by this ADR)

This ADR resolves the two ARCH-BLOCKERs raised in the Issue #67 Architecture Review:

1. **NPM publish identity** — covered by Decision §1 above; Developer Agent may
   proceed once this ADR reaches **Accepted** status.

2. **Constitution amendment** — covered by Decision §3 above; must be implemented
   in a standalone PR with human approval. Developer Agent must not amend the
   constitution as part of the bulk rename PR.

The following **open ARCH-CONCERN** from the review is recorded here for traceability:

- Wire-format token inconsistency (brand vs. protocol) — tracked as tech debt.
  A protocol-migration spec and ADR must be filed before v4 planning begins.
- Pre-existing `adr-047` numbering collision in `docs/architecture/` — must be
  resolved in a separate issue before new ADRs beyond this one are added.
