# Enhancements & Deep Analysis

> **Vision**: The best agentic dev stack in the world for **fully automated,
> lights-out software development** — a closed loop where AI agents take a
> GitHub Issue all the way to a merged, deployed, documented, and monitored
> feature with zero human intervention on the execution path.
>
> **"Dark Factory" = the software factory runs itself.** The loop is:
> Triage → Spec → Plan → Implement → Test → Review → Security → Merge → Deploy
> → Monitor → Feedback → new Issue. Humans set strategy, approve escalations,
> and sign off on safety-critical changes. Agents handle all execution.
>
> Domain-specific knowledge (industrial/IoT, SaaS, fintech, ML) is delivered
> as **opt-in domain extension packs** that overlay the universal agents with
> domain-specific requirement templates, review checklists, and compliance
> rules — without touching the universal core.

## Domain Extension Pack Model

The stack ships **universal agents** for any software project. On top of that,
**domain extension packs** overlay domain-specific spec templates, review
checklist sections, and agent definitions — without duplicating universal logic.

```
Core Stack (always installed)
└── Universal Agents: BA, Dev, QA, Reviewer, Architect, DevOps, Security, Triage
    Release, Docs, Tech-Debt (new — see Phase 4)

Domain Extension Packs  (opt-in: bash init.sh --domain=<pack>)
├── industrial/  — OT Integration, Digital Twin, Compliance, Incident agents
├── saas/        — Multi-tenancy overlay, GDPR Agent, Billing Agent (planned)
├── fintech/     — Audit Trail Agent, PCI-DSS overlay, SOC2 overlay (planned)
└── ml/          — Model Card Agent, Data Lineage Agent, Bias Review (planned)
```

Domain packs **extend** universal agents (adding BA spec template variants,
Reviewer checklist sections) and **add** new agents only where the domain
genuinely requires a unique workflow. They never duplicate universal agent logic.

---

## Current State Summary

The stack currently delivers:
- **15 agents** — 11 universal core agents + 4 industrial domain agents (opt-in)
- **16 skills** — 11 universal wrappers + 4 industrial wrappers + `/onboard` wizard
- **25 GitHub Actions workflows** — 12 Claude + 12 Copilot + `alert-to-issue` observability webhook
- Full Claude Code + GitHub Copilot parity; domain extension pack model (`--domain=industrial`)
- **Fully closed SDLC loop**: Issue → Spec → Plan → TDD → PR gates → Merge → Release → Deploy → Monitor → Issue
- BA Agent: user-facing AND data pipeline spec templates; `/speckit-checklist` handoff gate
- QA Agent: coverage + latency SLO + **mutation testing gate**
- Reviewer Agent: spec compliance, migration checklist, **API contract governance** (openapi-diff, buf, graphql-inspector)
- Security Agent: OWASP Top 10 + dependency update review (Dependabot/Renovate)
- DevOps Agent: CI/CD + ring deployment gate + **infracost integration** + **observability feedback loop**
- Architect Agent: ADRs + **cross-spec consistency check** + **constitution evolution review**
- **Release Agent**: conventional commits → semver bump → CHANGELOG → GitHub Release (new)
- **Docs Agent**: README, API ref, inline comments, architecture doc sync on every merge (new)
- **Tech-Debt Agent**: monthly complexity hotspots, dead code, dep freshness, mutation score trend (new)
- Industrial domain pack: OT Integration (with OPC-UA scanner), Digital Twin (schema diff), Compliance, Incident (SEV auto-classify)
- Brownfield conflict detection + gradual rollout guide
- Library self-check CI: **12 quality gates** covering all 15 agents, 16 skills, and 25 workflows

### Honest gap list — what is still missing for a closed-loop autonomous SDLC

