# Dark Factory Project Guide

How to start a **dark factory** (lights-out / fully automated manufacturing)
project from zero using the Agentic Dev Stack.

> **Dark factory** = a manufacturing facility that operates autonomously with
> minimal or no human presence on the floor — controlled by software, robotics,
> and AI, with humans in supervisory roles only.

---

## What Makes a Dark Factory Project Different

Before initializing the stack, understand the domain constraints that must be
reflected in your project constitution:

| Concern | Dark Factory Implication |
|---------|--------------------------|
| **Real-time** | Control loops may require deterministic sub-100ms response |
| **Safety** | Functional safety (IEC 61508 / SIL levels) may apply to certain subsystems |
| **OT/IT boundary** | Operational Technology (PLCs, SCADA, historians) lives in a separate network zone |
| **Protocols** | IIoT: MQTT, OPC-UA, Modbus, PROFINET, EtherNet/IP rather than HTTP REST |
| **Compliance** | IEC 62443 (industrial cybersecurity), ISA-95 (MES/ERP integration), ISA-88 (batch) |
| **Availability** | Manufacturing lines typically require 99.9 %+ uptime — zero-downtime deployments |
| **Data volume** | Historian data: millions of time-series data points per day per line |
| **Edge computing** | Processing at the machine level before cloud aggregation |
| **Digital twin** | Simulation model must stay in sync with physical asset state |

---

## Step 1: Greenfield Initialization

```zsh
# 1. Create the project directory
mkdir -p ~/projects/dark-factory && cd ~/projects/dark-factory

# 2. Initialize git
git init && git remote add origin <your-github-repo-url>

# 3. Initialize the Agentic Dev Stack
bash /path/to/agentic-dev-stack/scripts/init.sh --ai=both   # recommended
# or --ai=claude / --ai=copilot for single-mode

# 4. Initialize github-speckit
npx github-speckit@latest
# Answers: claude (or copilot) / sequential / CLAUDE.md / sh
```

---

## Step 2: Write the Dark Factory Constitution

Run `/speckit-constitution` and fill each section with dark-factory-specific
answers. Use the reference values below as a starting point — adjust to your
actual system.

### Reference Constitution for Dark Factory Projects

```markdown
# Project Constitution

## Project Vision
[System name] is a dark factory management platform that [controls / monitors /
orchestrates] [describe your physical process — e.g. "an automated PCB assembly
line"] with minimal human intervention. Target: [N] concurrent production lines,
[N] shifts/day, [uptime target]% availability.

## Technology Stack
- **Primary language**: [Python 3.12 / Go 1.22 / Rust / TypeScript]
- **Real-time layer**: [ROS 2 / custom C++ / Rust embedded]
- **IIoT messaging**: MQTT (broker: [Mosquitto / EMQX / HiveMQ]) + OPC-UA server
- **Time-series DB**: [TimescaleDB / InfluxDB / OSIsoft PI]
- **Process DB**: [PostgreSQL / CockroachDB]
- **Edge runtime**: [Docker + k3s / AWS Greengrass / Azure IoT Edge]
- **Cloud platform**: [AWS / Azure / GCP]
- **CI/CD**: GitHub Actions
- **Container registry**: [ECR / ACR / GCR]

## Quality Standards
- Unit test coverage: ≥ 85% for business logic; ≥ 90% for safety-critical paths
- Integration tests: required for every OT protocol adapter
- Performance tests: required for any control loop or real-time path
- Static analysis: [ruff / golangci-lint / clippy] must pass with zero errors
- No `TODO` or `FIXME` comments in merged code — they become issues

## Real-Time and Reliability Constraints
- Control loop latency budget: [define per subsystem — e.g. "vision inspection < 50ms"]
- Any path with a latency SLO must have a benchmark test (fails CI if regressed)
- All external I/O (OT devices, cloud APIs) must have timeout and circuit-breaker logic
- Graceful degradation: if cloud connectivity is lost, edge must continue operating

## Functional Safety
- Safety Integrity Level (SIL) classification per subsystem:
  - [Subsystem A]: SIL [1/2/3] — governed by [IEC 61508 / IEC 62061]
  - [Subsystem B]: SIL 0 — no formal safety function
- SIL ≥ 1 code paths: require independent review and must not be modified by agents
  without explicit human sign-off (flag in PR as SAFETY-CRITICAL)
- Emergency stop (E-stop) logic is NEVER auto-generated — human-authored only

## OT/IT Boundary Rules
- All OT-side code (PLC ladder, function blocks, SCADA scripts) lives in `ot/`
  and is outside agent auto-generation scope — agents review but do not write
- The IT/OT DMZ is the only crossing point; no agent may propose direct IT→OT
  network access without an approved ADR
- OPC-UA security mode: `SignAndEncrypt` — never `None` in production

## Security
- IEC 62443 zone-and-conduit model governs network segmentation (see `docs/security/zones.md`)
- All device credentials stored in [Vault / AWS Secrets Manager / Azure Key Vault]
- No plaintext credentials anywhere, including in OT configuration files
- All MQTT traffic uses TLS 1.2+ with mutual TLS (mTLS) in production
- Firmware signing required for all edge device OTA updates

## Data and Privacy
- Machine sensor data: not personally identifiable — no GDPR restrictions
- Operator audit logs: retained 7 years (regulatory requirement)
- Any video/image from vision systems: [define retention and access policy]

## Environments
- `dev` — local developer machines and GitHub Actions ephemeral runners
- `staging` — dedicated rack or cloud namespace mirroring production topology
- `production` — live factory floor; deployments require [define approval process]

## Cost
- Monthly cloud spend budget: [€/$ amount]
- Alert at 80% of monthly budget

## Agent Roles
- All 8 standard agents active
- See [DARK_FACTORY_GUIDE.md](DARK_FACTORY_GUIDE.md) for domain-specific agent extensions
```

