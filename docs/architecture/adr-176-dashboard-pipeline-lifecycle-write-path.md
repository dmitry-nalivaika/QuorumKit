# ADR-176: Dashboard Pipeline Lifecycle Write-Path Endpoints

| Field | Value |
|---|---|
| **ADR Number** | 176 |
| **Issue** | #176 — Local Pipeline Management UI |
| **Status** | Accepted |
| **Date** | 2026-05-25 |
| **Deciders** | Architect Agent |
| **Supersedes** | — |
| **Related** | ADR-175 (worktree isolation model), ADR-007 (GHA substrate contract), Constitution Principle IX |

---

## Context

Constitution **Principle IX** designates the dashboard (`engine/dashboard/`) as a
**read-only** observability surface and prohibits any dashboard feature that requires
write access to any system "without an ADR." The spec for Issue #176 (Local Pipeline
Management UI) explicitly flags this requirement:

> "Starting and stopping pipelines mutates the local filesystem (git worktrees).
> An ADR must be approved before the Developer Agent begins implementation of the
> write-path endpoints."

PR #186 adds `POST /api/local-pipelines/start` and `POST /api/local-pipelines/stop`
to `engine/dashboard/server.js`. These endpoints mutate the local filesystem by
spawning `scripts/pipeline.sh` with `start` or `stop` subcommands. The Reviewer
Agent flagged this as **BLOCKER 1** (constitution gate, Principle IX). This ADR
provides the required architectural justification and binding constraints.

### Existing precedent

The dashboard server already exposes two write-path endpoints:

- `POST /api/invoke` — spawns a local agent process (Claude or VS Code extension
  invocation) with user-supplied arguments.
- `POST /api/terminal` — sends keyboard input to an already-running terminal
  process managed by the server.

Both endpoints mutate local system state (spawn processes, write to stdin) from the
same dashboard server process. They are the accepted, in-use precedent for the
dashboard's write boundary. The question this ADR must answer is: **Is the scope
extension from process-spawn to filesystem-mutation (git worktrees) architecturally
justified?**

### Why this is a meaningful extension

Spawning an agent process is ephemeral — the process exits and leaves no durable
artefact on the local filesystem beyond whatever the agent writes via its own logic.
Creating or removing a `git worktree` is a **durable filesystem mutation**: it
allocates or deallocates a working directory, modifies `.git/worktrees/`, and
changes the repository's locally observable state. The attack surface therefore
extends from process injection to path traversal and arbitrary filesystem write if
inputs are not validated.

---

## Decision

**The dashboard server MAY spawn `scripts/pipeline.sh start` and
`scripts/pipeline.sh stop` in response to `POST /api/local-pipelines/start` and
`POST /api/local-pipelines/stop`, subject to the mandatory constraints listed
below. This is a bounded and justified extension of the existing write-path
precedent established by `POST /api/invoke`.**

---

## Mandatory Constraints

All of the following constraints are **non-negotiable**. Any PR implementing these
endpoints that violates any constraint below is an ARCH-BLOCKER and must not merge.

### 1. Input validation before shell invocation

All request inputs are validated server-side before any shell process is spawned:

| Field | Accepted values | Rejection action |
|---|---|---|
| `issueNumber` | Positive integer (`/^[1-9][0-9]*$/`) | 400 Bad Request |
| `slug` | Optional; when present must match `^[a-z0-9][a-z0-9-]*$` | 400 Bad Request |
| `mode` | Enum: `isolated` or `shared` only | 400 Bad Request |

Validation runs on raw request body values before any downstream logic. Any field
that does not satisfy its constraint causes an immediate rejection with a 400 status
code and a descriptive error message. No shell process is spawned for invalid inputs.

### 2. Argument isolation — no string concatenation

Shell arguments MUST be passed as **separate array elements** to Node.js `child_process.spawn()`. String concatenation of user input into a shell command string is
prohibited. The correct invocation pattern is:

```js
spawn('bash', ['scripts/pipeline.sh', 'start', issueNumber, slug, `--mode=${mode}`], options)
```