| # | Gap | Impact on autonomy | Phase |
|---|-----|--------------------|-------|
| 14 | Spec lint gate in `quality-check.sh` | 🟢 Low | 3 |
| 15 | Markdown link validator in CI | 🟢 Low | 3 |
| 16 | `infracost` wiring in DevOps Agent | 🟡 Medium | 3 |
| 17 | DTDL/RDF schema validator — Digital Twin Agent | 🟡 Medium | 3 |
| 18 | OPC-UA endpoint security scanner — OT Agent | 🟡 Medium | 3 |
| 19 | Incident severity auto-classification | 🟡 Medium | 3 |
| 20 | Deployment ring model enforcement gate | 🟡 Medium | 3 |
| 21 | **No Release Agent** — semver, changelog, GitHub Release | 🔴 Critical | 4 |
| 22 | **No Docs Agent** — README, API ref, inline comments drift | 🔴 Critical | 4 |
| 23 | **No Tech-Debt Agent** — complexity accumulates silently | 🟠 High | 4 |
| 24 | No API contract governance — breaking changes undetected | 🟠 High | 4 |
| 25 | No observability → Issue feedback loop | 🟠 High | 4 |
| 26 | No mutation testing gate — coverage % ≠ test quality | 🟡 Medium | 4 |
| 27 | No cross-spec consistency check | 🟡 Medium | 4 |
| 28 | No constitution evolution process | 🟡 Medium | 4 |

---

## Gap Analysis — Phase 3 (items 14–20)

### Gap 14 — Spec lint gate in quality-check.sh

`quality-check.sh` validates agents, skills, and workflows but never validates
spec files themselves. A spec missing required sections silently passes CI.

**Proposed**: Add gate 12 — scan any `specs/*/spec.md` example files in this
repo; warn if required headings (Overview, Functional Requirements, Success
Criteria, Out of Scope, Open Questions) are absent. Warn if any `TODO` items
remain open. Non-blocking warn only (example specs may be intentionally partial).

---

### Gap 15 — Markdown link validator in CI

Cross-document references break silently when files are renamed. No CI gate
catches them currently.

**Proposed**: Add a `markdown-link-check` step to `.github/workflows/quality.yml`
using `gaurav-nelson/github-action-markdown-link-check` (MIT, no extra token
needed for local links). Check all `.md` files at root level and in `templates/`.

---

### Gap 16 — `infracost` integration in DevOps Agent

The DevOps Agent has a COST-BLOCKER/COST-WARN policy but no automated
mechanism to produce cost estimates — teams must estimate manually.

**Proposed**: Add `## Infracost Integration` to `devops-agent.md`:
- How to add `infracost diff` as a CI step on IaC PRs
- Map `infracost` output thresholds to COST-BLOCKER (>20%) / COST-WARN (80–100%)
- Template CI step for Terraform / Pulumi / CDK

---

### Gap 17 — DTDL / RDF schema validator — Digital Twin Agent

The Digital Twin Agent detects model drift by manual review. No tooling
prescribed for automatically diffing schema versions.

**Proposed**: Add `## Automated Schema Diff` to `digital-twin-agent.md` —
prescribe `dtdl-validator` (Azure DTDL) or `rdf-validate-shacl` to diff schema
versions and surface breaking changes as TWIN-BLOCKER.

---

### Gap 18 — OPC-UA endpoint security scanner — OT Agent

The OT Integration Agent checks `SecurityMode` by code review only.

**Proposed**: Add `## Automated OT Security Scan` to `ot-integration-agent.md`
prescribing a `python-opcua` / `opcua-client` script that connects to configured
endpoints and reports `SecurityMode=None` as OT-BLOCKER.

---

### Gap 19 — Incident severity auto-classification

The Incident Agent asks humans to classify severity. Keyword heuristics can
classify SEV-1/2/3 automatically from the issue body before a human responds.

**Proposed**: Add a `## Severity Auto-Classification` section to
`incident-agent.md` — keyword patterns mapped to severity (no external
NLP service needed).

---

### Gap 20 — Deployment ring model enforcement gate

The DevOps Agent documents ring deployments but cannot block a full-fleet
rollout if canary metrics are unhealthy.

**Proposed**: Add `## Ring Deployment Gate` to `devops-agent.md`:
- Require minimum 15-minute canary soak (configurable in constitution)
- Block full-fleet deploy if canary error rate ≥ 1% during soak
- CI workflow snippet: gate `deploy-production` job on canary health check step

---

## Gap Analysis — Phase 4 (items 21–28)