---

## Step 3: Repository Structure for a Dark Factory Project

```
dark-factory/
│
├── specs/                         ← BA Agent specs (NNN-slug/spec.md)
├── docs/
│   ├── architecture/
│   │   ├── adr-001-ot-it-boundary.md
│   │   ├── adr-002-iiot-protocol-choice.md
│   │   └── adr-003-timeseries-storage.md
│   └── security/
│       └── zones.md               ← IEC 62443 zone model
│
├── ot/                            ← OT-side code (PLC, SCADA) — agent-review only
│   ├── plc/
│   └── scada/
│
├── edge/                          ← Edge runtime (runs on-premises gateway)
│   ├── adapters/
│   │   ├── opcua/                 ← OPC-UA adapter
│   │   ├── mqtt/                  ← MQTT publisher/subscriber
│   │   └── modbus/                ← Modbus TCP adapter
│   ├── processors/                ← Local stream processing
│   └── Dockerfile
│
├── services/                      ← Cloud-side microservices
│   ├── historian-api/             ← Time-series query API
│   ├── mes-gateway/               ← MES integration
│   ├── digital-twin/              ← Asset state synchronization
│   └── alert-engine/              ← Anomaly detection + alerting
│
├── infra/                         ← IaC (Terraform / Pulumi / CDK)
│   ├── edge/                      ← k3s, Greengrass, or IoT Edge manifests
│   └── cloud/                     ← Cloud resource definitions
│
├── tests/
│   ├── unit/
│   ├── integration/               ← Tests against real/simulated OT endpoints
│   ├── performance/               ← Latency benchmarks for control loops
│   └── simulation/                ← Digital twin based regression tests
│
└── .specify/
    └── memory/
        └── constitution.md
```

---

## Step 4: First Feature Workflow (Dark Factory)

### Example: Vision Inspection System

**Issue #1 opened**: "Add vision-based solder joint inspection on line 3"

```
/ba-agent Add machine vision inspection for solder joints on PCB line 3
```

The BA Agent writes `specs/001-vision-inspection/spec.md`. Key sections for dark
factory features:

- **User Stories** — operators are the primary users; the "system" is also an actor
- **Acceptance Scenarios** — include failure mode scenarios (conveyor jam, camera
  offline, poor lighting) — not just happy path
