# Spec: Per-Feature and Per-Agent LLM Cost & Token Visibility — Issue #335

## Overview

Follow-up from #332: maintainers can now assign different LLM providers/models
per agent for cost tiering, but have no way to see actual token usage or
estimated spend per feature (GitHub Issue/NNN) or per agent. This spec extends
the existing `apm-msg` agent audit trail with token/cost data and adds a
read-only "Cost & Tokens" dashboard view, per ADR-335. No new telemetry
infrastructure, backend, or database is introduced.

## User Stories

### US-1: Every agent-complete comment reports token usage and estimated cost

As a maintainer reviewing an agent's work,
I want the `agent-complete` comment's `apm-msg` block to include token counts
and an estimated cost for the LLM call that produced the work,
so that I can see per-invocation resource consumption without leaving GitHub.

Acceptance Scenarios:
- Given an agent using the `copilot` runtime kind completes a session, When it
  posts its `agent-complete` comment, Then the `apm-msg` block contains a
  `usage` object with `runtime`, `model`, `prompt_tokens`, `completion_tokens`,
  `total_tokens`, and `estimated_cost_usd`.
- Given an agent using the `azure-openai` runtime kind completes a session,
  When it posts its `agent-complete` comment, Then the `apm-msg` block
  contains an equivalent `usage` object populated from that runtime's
  `chat/completions` response.
- Given the underlying `chat/completions` response for any runtime kind
  contains no `usage` object (e.g. provider omitted it), When the agent posts
  its `agent-complete` comment, Then the `apm-msg` block omits the `usage`
  field entirely rather than posting a partially-filled or fabricated one, and
  the agent run still completes successfully.

### US-2: Estimated cost is computed from a maintainer-editable pricing table

As a maintainer managing LLM cost tiers,
I want estimated cost to be computed from a version-controlled pricing file I
can edit without touching agent code,
so that I can keep cost estimates current as provider pricing changes without
requiring a code change or redeploy.

Acceptance Scenarios:
- Given `src/model-pricing.yml` contains a pricing entry for the model used in
  an agent invocation, When the `usage` object is computed, Then
  `estimated_cost_usd` equals `(prompt_tokens / 1000 * prompt_per_1k_usd) +
  (completion_tokens / 1000 * completion_per_1k_usd)` for that model's entry.
- Given `src/model-pricing.yml` has no entry for the model used in an agent
  invocation, When the `usage` object is computed, Then `prompt_tokens`,
  `completion_tokens`, and `total_tokens` are still reported and
  `estimated_cost_usd` is `null`, and the agent run does not fail or block on
  the missing entry.
- Given `src/model-pricing.yml` is malformed or unreadable, When any agent
  attempts to compute `estimated_cost_usd`, Then the agent still reports
  token counts with `estimated_cost_usd: null` and completes its run
  successfully (pricing lookup failure never fails the agent run).

### US-3: Maintainer views per-feature and per-agent cost/token totals on the dashboard

As a maintainer tracking spend across features and agents,
I want a read-only "Cost & Tokens" view in the dashboard that aggregates
existing `apm-msg` data by feature and by agent,
so that I can see which features or agents are consuming the most tokens/cost
without querying GitHub manually or standing up new infrastructure.

Acceptance Scenarios:
- Given multiple `agent-complete` comments with `usage` data exist across
  several issues, When the "Cost & Tokens" view is opened, Then it displays,
  for each feature (grouped by `issue`/`pipeline_id`), the sum of
  `total_tokens` and the sum of `estimated_cost_usd` across all invocations
  for that feature.
- Given multiple `agent-complete` comments with `usage` data exist across
  several agents, When the "Cost & Tokens" view is opened, Then it displays,
  for each `agent` value, the sum of `total_tokens` and the sum of
  `estimated_cost_usd` across all invocations by that agent.
- Given some invocations within a feature have `estimated_cost_usd: null`
  (missing pricing entry), When totals are computed for that feature, Then
  the view clearly indicates the cost total is a partial/incomplete estimate
  (e.g. an "estimate incomplete" or similar indicator) rather than silently
  treating the null as zero.
- Given the "Cost & Tokens" view is rendered, When any user interacts with it,
  Then no action in the view triggers a write to GitHub or any other system
  (read-only, Constitution §IX).

### US-4: Historical comments without usage data are not misrepresented

