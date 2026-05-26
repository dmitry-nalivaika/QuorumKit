# Enhancements & Roadmap

QuorumKit is designed to be **the best agentic development stack for fully
automated, lights-out software delivery** — a closed loop where AI agents carry
a GitHub Issue all the way to a merged, deployed, documented, and monitored
feature with zero human intervention on the execution path.

The system model is called the **Dark Factory**: the software factory runs
itself. The loop is: Triage → Spec → Plan → Implement → Test → Review →
Security → Merge → Deploy → Monitor → Feedback → new Issue. Humans set
strategy, approve escalations, and sign off on safety-critical changes. Agents
handle all execution.

Domain-specific knowledge (industrial/IoT, SaaS, fintech, ML) is packaged as
**opt-in domain extension packs** that overlay the universal agents with
domain-specific requirement templates, review checklists, and compliance rules
— without touching the universal core.

---

## Domain Extension Pack Model

QuorumKit ships **universal agents** suitable for any software project. Domain
extension packs layer domain-specific behaviour on top without duplicating
universal logic.

```
Core Stack (always installed)
└── Universal Agents: BA, Dev, QA, Reviewer, Architect, DevOps,
                      Security, Triage, Release, Docs, Tech-Debt

Domain Extension Packs (opt-in: bash init.sh --domain=<pack>)
├── industrial/  — OT Integration, Digital Twin, Compliance, Incident agents
├── saas/        — Multi-tenancy overlay, GDPR Agent, Billing Agent (planned)
├── fintech/     — Audit Trail Agent, PCI-DSS overlay, SOC2 overlay (planned)
└── ml/          — Model Card Agent, Data Lineage Agent, Bias Review (planned)
```

Domain packs **extend** universal agents by adding spec template variants and
Reviewer checklist sections. They **add** new agents only where the domain
genuinely requires a unique workflow. They never duplicate universal agent
logic.

---

## Current Capabilities

| Capability | Detail |
|---|---|
| **Agents** | 15 total: 11 universal core + 4 industrial domain (opt-in) |
| **Skills** | 16 total: 11 universal + 4 industrial + `/onboard` wizard |
| **Workflows** | 25 GitHub Actions: 12 Claude + 12 Copilot + `alert-to-issue` webhook |
| **AI runtimes** | Full Claude Code + GitHub Copilot parity |
| **SDLC coverage** | Fully closed loop: Issue → Spec → Plan → TDD → PR gates → Merge → Release → Deploy → Monitor → Issue |
| **Quality gates** | 12 CI gates covering all 15 agents, 16 skills, and 25 workflows |

### Agent capabilities at a glance

| Agent | Key capabilities |
|---|---|
| **BA Agent** | User-facing spec (Template A) and data pipeline spec (Template B); `/speckit-checklist` handoff gate |
| **QA Agent** | Coverage gate, latency SLO gate, mutation testing gate |
| **Reviewer Agent** | Spec compliance, migration checklist, API contract governance (openapi-diff, buf, graphql-inspector) |
| **Security Agent** | OWASP Top 10, dependency update review (Dependabot/Renovate) |
| **DevOps Agent** | CI/CD, ring deployment gate, infracost integration, observability feedback loop |
| **Architect Agent** | ADR authoring, cross-spec consistency check, constitution evolution review |
| **Release Agent** | Conventional commits → semver bump → CHANGELOG → GitHub Release |
| **Docs Agent** | README, API reference, inline comments, architecture doc sync on every merge |
| **Tech-Debt Agent** | Monthly complexity hotspots, dead code detection, dependency freshness, mutation score trend |
| **Industrial pack** | OT Integration (OPC-UA scanner), Digital Twin (schema diff), Compliance (IEC 62443/ISA-95/SIL), Incident (severity auto-classification) |

---

## Roadmap

### ✅ Phase 1 — Core Refactor (complete)

Established all 8 universal agents with formal conventions, NNN-based
traceability, a single source of truth per agent, thin SKILL.md wrappers, and
full Copilot parity.

### ✅ Phase 2 — Enhancements 1–13 (complete)