- **Real-Time Requirements** — latency SLO must appear in the spec, not just the
  constitution (e.g. "inspection result must be available within 80ms of trigger")
- **Safety Considerations** — does this feature have a safety function?
  If yes, what is the SIL classification?
- **OT/IT Boundary** — what data crosses the boundary, in which direction, and how?

```
/dev-agent Implement the spec at specs/001-vision-inspection/spec.md
```

The Developer Agent will check the constitution and raise an **ARCH-BLOCKER** if
the spec calls for direct PLC writes without an approved ADR.

---

## Step 5: Domain-Specific ADRs to Write First

Before any feature work, write these foundational ADRs:

```
/architect-agent Write ADR: OT/IT boundary and data flow architecture
/architect-agent Write ADR: IIoT protocol selection (MQTT vs OPC-UA vs both)
/architect-agent Write ADR: Time-series storage technology choice
/architect-agent Write ADR: Edge vs. cloud processing split for real-time paths
/architect-agent Write ADR: Deployment and OTA update strategy for edge devices
```

Store at `docs/architecture/adr-NNN-<slug>.md`.

---

## Step 6: CI/CD for Dark Factory

Dark factory CI pipelines need more stages than typical software:

```yaml
# Recommended pipeline stages for dark factory projects
stages:
  - lint              # Static analysis, type checking
  - unit-test         # Fast, no I/O
  - integration-test  # Against simulated OT endpoints (Docker Compose)
  - performance-test  # Latency benchmarks — fail if SLO regressed
  - security-scan     # OWASP + IEC 62443 relevant checks
  - build-edge        # Build edge container image
  - build-cloud       # Build cloud service images
  - staging-deploy    # Deploy to staging environment
  - simulation-test   # Digital twin regression tests (if available)
  - production-deploy # Manual approval gate for production
```

Ask the DevOps Agent to generate this pipeline:
```
/devops-agent Create CI/CD pipeline for dark factory project with edge and cloud stages
```

---

## Step 7: Security for Dark Factory

The Security Agent's standard OWASP checklist applies to IT-side code. For
OT-side security, also review against:

- **IEC 62443-3-3** (system security requirements)
- **IEC 62443-4-2** (component security requirements)

Add these to the constitution's security section. The Security Agent will include
them in its review checklist when it reads the constitution.

OT-specific items to add to the Security Review:

```
- [ ] OPC-UA endpoints: security mode is SignAndEncrypt (never None)
- [ ] MQTT: TLS 1.2+ with mTLS; no anonymous connections
- [ ] All device credentials in secret manager (not embedded in firmware/config)
- [ ] Network segmentation: IT/OT DMZ in place per zone model
- [ ] Firmware signing: OTA updates signed and verified before installation
- [ ] Audit log: all operator commands to physical actuators are logged
```

---

## Step 8: Monitoring and Observability

Dark factories require two layers of observability:

| Layer | What to monitor | Tools |
|-------|----------------|-------|
| **IT layer** | Service health, API latency, error rates, queue depths | Prometheus + Grafana / CloudWatch / Azure Monitor |
| **OT layer** | Machine uptime, cycle time, OEE, sensor drift, alarm frequency | Historian (PI / TimescaleDB) + custom dashboards |
| **Cross-layer** | End-to-end latency (PLC signal → cloud action), data pipeline lag | Custom metrics |

Ask the DevOps Agent:
```
/devops-agent Design observability stack for dark factory with IT and OT layers
```

---

## Checklist: Dark Factory Project Ready to Build

- [ ] `init.sh` run; agents and skills installed
- [ ] `github-speckit` initialized; `.specify/` directory created
- [ ] Dark factory constitution written (Step 2 above)
- [ ] Repository structure created (Step 3 above)
- [ ] 5 foundational ADRs written (Step 5 above)
- [ ] `ANTHROPIC_API_KEY` or Copilot licence active
- [ ] Branch protection enabled on `main`
- [ ] CI pipeline scaffolded by DevOps Agent (Step 6 above)
- [ ] OT/IT zone model documented at `docs/security/zones.md`
- [ ] Team has read this guide and the project constitution
