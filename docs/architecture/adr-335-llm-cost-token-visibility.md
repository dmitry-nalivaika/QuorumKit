# ADR-335: Per-Feature and Per-Agent LLM Cost & Token Visibility via Existing Audit Trail

| Field | Value |
|---|---|
| **ADR Number** | 335 |
| **Issue** | #335 — Per-feature and per-agent LLM cost & token visibility |
| **Status** | Proposed |
| **Date** | 2026-08-03 |
| **Deciders** | Architect Agent |
| **Supersedes** | — |
| **Related** | ADR-332 (enables `azure-openai` runtime kind; explicitly deferred cost telemetry to this ADR) |

---

## Context

Issue #332's spec explicitly listed cost/token telemetry as **Out of Scope**:
maintainers can now (per ADR-332) assign different models/providers per agent
for cost control, but have no way to *see* actual token usage or estimated
spend per feature (GitHub Issue/NNN, per Constitution §II traceability) or per
agent. Issue #335 tracks that follow-up.

Two architectural constraints bound the solution space:

- **Constitution §VIII** (Orchestrator as sole control plane, stateless):
  all state lives in GitHub Issues/PRs and spec files — not in memory or a new
  local/external store.
- **Constitution §IX** (Dashboard as read-only observability surface): any new
  visibility surface must not introduce a write path to GitHub or any external
  system.
- **Constitution §VII** (Simplicity/YAGNI, no new dependencies without an ADR).

Every agent invocation already posts a machine-readable `apm-msg` JSON block
in its `agent-complete` GitHub comment (Constitution §VI — observable,
auditable automation), tagged with `issue`/`pipeline_id` (the feature) and
`agent`. Separately, every runtime kind currently shipped or proposed
(`copilot` via GitHub Models — ADR-003; `claude`; `azure-openai` — ADR-332)
calls an OpenAI-compatible `chat/completions` endpoint, whose response already
includes a `usage` object (`prompt_tokens`, `completion_tokens`,
`total_tokens`) at no extra cost or call.

## Decision

**Extend the existing audit-comment mechanism to carry token usage and an
estimated cost; surface it in the dashboard by aggregating existing GitHub
data. No new service, store, or external dependency is introduced.**

### 1. Capture usage at the existing call site

Each dispatched agent workflow / runtime adapter step that already performs
the `chat/completions` call reads `response.usage` from that same response and
adds it to the `apm-msg` block it already posts — no new network call, no new
workflow step class.

```jsonc
{
  "version": "2",
  // ...existing apm-msg fields unchanged...
  "usage": {
    "runtime": "azure-foundry-standard",
    "model": "gpt-4o",
    "prompt_tokens": 1234,
    "completion_tokens": 567,
    "total_tokens": 1801,
    "estimated_cost_usd": 0.0142
  }
}
```

`usage` is an **additive, optional** field on the existing `apm-msg` v2
schema — existing consumers that ignore unknown fields are unaffected;
`version` stays `"2"`.

### 2. Pricing as maintainer-editable config, not code

A new file, `src/model-pricing.yml`, maps a model/deployment identifier to a
$/1K-token rate for prompt and completion tokens:

```yaml
# Estimates only — not billing-grade. Update when provider pricing changes.
pricing:
  gpt-4o:
    prompt_per_1k_usd: 0.0025
    completion_per_1k_usd: 0.01
  gpt-4o-mini:
    prompt_per_1k_usd: 0.00015
    completion_per_1k_usd: 0.0006
```

This is consumed at comment-write time by the same step that captures
`usage`, to compute `estimated_cost_usd`. If a model has no entry, the step
still reports token counts and sets `estimated_cost_usd: null` (degrade
gracefully — never fail the agent run over a missing price entry).

### 3. Dashboard aggregation (read-only, additive view)

The dashboard (`dashboard/`, Constitution §IX) adds a "Cost & Tokens" view
that:
- Parses `apm-msg` blocks from existing GitHub Issue/PR comment data it
  already ingests for timeline reconstruction.