### Gap 21 — No Release Agent 🔴

No agent handles the release lifecycle. Releases are entirely manual today.
In a lights-out SDLC, merging to `main` should automatically:
1. Analyse conventional commits since the last tag → determine semver bump
2. Generate or update `CHANGELOG.md` (grouped: feat / fix / security / breaking)
3. Bump version field in `package.json` / `pyproject.toml` / `Cargo.toml`
4. Create a GitHub Release with generated notes
5. Push the version tag

**Proposed**: New `release-agent.md` — triggered on merge to `main` or by
`release` label on a milestone issue.
- MUST follow Conventional Commits (`feat:`, `fix:`, `feat!:` / `BREAKING CHANGE:`)
- MUST NOT bump past a MAJOR version without explicit human approval
- MUST generate a PR for the version bump (never commit directly to `main`)

---

### Gap 22 — No Docs Agent 🔴

No agent owns documentation. In a lights-out SDLC, every merged feature
should automatically:
- Update the README "Features" / "API" section if user-visible capability added
- Generate or update API reference from code annotations (JSDoc, docstrings, etc.)
- Flag if `docs/architecture/` hasn't been updated when an ADR was triggered
- Add inline doc comments to public functions/classes that lack them

**Proposed**: New `docs-agent.md` — triggered by merge to `main` or
`@docs-agent` in a PR comment.
- MUST NOT change application logic — documentation changes only
- MUST open a PR for all doc changes (never commit directly to `main`)
- MUST flag DOCS-BLOCKER when an ADR-triggering feature has no architecture doc update

---

### Gap 23 — No Tech-Debt Agent 🟠

No agent performs periodic codebase health reviews. Complexity drifts silently
across features until it becomes a crisis.

**Proposed**: New `tech-debt-agent.md` — activated on a schedule or by
`/tech-debt-agent`.
- Run complexity analysis and identify hotspot files (high churn + high complexity)
- Identify dead code (unreachable functions, unused exports)
- Report outdated dependencies (> 6 months behind latest stable)
- Produce `docs/tech-debt-report-YYYY-MM.md`
- Open GitHub Issues (labeled `type:chore`) for items above the constitution's threshold
- MUST NEVER refactor automatically — report only; all fixes go through the
  standard spec → implement → PR workflow

---

### Gap 24 — No API contract governance 🟠

When a developer changes a public API schema (REST/OpenAPI, GraphQL SDL,
AsyncAPI, Avro, Protobuf), nothing automatically detects breaking changes.
Consumers silently break.

**Proposed**: Extend `reviewer-agent.md` with `## API Contract Review`:
- If PR touches a schema file: run a contract diff tool
- Classify changes: additive (safe) / deprecated (SUGGESTION) / breaking (BLOCKER)
- Prescribe tools: `openapi-diff`, `graphql-inspector`, `buf breaking`,
  `avro-compatibility-checker`
- Breaking change intentional? Require a matching ADR + consumer migration guide

---

### Gap 25 — No observability → Issue feedback loop 🟠

The agent loop ends at deploy. Production signals (errors, regressions,
alerts) never re-enter the SDLC automatically. The loop is not closed.

**Proposed**: Add `## Observability Feedback Loop` to `devops-agent.md`:
- Define Sentry / Datadog / CloudWatch alert → GitHub Issue webhook pattern
- Triage Agent receives auto-created Issues (labeled `source:observability`,
  `type:bug`, severity mapped from alert level)
- New template workflow: `alert-to-issue.yml` — receives alerting webhook,
  creates pre-filled GitHub Issue, triggers Triage Agent

---

### Gap 26 — No mutation testing gate 🟡

Coverage percentage is a weak proxy. A suite can hit 90% coverage while testing
nothing meaningful. Mutation testing is the honest quality metric.