| # | Enhancement | Status |
|---|---|---|
| 1 | QA Agent: performance / latency SLO gate | ✅ Done |
| 2 | BA Agent: data pipeline spec template (Template B) | ✅ Done |
| 3 | Reviewer Agent: expanded migration checklist | ✅ Done |
| 4 | Security Agent: dependency update review section | ✅ Done |
| 5 | Industrial guide: simulation test harness + CI stage | ✅ Done |
| 6 | DevOps Agent: edge deployment checklist | ✅ Done |
| 7 | Industrial guide: multi-site architecture guidance | ✅ Done |
| 8 | Onboarding skill (`/onboard`) | ✅ Done |
| 9 | DevOps Agent: cost gate (`COST-BLOCKER` / `COST-WARN`) | ✅ Done |
| 10 | BA Agent: `/speckit-checklist` required at handoff | ✅ Done |
| 11 | OT Integration Agent (industrial domain pack) | ✅ Done |
| 12 | Digital Twin Agent (industrial domain pack) | ✅ Done |
| 13 | Compliance Agent — IEC 62443 / ISA-95 / SIL (industrial) | ✅ Done |

### ✅ Phase 3 — Enhancements 14–20 (complete)

| # | Enhancement | Effort | Status |
|---|---|---|---|
| 14 | Spec lint gate in `quality-check.sh` | S | ✅ Done |
| 15 | Markdown link validator in CI | S | ✅ Done |
| 16 | `infracost` integration section in DevOps Agent | M | ✅ Done |
| 17 | DTDL / RDF schema validator — Digital Twin Agent | M | ✅ Done |
| 18 | OPC-UA endpoint scanner — OT Integration Agent | M | ✅ Done |
| 19 | Incident severity auto-classification | M | ✅ Done |
| 20 | Deployment ring model enforcement gate | M | ✅ Done |

### ✅ Phase 4 — Enhancements 21–28 (complete)

| # | Enhancement | Effort | Status |
|---|---|---|---|
| 21 | **Release Agent** — semver, changelog, GitHub Release automation | L | ✅ Done |
| 22 | **Docs Agent** — README, API reference, inline comment sync | L | ✅ Done |
| 23 | **Tech-Debt Agent** — complexity, churn, dead code, dependency age | M | ✅ Done |
| 24 | API contract governance — Reviewer Agent extension | M | ✅ Done |
| 25 | Observability → Issue feedback loop — DevOps Agent + workflow | M | ✅ Done |
| 26 | Mutation testing gate — QA Agent extension | S | ✅ Done |
| 27 | Cross-spec consistency check — Architect Agent extension | S | ✅ Done |
| 28 | Constitution evolution process — Architect Agent extension | S | ✅ Done |

### ✅ Phase 5 — Domain Extension Pack Model (complete)

| Domain pack | Agents included | Status |
|---|---|---|
| `industrial` | OT Integration, Digital Twin, Compliance, Incident | ✅ Done — activate with `--domain=industrial` in `init.sh` |
| `saas` | Multi-tenancy overlay, GDPR Agent, Billing Agent | 📋 Planned — Phase 6 |
| `fintech` | Audit Trail Agent, PCI-DSS overlay, SOC2 overlay | 📋 Planned — Phase 6 |
| `ml` | Model Card Agent, Data Lineage Agent, Bias Review overlay | 📋 Planned — Phase 6 |

---

## The Closed-Loop SDLC

The complete lights-out delivery loop, from issue creation to production and
back again:

```
GitHub Issue created
        ↓
Triage Agent     → labels, routes, requests clarifying info
        ↓
BA Agent         → spec.md (Template A / B / domain-specific variant)
        ↓
Architect Agent  → cross-spec consistency check + ADR if triggered
        ↓
Dev Agent        → plan.md → tasks.md → TDD implementation → PR opened
        ↓  (parallel PR gates)
  QA Agent         → tests, coverage, SLO, mutation score
  Reviewer Agent   → spec compliance, API contract, migration checklist
  Security Agent   → OWASP, dependency scan, secrets scan
  Docs Agent       → README, API reference, inline comment updates
        ↓  (all gates pass)
Merge to main
        ↓
Release Agent    → semver bump, CHANGELOG, GitHub Release, version tag
DevOps Agent     → ring deploy (canary → pilot → full), infracost gate
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

## Contributing an Enhancement

1. Open a GitHub Issue using the Feature Request template.
2. Reference this document and describe the enhancement.
3. The Triage Agent labels the issue; the BA Agent specs it.
4. Follow the agent enhancement workflow in [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Related Topics

- [README.md](../README.md) — Installation and quick-start guide
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Agent enhancement workflow
- [DARK_FACTORY_GUIDE.md](DARK_FACTORY_GUIDE.md) — Detailed operational guide for the lights-out factory model
- [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) — Agent communication and coordination protocol
- [BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md) — Adopting QuorumKit in an existing project
