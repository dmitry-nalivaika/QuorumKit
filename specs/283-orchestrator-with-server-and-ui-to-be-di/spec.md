# Spec: Orchestrator with Server and UI to Be Distributed Within a Package — Issue #283

## Overview

QuorumKit's orchestrator, dashboard server, and local-pipeline UI are today only usable by cloning or forking the QuorumKit repository itself. This feature packages the orchestrator, the dashboard server, and the dashboard UI as a single versioned, installable unit so that any consumer project can install it via the existing setup script, run its own project-scoped dashboard, and deliver features in parallel locally — without copying or modifying QuorumKit's source.

## User Stories

### US-1: Install the packaged dashboard into a consumer project

As a maintainer of a consumer project,
I want to install the orchestrator, dashboard server, and dashboard UI as a single package using the existing setup script,
so that my team gets a working local dashboard without forking or copying the QuorumKit repository.

Acceptance Scenarios:
- **Given** a consumer repository with no prior QuorumKit installation, **When** the maintainer runs the setup script, **Then** the dashboard server, dashboard UI, and local-pipeline capability are installed and ready to run without any manual file edits.
- **Given** a consumer repository that already has the package installed, **When** the maintainer re-runs the setup script, **Then** the installation is updated safely without overwriting the consumer's own project-specific configuration.

### US-2: Run a project-scoped dashboard with one command

As a developer on a consumer project,
I want to start the dashboard with a single command,
so that I can see my own project's agents, specs, and pipelines without extra configuration.

Acceptance Scenarios:
- **Given** the package is installed in a consumer project, **When** the developer runs the single start command, **Then** the dashboard server starts and serves the dashboard UI.
- **Given** the dashboard is running, **When** the developer opens the dashboard UI, **Then** it displays only the consumer project's own agents, specs, and pipelines — not QuorumKit's internal ones.
- **Given** the dashboard server fails to start (for example, the configured port is already in use), **When** the developer runs the start command, **Then** a clear, actionable error message is shown and the process exits without leaving orphaned background processes.

### US-3: Deliver features in parallel using local pipelines

As a developer on a consumer project,
I want to run the local parallel-pipeline feature from the installed package inside my own project's worktree,
so that I can work on multiple features at the same time without additional manual setup.

Acceptance Scenarios:
- **Given** the package is installed in a consumer project, **When** the developer starts a local pipeline for a feature, **Then** a project-local worktree is created and the pipeline operates correctly within it.
- **Given** two local pipelines are started for two different features, **When** both run concurrently, **Then** each operates independently in its own worktree without interfering with the other.

### US-4: Upgrade the package without losing project configuration

As a maintainer of a consumer project,
I want to upgrade to a newer version of the package,
so that I receive improvements and fixes without losing my project's own configuration or in-progress work.

Acceptance Scenarios:
- **Given** a consumer project has the package installed with existing project-specific configuration, **When** the maintainer upgrades to a newer package version, **Then** the project-specific configuration is preserved and the upgraded dashboard and orchestrator continue to work.
- **Given** an upgrade changes the installed file layout in a breaking way, **When** the maintainer runs the upgrade, **Then** the maintainer is clearly informed that a breaking change occurred and is pointed to migration guidance before the upgrade proceeds.

## Functional Requirements

- **FR-001**: A consumer repository must be able to install the orchestrator, dashboard server, and dashboard UI as a single package by running the existing setup script.
- **FR-002**: The installed package must provide a single command that starts the dashboard server and serves the dashboard UI.
- **FR-003**: The running dashboard must scope all displayed data (agents, specs, pipelines) to the consumer project's own configuration, never to QuorumKit's own internal project data.
- **FR-004**: The local-pipeline capability (creating and managing project-local feature worktrees) must be included in the installed package and must operate correctly within the consumer project's own worktree structure.
- **FR-005**: The package must be independently versioned, and upgrading to a newer version must not remove or overwrite the consumer project's own configuration.
- **FR-006**: All capabilities currently exposed by the dashboard server (viewing agent status, invoking and stopping agents, listing pipelines, triggering and approving pipeline runs, managing local pipelines, receiving pipeline events) must remain fully functional after the package is installed in a consumer project.
- **FR-007**: The packaged dashboard and orchestrator must pass their existing automated test suite without requiring modification to that test suite.
- **FR-008**: Installation and configuration steps for consumer projects must be documented in a form a new maintainer can follow without prior knowledge of QuorumKit's internal structure.
- **FR-009**: If a breaking change to the installed file layout is introduced in a new package version, it must be accompanied by a documented migration guide and a version number change that signals the breaking change.

## Success Criteria

- [ ] A consumer repository with no prior installation can install the package via the setup script and have a working dashboard server and UI without any manual file edits.
- [ ] The dashboard starts with a single command and displays only the consumer project's own agents, specs, and pipelines.
- [ ] Local pipelines can be started, run in parallel, and operate correctly within the consumer project's own worktrees.
- [ ] A consumer project can upgrade to a newer package version and retain its own project-specific configuration.
- [ ] All existing dashboard server capabilities (status, invoke, stop, pipelines, local pipelines, pipeline events) work identically after packaging as they did before.
- [ ] The packaged dashboard and orchestrator pass their existing test suite without modification to that suite.
- [ ] A new maintainer can follow the published installation and configuration documentation to reach a working local dashboard without additional outside help.

## Key Entities

- **Distributable Package**: The versioned bundle containing the orchestrator, dashboard server, and dashboard UI, installable into any consumer repository.
- **Consumer Project**: A repository, distinct from QuorumKit itself, that installs and configures the package for its own use.
- **Dashboard Server**: The always-local process that serves the dashboard UI and exposes the existing status, control, and pipeline endpoints, scoped to the consumer project.
- **Dashboard UI**: The visual interface a developer opens to observe and interact with their own project's agents and pipelines.
- **Local Pipeline**: A project-local feature worktree and its associated lifecycle (start, run, stop, join), used to deliver multiple features in parallel.
- **Project-Specific Configuration**: Settings and data (for example, the consumer's own agents, specs, and pipeline definitions) that must survive package upgrades.
- **Package Version**: The independent version identifier of the distributable package, separate from the consumer project's own versioning.

## Out of Scope

- A hosted or SaaS dashboard — the dashboard remains project-local and single-user.
- Any monorepo conversion or structural change to the QuorumKit repository layout itself.
- Authentication or multi-user access control for the dashboard server.
- Changes to the GitHub Actions orchestrator dispatch logic.
- Migrating existing QuorumKit-native pipelines to the new package structure (to be covered by a separate migration guide).
- Any change to the VS Code dashboard companion extension.

## Security and Privacy Considerations

The dashboard remains a project-local, single-user tool with no authentication or multi-user access control, consistent with the project's constitution. No personally identifiable information is introduced by this feature. Packaging must not introduce any new network-exposed surface beyond the existing local dashboard server, and the dashboard must remain read-only with respect to triggering or approving changes outside of the capabilities it already exposes today.

## Assumptions

- Consumer projects already have the runtime prerequisites needed to run the orchestrator engine today (the same prerequisites are not being newly introduced by this feature).
- The existing setup script is the intended single installation entry point for consumer projects; this feature extends what it installs rather than introducing a second installation mechanism.
- "Independently versioned" means the package's version is decoupled from any specific consumer project's own release cycle.
- The dashboard continues to operate with no backend dependency beyond the local dashboard server itself (no external hosted services).

## Open Questions

_None — the issue's Proposed Solution, Acceptance Criteria, Out of Scope, and Alternatives Considered sections were already enriched and confirmed prior to spec authoring. Ready for handoff._