This eliminates shell injection via the `issueNumber`, `slug`, or `mode` fields,
regardless of what those values contain after server-side validation.

### 3. Filesystem scope enforcement

Write operations are scoped to the pipeline root derived from
`QUORUMKIT_PIPELINES_DIR` when that environment variable is set; otherwise the
default sibling-directory convention from ADR-175 applies. The server MUST NOT
pass an absolute or relative filesystem path supplied by the client to
`scripts/pipeline.sh`. Path arguments are always derived server-side from the
validated `issueNumber` and the pipeline root. This prevents path traversal.

### 4. Stop endpoint — no client-supplied path

`POST /api/local-pipelines/stop` accepts only a validated `issueNumber`. The
server resolves the worktree path from the live `git worktree list` output, keyed
on the `NNN-slug` branch-naming pattern defined in ADR-175. The client never
supplies a filesystem path. This prevents stop operations from targeting arbitrary
directories outside the managed pipeline set.

### 5. Test isolation via `QUORUMKIT_TEST_PIPELINE_SH`

When the environment variable `QUORUMKIT_TEST_PIPELINE_SH` is set, the server
MUST substitute its value as the script path in place of `scripts/pipeline.sh`.
This allows unit tests to inject a mock script without spawning real git operations,
and must not be removed or weakened in future refactors of the endpoint.

### 6. WebSocket broadcast on every write operation