As a maintainer viewing cost/token data that spans before and after this
feature ships,
I want invocations that predate `usage` tracking to be shown as "not tracked"
rather than as zero cost/zero tokens,
so that I am not misled into thinking older work was free or that current
totals are complete.

Acceptance Scenarios:
- Given an `agent-complete` comment's `apm-msg` block has no `usage` field
  (posted before this feature shipped, or produced by a runtime that does not
  yet support usage capture), When the dashboard aggregates totals, Then that
  invocation is excluded from the sum and reflected as "not tracked" rather
  than contributing a zero value.
- Given a feature has a mix of tracked and untracked invocations, When its
  per-feature total is displayed, Then the view distinguishes the tracked
  total from the count/presence of untracked invocations (e.g. "N
  invocations not tracked") so the total is not misread as complete.

## Functional Requirements

- FR-001: Each runtime adapter/dispatched workflow step that performs an
  OpenAI-compatible `chat/completions` call MUST read the `usage` object from
  that response (`prompt_tokens`, `completion_tokens`, `total_tokens`) and
  include it in the `usage` object of the `apm-msg` block posted in that
  invocation's `agent-complete` comment.
- FR-002: FR-001 applies identically to every runtime kind that performs such
  a call, including at minimum `copilot` (GitHub Models) and `azure-openai`.
- FR-003: The `usage` object in `apm-msg` MUST include `runtime`, `model`,
  `prompt_tokens`, `completion_tokens`, `total_tokens`, and
  `estimated_cost_usd` when usage data is available.
- FR-004: The `usage` field MUST be additive and optional on the existing
  `apm-msg` v2 schema. `version` MUST remain `"2"`. Existing consumers that
  ignore unknown fields MUST remain unaffected.
- FR-005: If the underlying `chat/completions` response does not include a
  `usage` object, the agent MUST omit the `usage` field from `apm-msg`
  entirely (not emit a partially-filled or fabricated object), and the agent
  run MUST still complete successfully.
- FR-006: A new maintainer-editable configuration file, `src/model-pricing.yml`,
  MUST map a model/deployment identifier to `prompt_per_1k_usd` and
  `completion_per_1k_usd` rates.
- FR-007: The step that computes `estimated_cost_usd` MUST look up the
  invocation's model in `src/model-pricing.yml` and compute
  `estimated_cost_usd = (prompt_tokens / 1000 * prompt_per_1k_usd) +
  (completion_tokens / 1000 * completion_per_1k_usd)` when a matching entry
  exists.
- FR-008: If `src/model-pricing.yml` has no entry for the invocation's model,
  or the file is missing, malformed, or unreadable, the agent MUST still
  report `prompt_tokens`, `completion_tokens`, and `total_tokens`, MUST set
  `estimated_cost_usd` to `null`, and MUST NOT fail or block the agent run on
  this condition.
- FR-009: The dashboard (`dashboard/`) MUST add a "Cost & Tokens" view that
  parses `apm-msg` blocks from existing GitHub Issue/PR comment data the
  dashboard already ingests — no new backend service, database, or API is
  introduced.
- FR-010: The "Cost & Tokens" view MUST aggregate `total_tokens` and
  `estimated_cost_usd` grouped by feature (`issue`/`pipeline_id`) across all
  invocations belonging to that feature.
- FR-011: The "Cost & Tokens" view MUST aggregate `total_tokens` and
  `estimated_cost_usd` grouped by `agent` across all invocations by that
  agent.
- FR-012: The "Cost & Tokens" view MUST be read-only: it MUST NOT expose any
  control that writes, triggers, or modifies GitHub state or agent behavior
  (Constitution §IX).
- FR-013: `apm-msg` blocks with no `usage` field (historical comments
  predating this feature, or produced by a runtime/adapter not yet updated)
  MUST be treated by the dashboard aggregation as "not tracked" for that
  invocation — excluded from token/cost sums, not counted as zero.
- FR-014: When a feature's or agent's aggregate includes one or more
  invocations with `estimated_cost_usd: null` (missing pricing entry) or
  invocations with no `usage` field at all ("not tracked"), the "Cost &
  Tokens" view MUST visibly indicate the total is partial/incomplete rather
  than presenting it as a complete figure.
- FR-015: The `usage` object MUST contain only token counts and model/runtime
  identifiers — it MUST NOT contain prompt content, completion content, or
  any other PII/credential data.
- FR-016: `src/model-pricing.yml` and the "Cost & Tokens" view MUST be
  labelled (in-repo comment / config header and in the dashboard UI,
  respectively) as producing estimates, not billing-grade or reconciled
  figures.

## Success Criteria

- [ ] Every `agent-complete` `apm-msg` block for a `copilot`-runtime
      invocation includes a populated `usage` object with token counts and
      `estimated_cost_usd`.
- [ ] Every `agent-complete` `apm-msg` block for an `azure-openai`-runtime
      invocation includes a populated `usage` object with token counts and
      `estimated_cost_usd`.
- [ ] `src/model-pricing.yml` exists, is used to compute `estimated_cost_usd`,
      and a missing/unknown model entry results in `estimated_cost_usd: null`
      with token counts still reported and the agent run still succeeding.
- [ ] The dashboard displays total tokens and estimated cost per feature
      (Issue/NNN) and per agent, derived only from existing GitHub data (no
      new backend or database).
- [ ] The dashboard's "Cost & Tokens" view is read-only — no write path is
      introduced (Constitution §IX).
- [ ] Historical `apm-msg` blocks without a `usage` field are displayed as
      "not tracked," never as zero cost/zero tokens.

## Key Entities

- **`usage` object**: An additive, optional field on the existing `apm-msg`
  v2 JSON block, containing `runtime`, `model`, `prompt_tokens`,
  `completion_tokens`, `total_tokens`, and `estimated_cost_usd` (nullable) for
  a single agent invocation's LLM call.
- **`src/model-pricing.yml`**: A version-controlled, maintainer-editable
  configuration file mapping a model/deployment identifier to
  `prompt_per_1k_usd` and `completion_per_1k_usd` rates, used to compute
  `estimated_cost_usd`.
- **Cost & Tokens view**: A read-only dashboard view aggregating `usage` data
  from existing `apm-msg` blocks, grouped by feature (`issue`/`pipeline_id`)
  and by `agent`.
- **Not-tracked invocation**: An agent invocation whose `apm-msg` block
  predates this feature or was produced by a runtime/adapter without usage
  capture, and therefore has no `usage` field. Distinct from a tracked
  invocation with `estimated_cost_usd: null` (tokens known, cost unknown).

## Out of Scope

- Billing-grade or reconciled cost figures — all costs are estimates derived
  from a manually maintained pricing table, never validated against actual
  provider invoices.
- Budgets, alerts, or spend caps of any kind.
- Routing all providers through a third-party LLM gateway/proxy (e.g.
  LiteLLM) — considered and deferred per ADR-335's Alternatives Considered;
  may be revisited in a future ADR if usage/spend justifies the added
  operational complexity.
- Any new backend service, database, or persistent store for telemetry — all
  data continues to live in existing GitHub Issue/PR comments.
- Retroactively backfilling `usage` data into historical comments that predate
  this feature.
- Any dashboard write path, control, or action that modifies GitHub state or
  triggers agent behavior.

## Security and Privacy Considerations

The `usage` object and `src/model-pricing.yml` must never contain prompt
content, completion content, credentials, or other PII — only token counts,
cost figures, and model/runtime identifiers (Constitution §VI observability
without leaking sensitive data). No new authentication, authorization, or data
access scope is introduced: the dashboard continues to read only data it
already has access to, and agents continue to use their existing GitHub
comment-posting permissions. `src/model-pricing.yml` is a plain, non-secret
configuration file (pricing rates only) and must not be used to store API
keys or credentials.

## Assumptions

- Every runtime kind currently shipped or proposed (`copilot`, `claude`,
  `azure-openai`) calls an OpenAI-compatible `chat/completions` endpoint whose
  response includes a `usage` object at no additional cost or network call,
  per ADR-335.
- The dashboard already ingests and parses `apm-msg` JSON blocks from GitHub
  Issue/PR comments for existing timeline/observability features (e.g. #268,
  #259); this spec only adds a new aggregation/view over that same data
  source.
- `apm-msg` schema `version` remains `"2"`; `usage` is added as a new optional
  top-level field without bumping the version, per ADR-335.
- Maintainers are responsible for keeping `src/model-pricing.yml` current;
  staleness is an expected, reviewable config-drift condition, not a defect.

## Open Questions

_None — the problem, technical approach (ADR-335), affected surfaces (runtime
adapters, `apm-msg` schema, pricing config, dashboard), acceptance criteria,
and out-of-scope boundaries are all fully specified. Ready for handoff to
Developer Agent._
