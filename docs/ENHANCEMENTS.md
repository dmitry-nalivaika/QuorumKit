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

## How to Contribute an Enhancement

1. Open a GitHub Issue using the Feature Request template.
2. Reference this document and describe the enhancement you want to add.
3. The Triage Agent will label it; the BA Agent will spec it.
4. Follow the [CONTRIBUTING.md](../CONTRIBUTING.md) agent enhancement workflow.