Every successful (and failed) write-path response MUST broadcast a
`pipelineListChanged` event to all connected WebSocket clients. This ensures that
all open dashboard tabs reflect updated state immediately, consistent with the
observability guarantee in Constitution Principle VI ("Observable, Auditable
Automation").

---

## Rationale

### Why extend the dashboard write path at all

The dashboard is the single unified UI surface for local QuorumKit development
activity. Forcing developers to use a terminal alongside the dashboard for lifecycle
operations — when the dashboard already shows pipeline state — creates a split
interaction model. The spec (US-2, US-3) is clear that this is a hard user-story
requirement, not a nice-to-have. Rejecting all write paths unconditionally would
require a separate control surface (a distinct web app, a CLI-only workflow, or a
separate daemon), each of which introduces more complexity than the controlled
write-path extension this ADR governs.

### Why the existing `POST /api/invoke` precedent supports this extension

`POST /api/invoke` already spawns subprocesses from the dashboard server with
developer-controlled arguments. The principle that the dashboard is "read-only" was
established to prevent the dashboard from **triggering, modifying, or approving
agent actions on GitHub** (the primary concern in Principle IX) — not to prohibit
all local side-effects on the developer's own machine. The `POST /api/invoke`
precedent establishes that local process spawn is within the accepted boundary.
Pipeline lifecycle operations extend that boundary by one step: from ephemeral
process spawn to durable worktree mutation, justified by the feature requirement
and made safe by the validation and scope constraints above.

### Why not direct `gh` CLI calls from the server

`gh` CLI calls would introduce a network dependency (GitHub API) into every pipeline
lifecycle operation. ADR-175 explicitly chose to keep the local machine stateless by
storing state in GitHub Issue comments, not by making GitHub the gatekeeper for
every start/stop. Blocking local worktree creation on a GitHub API call creates a
usability regression (pipeline start fails when offline) and adds latency to a
fast operation. The `pipeline.sh` script handles its own GitHub comment posting
asynchronously; the server need not duplicate that concern.

### Why not a separate local daemon

A dedicated daemon for pipeline lifecycle management would:

1. Violate **Constitution Principle VIII** — the Orchestrator is the sole control
   plane; a second local daemon becomes a competing sequencer.
2. Require a separate install step, separate process management, and separate
   observability surface — all complexity the spec explicitly avoids.
3. Not provide stronger security guarantees than the validated `spawn()` approach
   described in this ADR (the daemon would still need the same input validation
   constraints).

The `scripts/pipeline.sh` model already exists and is tested. Wrapping it behind an
HTTP endpoint in the dashboard server is the lowest-complexity path that satisfies
the requirements.

### Why not client-side shell execution

Client-side shell execution (e.g. via a VS Code extension message) is not an option
for the browser-based dashboard tab — browsers have no shell access. For the VS Code
extension surface specifically, this would couple the pipeline lifecycle to a VS Code
extension lifecycle, which conflicts with FR-176's requirement to support
browser-only operation. The server-side spawn model is the only approach that works
uniformly across both surfaces.

---

## Consequences

### Positive

- **Unified UX**: developers can start, stop, and inspect pipelines without leaving
  the dashboard or opening a terminal. The dashboard becomes a complete local
  development console.
- **Consistent auth model**: write-path endpoints sit behind the same dashboard
  server process that already guards `POST /api/invoke`. No new authentication
  boundary is introduced.
- **Observable operations**: `pipelineListChanged` WebSocket broadcasts mean all
  open tabs stay in sync; no tab can display stale state after a lifecycle event.
- **Scoped mutations**: write operations are bounded to the pipeline root directory;
  no operation can reach outside the managed worktree set.
- **Testable**: `QUORUMKIT_TEST_PIPELINE_SH` provides a clean test-isolation
  mechanism with no production overhead.

### Negative

- **Server process has filesystem write access**: the dashboard server process, which
  was previously a read-only read-and-proxy service, now has the ability to create
  and remove git worktrees. This is mitigated by:
  - Input validation rejecting all inputs that do not match the strict allowlists
  - Argument isolation via `spawn()` array form eliminating shell injection
  - Scope enforcement preventing writes outside `QUORUMKIT_PIPELINES_DIR` / the
    sibling-directory convention
  - Stop operations resolving paths server-side from `git worktree list`, not from
    client-supplied paths

- **Increased server attack surface**: any local attacker with network access to the
  dashboard port (`localhost:3000` by default) can trigger pipeline lifecycle
  operations. This is acceptable because:
  - The dashboard is a `localhost`-only service; it is not exposed to the internet
  - The operations it can trigger (create/remove feature worktrees) are already
    available to anyone with shell access on the developer's machine
  - No credentials or secrets are passed through these endpoints

- **Maintenance coupling**: the dashboard server now depends on the interface
  contract of `scripts/pipeline.sh`. Changes to `pipeline.sh`'s subcommands or
  argument ordering must be co-ordinated with the server endpoints. This is
  mitigated by `QUORUMKIT_TEST_PIPELINE_SH` enabling endpoint tests to detect
  interface regressions.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Shell injection via malformed `slug` or `issueNumber` | Low (strict regex allowlists + `spawn()` array form) | Enforced by Constraint 1 and Constraint 2; Security Agent must verify on every PR touching these endpoints |
| Path traversal via client-supplied path in stop request | Low (path never accepted from client) | Enforced by Constraint 4 |
| Race condition: two concurrent start requests for the same issue | Low | `git worktree add` fails atomically if the branch already has a worktree; server returns the existing worktree path as a conflict (409) |
| Dashboard port exposed beyond localhost by misconfiguration | Very low | Documented in server configuration; not a new risk introduced by this ADR |

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| **Direct `gh` CLI calls from server** | Single-command approach, no script dependency | Network dependency on GitHub API for every start/stop; offline unusable; duplicates pipeline.sh posting logic | Adds latency and network dependency to a fast local operation; `pipeline.sh` already handles this correctly |
| **Separate local coordination daemon** | Decoupled lifecycle management | Violates Constitution Principle VIII (second control plane); adds install/management overhead; no stronger security guarantees | Hard violation of constitution's single-control-plane rule; equal or greater complexity for no architectural gain |
| **Client-side shell execution (VS Code extension message)** | No server-side spawn | Not available in browser context; creates a dependency on VS Code extension availability for a feature that must work in browser-only mode | Does not satisfy FR-176's requirement to support browser-only operation |
| **Reject all write paths — terminal only** | Preserves read-only dashboard invariant unconditionally | Forces a split interaction model (browser + terminal mandatory); contradicts the spec's core user stories | Does not satisfy US-2 or US-3; the controlled write-path extension with mandatory constraints is the appropriate architecture response to Principle IX |