- Groups by `issue`/`pipeline_id` (= feature) and by `agent`, summing
  `total_tokens` and `estimated_cost_usd`.
- Renders per-feature totals and a per-agent breakdown within a feature.

No new backend, no new database, no write path — purely a derived view over
data the dashboard already reads (Constitution §VIII/§IX compliant by
construction).

### 4. Backward compatibility

Runtimes/workflows that do not yet emit `usage` (e.g. any in-flight PRs before
this ships) simply omit the field; the dashboard treats missing `usage` as
"not tracked for this invocation" rather than zero, so historical/partial data
never appears as misleadingly free.

---

## Consequences

**Positive**
- No new infrastructure, dependency, or persistent store — rides entirely on
  the audit-comment mechanism and OpenAI-compatible `usage` field that already
  exist.
- Directly closes the loop opened by ADR-332: maintainers can now see whether
  a per-agent cost-tier assignment is actually saving money.
- Fully consistent with Constitution §VI, §VII, §VIII, §IX without any
  amendment.

**Negative / Trade-offs**
- `estimated_cost_usd` is only as accurate as the manually maintained
  `src/model-pricing.yml`; it is explicitly an estimate, not a billing-grade
  reconciliation against the actual Azure/GitHub invoice.
- Adds one more optional field to a schema every adapter must populate
  consistently; mitigated by keeping it additive and by Developer Agent test
  coverage per adapter.

**Risks**
- *Risk*: Pricing table goes stale as providers change rates.
  *Mitigation*: it is a visible, version-controlled config file — a stale
  price is a normal, reviewable config-drift item, not a silent bug.
- *Risk*: Someone reads `estimated_cost_usd` as authoritative for billing
  disputes. *Mitigation*: explicitly labelled "estimate" in the dashboard UI
  and in this ADR; Out of Scope section of the spec states this plainly.

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| LiteLLM (or similar) proxy in front of all providers | Built-in cost dashboards/budgets, multi-provider normalization | New external dependency + hosted service requiring its own ADR (§VII); adds an indirection layer that must preserve ADR-332's no-silent-fallback guarantee | Deferred — heavier than warranted at current scale; revisit if usage/spend grows across many concurrent projects |
| New dedicated telemetry service/database | Query flexibility, historical analytics | Violates §VIII (orchestrator/dashboard statelessness) and §VII (new dependency) | Rejected outright |
| Compute cost only, no token counts | Simpler UI | Tokens are the leading indicator maintainers actually reason about per-agent; withholding them loses signal for free | Rejected — no cost saving to withholding a field already available in the API response |
| In-band `apm-msg` extension + config pricing table + dashboard aggregation (chosen) | Zero new infra, uses existing mechanisms end-to-end | Estimate-only cost figure | Accepted |

---

## Follow-Up Work (not covered by this ADR)

1. **Developer Agent**: add `usage` capture to each runtime adapter/dispatched
   workflow step; add `src/model-pricing.yml` + loader; extend the `apm-msg`
   JSON schema (additive); tests per adapter.
2. **Docs Agent**: document `src/model-pricing.yml` format and the "estimate,
   not billing-grade" caveat in `docs/AGENT_PROTOCOL.md`.
3. **Dashboard**: implement the "Cost & Tokens" read-only view (per feature,
   per agent); confirm no write path is introduced (Constitution §IX audit).
4. **Security Agent**: confirm no credential or PII leakage in the `usage`
   block (it must contain only counts/model identifiers, never prompt/response
   content).

---

## References

- Issue #335 (this decision); Issue #332 and ADR-332 (root motivation, explicitly deferred this scope)
- `docs/architecture/adr-003-copilot-workflow-github-models-migration.md` —
  existing OpenAI-compatible `chat/completions` call this ADR reuses
- `docs/architecture/adr-005-pluggable-runtime-registry-interface.md`,
  `adr-332-enable-azure-openai-runtime-kind.md` — runtime/model configuration
  this ADR adds visibility for
- Constitution §VI (Observable, Auditable Automation), §VII (Simplicity/YAGNI),
  §VIII (Orchestrator stateless control plane), §IX (Dashboard read-only)