**Proposed**: Add `## Mutation Testing Gate` (optional) to `qa-test-agent.md`:
- Only active if `mutation_score_threshold` is set in the constitution
- Prescribe: `mutmut` (Python), `Stryker` (JS/TS/Java/C#), `cargo-mutants` (Rust)
- Block if score is below threshold: MUTATION-BLOCKER

---

### Gap 27 — No cross-spec consistency check 🟡

A new spec can contradict a previously delivered feature — changing an entity
definition, adding a conflicting NFR, or overlapping scope. No agent checks this.

**Proposed**: Extend `architect-agent.md` with `## Cross-Spec Consistency`:
- Triggered by BA Agent handoff (new spec ready)
- Scan `specs/*/spec.md` for conflicting entity definitions, contradicting NFRs,
  scope overlaps with closed issues
- Label conflicts as `ARCH-CONFLICT` — must resolve before implementation starts

---

### Gap 28 — No constitution evolution process 🟡

The constitution is written once and never formally reviewed. Rules become
stale; constraints that were never triggered add friction; new risks emerge
that the constitution doesn't cover.

**Proposed**: Add `## Constitution Review` to `architect-agent.md`:
- Triggered every 10 merged features (configurable) or by `/architect-agent review-constitution`
- Review constitution against what was actually built
- Identify rules never triggered (potentially too strict) or always triggered as
  blockers (potentially too weak or unclear)
- Propose amendments as a PR to `.specify/memory/constitution.md`
- MUST require human approval before any constitution change is merged

---

## Prioritised Roadmap

### ✅ Phase 1 — Core Refactor (complete)

All 8 universal agents with formal conventions, NNN numbering, single source
of truth, thin SKILL.md wrappers, full Copilot parity.

### ✅ Phase 2 — Enhancements 1–13 (complete)

| # | Enhancement | Status |
|---|-------------|--------|
| 1 | QA Agent: performance / latency SLO gate | ✅ Done |
| 2 | BA Agent: data pipeline spec template (Template B) | ✅ Done |
| 3 | Reviewer Agent: expanded migration checklist | ✅ Done |
| 4 | Security Agent: dependency update review section | ✅ Done |
| 5 | Industrial guide: simulation test harness + CI stage | ✅ Done |
| 6 | DevOps Agent: edge deployment checklist | ✅ Done |
| 7 | Industrial guide: multi-site architecture guidance | ✅ Done |
| 8 | Onboarding skill (`/onboard`) | ✅ Done |
| 9 | DevOps Agent: cost gate (COST-BLOCKER / COST-WARN) | ✅ Done |
| 10 | BA Agent: `/speckit-checklist` required at handoff | ✅ Done |
| 11 | OT Integration Agent (industrial domain pack) | ✅ Done |
| 12 | Digital Twin Agent (industrial domain pack) | ✅ Done |
| 13 | Compliance Agent — IEC 62443 / ISA-95 / SIL (industrial) | ✅ Done |

### ✅ Phase 3 — Enhancements 14–20 (complete)

| # | Enhancement | Effort | Status |
|---|-------------|--------|--------|
| 14 | Spec lint gate in `quality-check.sh` | S | ✅ Done |
| 15 | Markdown link validator in CI | S | ✅ Done |
| 16 | `infracost` integration section in DevOps Agent | M | ✅ Done |
| 17 | DTDL / RDF schema validator — Digital Twin Agent | M | ✅ Done |
| 18 | OPC-UA endpoint scanner — OT Integration Agent | M | ✅ Done |
| 19 | Incident severity auto-classification | M | ✅ Done |
| 20 | Deployment ring model enforcement gate | M | ✅ Done |

### ✅ Phase 4 — Enhancements 21–28 (complete)

| # | Enhancement | Effort | Status |
|---|-------------|--------|--------|
| 21 | **Release Agent** — semver, changelog, GitHub Release automation | L | ✅ Done |
| 22 | **Docs Agent** — README, API ref, inline comment sync | L | ✅ Done |
| 23 | **Tech-Debt Agent** — complexity, churn, dead code, dep age | M | ✅ Done |
| 24 | API contract governance — Reviewer Agent extension | M | ✅ Done |
| 25 | Observability → Issue feedback loop — DevOps Agent + workflow | M | ✅ Done |
| 26 | Mutation testing gate — QA Agent extension | S | ✅ Done |
| 27 | Cross-spec consistency check — Architect Agent extension | S | ✅ Done |
| 28 | Constitution evolution process — Architect Agent extension | S | ✅ Done |

### ✅ Phase 5 — Domain Extension Pack Model (complete)

| Domain Pack | Agents included | Status |
|-------------|----------------|--------|
| `industrial` | OT Integration, Digital Twin, Compliance, Incident | ✅ Done — `--domain=industrial` flag in `init.sh` |
| `saas` | Multi-tenancy overlay, GDPR Agent, Billing Agent | 📋 Planned — Phase 6 |
| `fintech` | Audit Trail Agent, PCI-DSS overlay, SOC2 overlay | 📋 Planned — Phase 6 |
| `ml` | Model Card Agent, Data Lineage Agent, Bias Review overlay | 📋 Planned — Phase 6 |

---

## The Closed-Loop SDLC Vision

When all phases are complete, the lights-out software factory loop:

```
GitHub Issue created
        ↓
Triage Agent → labels, routes, requests clarifying info
        ↓
BA Agent → spec.md (Template A / B / domain-specific variant)
        ↓
Architect Agent → cross-spec consistency check + ADR if triggered
        ↓
Dev Agent → plan.md → tasks.md → TDD implementation → PR opened
        ↓  (all run in parallel on PR)
  QA Agent         → tests, coverage, SLO, mutation score
  Reviewer Agent   → spec compliance, API contract, migration checklist
  Security Agent   → OWASP, dep scan, secrets scan
  Docs Agent       → README, API ref, inline comment updates
        ↓  (all gates pass)
Merge to main
        ↓
Release Agent → semver bump, CHANGELOG, GitHub Release, version tag
DevOps Agent  → ring deploy (canary → pilot → full), infracost gate
        ↓
Production
        ↓
Observability alert → GitHub Issue auto-created → Triage Agent picks up
        ↓  (loop closes)

Periodic (scheduled):
  Tech-Debt Agent  → monthly health report + chore issues
  Architect Agent  → constitution review every 10 merged features
  Incident Agent   → triggered by `incident` label on any issue
```

---

## What "Best in the World" Looks Like

| Dimension | Phase 1–2 (current) | Phase 3–4 (target) |
|-----------|--------------------|--------------------|
| SDLC loop | Ends at merge | Ends at production alert → new issue (fully closed) |
| Release lifecycle | Manual | Release Agent: semver, CHANGELOG, GitHub Release |
| Documentation | Manual, drifts | Docs Agent: README, API ref, inline comments on every merge |
| Tech debt | Silent accumulation | Tech-Debt Agent: monthly report, complexity gate |
| API contracts | Manual review | Automated breaking-change detection (openapi-diff, buf, graphql-inspector) |
| Mutation testing | Coverage % only | Mutation score gate (Stryker / mutmut / cargo-mutants) |
| Cross-spec consistency | None | Architect Agent scans all prior specs before implementation |
| Constitution health | Write-once, never reviewed | Architect Agent reviews every 10 features |
| Domain extensibility | Industrial pack hardcoded in core | Pluggable domain packs via `--domain=` flag |
| Spec lint in CI | Not checked | Spec section presence validated in quality-check.sh |
| Markdown links | Silently broken | Link validator in CI catches broken refs on every PR |
| Cost estimation | Documented policy only | `infracost diff` wired into CI, mapped to COST-BLOCKER/WARN |
| Observability loop | Deploy is the end | Alerts auto-create Issues; Triage Agent routes them |

---

## How to Contribute an Enhancement

1. Open a GitHub Issue using the Feature Request template
2. Reference this document and the specific gap number (e.g. "Gap 21 — Release Agent")
3. The Triage Agent will label it; the BA Agent will spec it
4. Follow the [CONTRIBUTING.md](CONTRIBUTING.md) agent enhancement workflow

### Gap 1 — No OT-aware agents

The current agents are software-only. Dark factory projects have a second
plane of systems — PLCs, SCADA, historians — that need structured review.

**Proposed**: `OT Integration Agent` — reviews code at the IT/OT boundary:
OPC-UA adapters, MQTT pipelines, Modbus drivers. Checks protocol security,
data fidelity, and edge-cloud synchronisation.

**Proposed**: `Digital Twin Agent` — ensures the simulation model stays
consistent with production code. Detects drift between the physical model
schema and the historian schema.

**Proposed**: `Compliance Agent` — reviews PRs for IEC 62443, ISA-95, and
functional safety (IEC 61508/SIL) compliance markers. Flags safety-critical
paths that need independent human review.

---

### Gap 2 — No real-time / performance agent

No agent currently enforces latency SLOs from the constitution.

**Proposed**: Extend the QA Agent with a `## Performance Test Checklist`
section — if the spec contains a latency SLO (e.g., `< 80ms`), the QA Agent
must verify a benchmark test exists and passes CI.

**Status**: Ready to implement — open a GitHub Issue.

---

### Gap 3 — No data pipeline / historian spec template

The BA Agent's spec template is UI/API-biased. Dark factory features often
involve time-series pipelines, not user-facing functions.

**Proposed**: Add an alternative spec section variant in `ba-product-agent.md`:

```
## Data Pipeline Requirements (use instead of User Stories for pipeline features)
- Source: [OT device / historian / message broker]
- Sink: [cloud DB / dashboard / alert engine]
- Schema: [data model for the message/record]
- Throughput: [messages/sec at steady state]
- Latency SLO: [max acceptable end-to-end delay]
- Backpressure behaviour: [what happens if sink is slow?]
- Data retention: [how long is data kept at each stage?]
```

**Status**: Ready to implement — open a GitHub Issue.

---

### Gap 4 — No edge deployment workflow

`init.sh` sets up cloud CI/CD but has no edge-device deployment pattern.

**Proposed**: Add to DevOps Agent a `## Edge Deployment Checklist`:
- [ ] OTA update signed and verified
- [ ] Rollback procedure documented
- [ ] Health check endpoint on edge device
- [ ] Offline-mode behaviour tested (cloud disconnected)
- [ ] Resource limits (CPU/RAM) set in container manifest

And a `templates/github/workflows/agent-edge-deploy.yml` example workflow.

**Status**: Medium effort — open a GitHub Issue.

---

### Gap 5 — No simulation / digital twin test harness

The current test strategy assumes software-only integration tests. Dark
factory regression testing needs a simulation layer.

**Proposed**: Document in `DARK_FACTORY_GUIDE.md` how to wire a digital twin
(e.g., AWS IoT TwinMaker, Azure Digital Twins, or custom) into the CI
`simulation-test` stage. Provide a template `docker-compose.sim.yml` for
local simulation.

**Status**: Documentation only — low effort.

---

### Gap 6 — No incident / post-mortem workflow

When an automated line goes down, there is no agent-driven incident response
or post-mortem spec workflow.

**Proposed**: `Incident Agent` — triggered by a GitHub Issue labeled
`incident`. Guides the team through:
1. Immediate mitigation checklist
2. Root cause analysis structure
3. Post-mortem document generation
4. Follow-up action items as GitHub Issues

**Status**: New agent — high effort; requires spec and `@architect-agent` review.

---

### Gap 7 — No multi-site / multi-tenant guidance

A dark factory platform often manages multiple factory sites.

**Proposed**: Add a section to `DARK_FACTORY_GUIDE.md`:
- Multi-tenant data isolation patterns
- Site-specific configuration management (feature flags per site)
- Cross-site aggregation and comparison analytics
- Deployment ring model: canary site → pilot site → all sites

**Status**: Documentation — medium effort.

---

## Gap Analysis: General Agent Stack

### Gap 8 — No dependency update agent

No agent handles automated dependency updates (Dependabot / Renovate review).

**Proposed**: Extend the Security Agent with a `## Dependency Update Review`
section — when a Dependabot/Renovate PR arrives, the Security Agent verifies
the update does not introduce breaking changes or new CVEs.

**Status**: Small addition to `security-agent.md` — low effort.

---

### Gap 9 — No database migration agent

Database migrations are high-risk. No agent currently specialises in reviewing
migration scripts.

**Proposed**: Extend the Reviewer Agent's migration checklist (already present)
with:
- [ ] Migration is reversible (down migration exists)
- [ ] Migration tested against a production-size dataset in staging
- [ ] No table locks that would cause downtime on large tables
- [ ] Foreign key constraints not violated by migration order
- [ ] Migration idempotent (safe to re-run)

**Status**: Small addition to `reviewer-agent.md` — low effort.

---

### Gap 10 — No spec quality scoring

The BA Agent produces specs but there is no automated quality check on them.

**Proposed**: Add a `/speckit-checklist` step to the BA Agent's handoff —
run the spec through the speckit checklist before the Developer Agent picks
it up. The checklist verifies:
- All required sections present
- No `TODO` items remaining
- At least 2 acceptance scenarios per user story
- Success criteria are measurable

**Status**: BA Agent update — low effort.

---

### Gap 11 — No onboarding agent / wizard

New team members have no guided onboarding path through the stack.

**Proposed**: Add a `/onboard` skill that walks a new developer through:
1. Reading the constitution
2. Picking up their first issue
3. Using the BA Agent to understand the spec
4. First commit with the Developer Agent

**Status**: New skill — medium effort.

---

### Gap 12 — No cost monitoring agent

The DevOps Agent mentions cost but there is no agent that actively monitors
spend against the constitution's budget limit.

**Proposed**: Add a `## Cost Gate` section to the DevOps Agent — on deploy,
compare current cloud spend projection against the constitution budget. Block
deploys if projected monthly spend exceeds limit by > 20%.

**Status**: DevOps Agent update — medium effort (requires cloud cost API access).

---

## Prioritised Roadmap

### ✅ Implemented — Priority 1 (Quick wins)

| # | Enhancement | Status |
|---|-------------|--------|
| 1 | QA Agent: performance test checklist | ✅ Done |
| 2 | BA Agent: data pipeline spec template | ✅ Done |
| 3 | Reviewer Agent: migration checklist additions | ✅ Done |
| 4 | Security Agent: dependency update review section | ✅ Done |
| 5 | DARK_FACTORY_GUIDE: simulation test harness | ✅ Done |
| 10 | BA Agent: `/speckit-checklist` quality gate at handoff | ✅ Done |

### ✅ Implemented — Priority 2 (Medium effort)

| # | Enhancement | Status |
|---|-------------|--------|
| 6 | DevOps Agent: edge deployment checklist | ✅ Done |
| 7 | DARK_FACTORY_GUIDE: multi-site guidance | ✅ Done |
| 8 | Onboarding skill (`/onboard`) | ✅ Done |
| 9 | DevOps Agent: cost gate (COST-BLOCKER / COST-WARN) | ✅ Done |

### ✅ Implemented — Priority 3 (New agents)

| # | Enhancement | Status |
|---|-------------|--------|
| 10 | OT Integration Agent | ✅ Done |
| 11 | Digital Twin Agent | ✅ Done |
| 12 | Compliance Agent (IEC 62443 / ISA-95 / SIL) | ✅ Done |
| 13 | Incident Agent | ✅ Done |

### Next Horizon — Future Enhancements

These are not yet implemented but are the natural next step:

| # | Enhancement | Effort | Notes |
|---|-------------|--------|-------|
| 14 | Spec lint gate in quality-check.sh (validate spec sections present) | S | Add to `quality-check.sh` |
| 15 | Markdown link validator in CI | S | Catch broken cross-doc links |
| 16 | `infracost` integration in DevOps Agent | M | Automate cost estimation in PRs |
| 17 | DTDL / RDF schema validator for Digital Twin Agent | M | Automated schema diff tool |
| 18 | OPC-UA endpoint security scanner | M | Automated `SecurityMode=None` detection |
| 19 | Incident severity auto-classification from issue body | M | NLP-based SEV-1/2/3 detection |
| 20 | Deployment ring model enforcement in DevOps Agent | M | Block full-fleet deploy without canary soak |

---

## How to Contribute an Enhancement

1. Open a GitHub Issue using the Feature Request template
2. Reference this document and the specific gap number
3. The Triage Agent will label it; the BA Agent will spec it
4. Follow the [CONTRIBUTING.md](CONTRIBUTING.md) agent enhancement workflow
