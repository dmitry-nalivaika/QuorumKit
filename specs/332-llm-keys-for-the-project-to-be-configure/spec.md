# Spec: LLM Keys for the Project to Be Configured — Issue #332

## Overview
Maintainers need agentic workflows to run on a predictable, maintainer-chosen LLM
provider — specifically their own Azure AI Foundry (Azure OpenAI) resource —
instead of always sharing the project's default provider, and need the ability
to pick a specific model per agent so that high-frequency/low-stakes agents can
use a cheaper model while high-stakes agents use a stronger one.

## User Stories

### US-1: Configure a dedicated LLM provider for my project
As a project maintainer, I want to register my own Azure AI Foundry (Azure
OpenAI) endpoint and API key as an LLM provider for my project, so that my
agents run on infrastructure I control and pay for, rather than a shared
default.

Acceptance Scenarios:
- Given a project with no Azure provider configured, When the maintainer adds a
  named Azure AI Foundry provider entry with its endpoint, model deployment,
  and a reference to a stored credential, Then agents assigned to that provider
  use it for all future runs.
- Given a maintainer configures a provider referencing a credential that does
  not exist or is invalid, When an agent run tries to use that provider, Then
  the run fails with a clear, visible error identifying the missing/invalid
  credential — it does not fall back to another provider.

### US-2: Assign a specific model per agent for cost control
As a project maintainer, I want to choose which configured LLM provider/model
each individual agent uses, so that I can balance cost against capability
(e.g. cheaper model for triage/docs, stronger model for architecture/security/
dev work).

Acceptance Scenarios:
- Given two or more LLM providers are configured (e.g. one cheaper, one
  stronger), When the maintainer assigns a specific provider to an agent, Then
  that agent uses the assigned provider on every subsequent run.
- Given an agent has no explicit provider assignment, When that agent runs,
  Then it uses the project's single default provider.

### US-3: Predictable behaviour — no silent fallback
As a project maintainer, I want agent runs to fail visibly rather than silently
switching providers when my configured provider is unavailable, so that I
always know exactly which provider produced (or failed to produce) a result.

Acceptance Scenarios:
- Given the configured Azure provider is temporarily unreachable, When an agent
  assigned to it runs, Then the run reports a visible failure referencing that
  provider, and no other provider is silently substituted.

### US-4: Understand how to set this up
As a project maintainer, I want documentation that explains how to configure an
Azure AI Foundry provider and how to map agents to cost tiers, so that I can
set this up without guessing at undocumented configuration.

Acceptance Scenarios:
- Given the documentation, When a maintainer follows it end-to-end, Then they
  can configure a working Azure provider and assign it to at least one agent
  without needing to read source code.

## Functional Requirements
- FR-001: The system MUST allow a maintainer to define a named LLM provider
  entry scoped to their own project, specifying at minimum an endpoint, a
  model/deployment identifier, and a reference to a securely-stored credential
  (never the credential value itself).
- FR-002: The system MUST support Azure AI Foundry (Azure OpenAI) as a
  selectable LLM provider type, in addition to the existing default provider.
- FR-003: The system MUST allow a maintainer to assign a specific configured
  provider to an individual agent, independent of the project-wide default.
- FR-004: When an agent has no explicit provider assignment, the system MUST
  use the project's single configured default provider.
- FR-005: When a configured provider's credential is missing, invalid, or the
  provider is unreachable, the system MUST fail that agent run visibly and
  MUST NOT silently substitute a different provider.
- FR-006: The system MUST allow multiple Azure AI Foundry provider entries to
  coexist within one project (e.g. a cheaper and a stronger model), so
  different agents can be assigned different cost/capability tiers.
- FR-007: Configuring or changing a provider assignment MUST NOT require any
  code change — only configuration.
- FR-008: Projects that have not configured an Azure (or other new) provider
  MUST continue to run exactly as before, with no behaviour change to their
  existing default provider.
- FR-009: Documentation MUST describe how to obtain and configure Azure AI
  Foundry credentials, how to register a provider, and how to assign agents to
  cost tiers.

## Success Criteria
- [ ] A maintainer can configure at least one Azure AI Foundry provider and
      assign it to at least one agent using only configuration (no code
      change).
- [ ] Two agents can be simultaneously configured to use two different model
      tiers (e.g. cheaper vs. stronger) within the same project.
- [ ] Simulating an unreachable/invalid Azure provider produces a visible run
      failure referencing that provider, with no silent fallback to another
      provider.
- [ ] A project with no Azure provider configured continues to run unaffected.
- [ ] Documentation is published describing setup and per-agent cost-tier
      mapping.

## Key Entities
- LLM Provider: A named, project-scoped configuration entry describing where
  and how to reach an LLM (endpoint, model/deployment, credential reference).
  Multiple providers can exist per project.
- Agent-to-Provider Assignment: A mapping from an individual agent to the
  specific LLM Provider it should use; falls back to the project default when
  unset.
- Credential Reference: A named pointer to a securely stored secret (never the
  secret value itself), resolved at run time.

## Out of Scope
- Tracking, reporting, or displaying actual per-agent token usage or spend
  (cost telemetry/dashboard).
- Azure Active Directory / managed-identity authentication (API-key-based
  credential only).
- Any LLM provider type other than Azure AI Foundry/Azure OpenAI (e.g. AWS
  Bedrock, local/Ollama models).
- Automatic recommendation of which model tier an agent "should" use — the
  maintainer decides.

## Security and Privacy Considerations
Credentials are referenced by name only and resolved from the hosting
environment's secret store at run time; no credential value is ever committed
to the repository. This project handles no PII (Constitution: Security and
Privacy Constraints) — standard open-source data classification applies. Any
change to workflow permissions or credential handling requires Security Agent
review per the constitution.

## Assumptions
- The maintainer already has (or will provision) an Azure subscription with
  Azure AI Foundry access and at least one model deployment, as stated in the
  issue.
- API-key authentication is an acceptable default; AAD/managed-identity is a
  future enhancement, not required for this feature.
- "Per project" means per repository that consumes this package, consistent
  with existing per-project configuration conventions.

## Open Questions
None — resolved prior to handoff.
