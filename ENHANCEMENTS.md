# Enhancements & Deep Analysis

> What would make this the **best agentic dev stack in the world** for dark
> factory projects? This document captures the gap analysis, proposed enhancements,
> and a prioritised roadmap.

---

## Current State Summary

The stack delivers:
- **12 agents** — 8 universal software agents + 4 dark factory domain agents (OT Integration, Digital Twin, Compliance, Incident)
- **13 skills** — 8 agent activation wrappers + `/onboard` wizard + 4 dark factory agent wrappers
- **18 GitHub Actions workflows** — 9 Claude + 9 Copilot
- Full Claude Code + GitHub Copilot parity
- Spec-driven workflow (BA → Dev → QA → Review → Security → Architect → domain agents)
- BA Agent: user-facing AND data pipeline spec templates; `/speckit-checklist` quality gate at handoff
- QA Agent: performance/latency SLO gate
- Reviewer Agent: comprehensive migration checklist (reversible, idempotent, lock-free, zero-downtime strategy)
- Security Agent: OWASP + dependency update review (Dependabot/Renovate PRs)
- DevOps Agent: edge deployment checklist + cost gate with COST-BLOCKER/COST-WARN labels
- Brownfield conflict detection and gradual rollout
- Dark factory guide: simulation test harness (docker-compose.sim.yml + CI stage) + multi-site architecture guidance
- Quality gates CI on the library itself (11 gates, now covers 12 agents + 13 skills + 18 workflows)

---

## Gap Analysis: Dark Factory Domain

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

---

## What "Best in the World" Looks Like

| Dimension | Was | Now |
|-----------|-----|-----|
| Agent coverage | 8 IT software agents | 12 agents: IT + OT boundary + compliance + digital twin + incident |
| Real-time enforcement | Manual (constitution) | QA Agent performance gate blocks if SLO benchmark missing |
| Safety coverage | Documented policy | Compliance Agent: SIL classification check, human sign-off enforcement |
| Edge deployment | Not addressed | DevOps Agent: signed OTA, offline test, resource limits, ring model |
| Incident response | Not addressed | Incident Agent: 3-phase (mitigation → RCA → post-mortem), follow-up issues |
| Multi-site | Not addressed | DARK_FACTORY_GUIDE: isolation patterns, config model, deployment rings |
| Onboarding | INIT.md only | `/onboard` 7-step guided wizard |
| Cost control | Mentioned in constitution | DevOps Agent: COST-BLOCKER at >20% over budget, COST-WARN at 80–100% |
| Spec quality | Agent-enforced sections | BA Agent: `/speckit-checklist` required at handoff; 2 spec templates |
| Data pipeline specs | UI/API-biased template | Template B: source, sink, schema, throughput, latency SLO, backpressure |
| Dependency updates | Manual | Security Agent: Dependabot/Renovate PR review checklist |
| DB migrations | Basic checklist | Reviewer Agent: reversible, idempotent, lock-free, zero-downtime strategy |
| Simulation testing | Not addressed | DARK_FACTORY_GUIDE: docker-compose.sim.yml + 5 scenarios + CI stage |
| Library CI | 8-agent quality check | 11-gate check covering 12 agents + 13 skills + 18 workflows |
