# Enhancements & Deep Analysis

> What would make this the **best agentic dev stack in the world** for dark
> factory projects? This document captures the gap analysis, proposed enhancements,
> and a prioritised roadmap.

---

## Current State Summary

The stack is solid in:
- 8 universal agents with zero duplication
- Full Claude Code + GitHub Copilot parity
- Spec-driven workflow (BA → Dev → QA → Review → Security → Architect)
- Brownfield conflict detection and gradual rollout
- Dark factory constitution template and domain guide
- Quality gates CI on the library itself

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

### Priority 1 — Quick wins (1–3 issues, low effort)

| # | Enhancement | Effort | Opens as |
|---|-------------|--------|----------|
| 1 | QA Agent: performance test checklist | S | GitHub Issue |
| 2 | BA Agent: data pipeline spec template | S | GitHub Issue |
| 3 | Reviewer Agent: migration checklist additions | S | GitHub Issue |
| 4 | Security Agent: dependency update review section | S | GitHub Issue |
| 5 | DARK_FACTORY_GUIDE: simulation test harness docs | S | GitHub Issue |

### Priority 2 — Medium effort (1–2 sprints)

| # | Enhancement | Effort | Opens as |
|---|-------------|--------|----------|
| 6 | DevOps Agent: edge deployment checklist | M | GitHub Issue |
| 7 | DARK_FACTORY_GUIDE: multi-site guidance | M | GitHub Issue |
| 8 | Onboarding skill (`/onboard`) | M | GitHub Issue |
| 9 | DevOps Agent: cost gate | M | GitHub Issue |

### Priority 3 — Significant features (spec required)

| # | Enhancement | Effort | Opens as |
|---|-------------|--------|----------|
| 10 | OT Integration Agent (new agent) | L | BA Agent spec → Issue |
| 11 | Digital Twin Agent (new agent) | L | BA Agent spec → Issue |
| 12 | Compliance Agent (new agent, IEC 62443 / SIL) | L | BA Agent spec → Issue |
| 13 | Incident Agent (new agent) | L | BA Agent spec → Issue |

---

## How to Contribute an Enhancement

1. Open a GitHub Issue using the Feature Request template
2. Reference this document and the specific gap number
3. The Triage Agent will label it; the BA Agent will spec it
4. Follow the [CONTRIBUTING.md](CONTRIBUTING.md) agent enhancement workflow

---

## What "Best in the World" Looks Like

The target state for this stack in the context of dark factory projects:

| Dimension | Current | Target |
|-----------|---------|--------|
| Agent coverage | IT software only | IT + OT boundary + compliance + digital twin |
| Real-time enforcement | Manual (constitution) | Automated benchmark gate in QA Agent |
| Safety coverage | Documented policy | Compliance Agent with SIL classification check |
| Edge deployment | Not addressed | Signed OTA workflow + offline test harness |
| Incident response | Not addressed | Incident Agent with post-mortem spec generation |
| Multi-site | Not addressed | Multi-tenant guidance + deployment ring model |
| Onboarding | INIT.md only | `/onboard` guided wizard |
| Cost control | Mentioned in constitution | Active cost gate in DevOps Agent |
| Spec quality | Agent-enforced sections | Automated `/speckit-checklist` quality score |
| Library CI | 11-gate quality check | Quality check + spec lint + markdown validation |
