# ADR-332: Enable `azure-openai` Runtime Kind for Predictable, Per-Agent, Cost-Configurable LLM Routing

| Field | Value |
|---|---|
| **ADR Number** | 332 |
| **Issue** | #332 — LLM keys for the project to be configured per project, so agentic workflows run on the predictable LLM provided by me (root cause: #326 — Pipeline failed) |
| **Status** | Proposed |
| **Date** | 2026-08-03 |
| **Deciders** | Architect Agent |
| **Supersedes** | — |
| **Exercises** | ADR-005 (Pluggable Runtime Registry) — "Process to enable a reserved kind" |

---

## Context

Issue #332 asks for the agentic workflow to run on a **predictable LLM provider**
supplied by the maintainer, with **per-agent model selection for cost control**,
using an **Azure subscription hosting Azure AI Foundry** models. The linked root
cause (#326, "Pipeline failed") is under-specified but is consistent with the
project's current sole default: `copilot-default`, which routes through GitHub
Models (ADR-003) — a shared, rate-limited, Microsoft-operated endpoint with no
per-project SLA and no cost/model choice.

The runtime registry architecture (ADR-005, `src/runtimes.yml`,
`runtime-registry.js`) already anticipated this exact request:

- `kind: azure-openai` is a **reserved** kind — declared in the interface but
  rejected by the validator (`RUNTIME_KIND_NOT_ENABLED`) until a per-kind ADR is
  merged.
- Per-agent runtime routing already exists (`agent_defaults`, FR-008) and each
  runtime entry already supports an optional `model` field in the schema
  (`engine/orchestrator/schemas/runtimes.schema.json`).
- Credentials are already referenced by name only (`credential_ref` → resolved
  from `process.env`/GitHub Actions secrets at invocation time), which already
  satisfies "keys configured per project" for any repo that installs this
  package (Constitution §V — this project is consumed by other repos, each with
  its own `src/runtimes.yml` and its own secrets).

What is **not yet decided** is the specific contract for the `azure-openai`
kind itself: dispatch mechanism, auth model, endpoint/model shape, and how
"per-agent, cost-aware" model selection is expressed without adding new schema
surface. ADR-005 requires this decision to be made in its own ADR before any
adapter code is written.

---

## Decision

**Enable `azure-openai` as a supported runtime kind**, moving it from
*Reserved* to *Supported* in the ADR-005 kind allowlist. No other reserved kind
(`bedrock`, `ollama`, `custom`) is affected by this decision.

### 1. Dispatch model — generalize the existing OpenAI-compatible path, don't fork it

`claude.js` and `copilot.js` are both **dispatch-only** adapters: the
orchestrator never calls an LLM API itself, it triggers a GitHub Actions
workflow (`agent-<slug>.yml` / `copilot-agent-<slug>.yml`) that performs the
actual HTTP call. The Copilot workflow already does a generic OpenAI-compatible
`chat/completions` POST (ADR-003) against a hardcoded endpoint/model.

Azure OpenAI / Azure AI Foundry exposes the **same OpenAI-compatible
`chat/completions` contract** (different host, path, and auth header only).
Per Constitution §VII (Simplicity/YAGNI — no duplicated agent-workflow fleets),
`azure-openai` MUST NOT ship as a fourth parallel set of N per-agent workflow
files. Instead:

- The dispatched-workflow HTTP step (currently hardcoded to
  `models.inference.ai.azure.com` + `gpt-4o` per ADR-003) is generalized to
  read `endpoint`, `model`, and the resolved credential from the runtime entry
  passed as workflow inputs, instead of hardcoding them.
- `runtimes/azure-openai.js` is a new adapter, structurally parallel to
  `copilot.js`, that dispatches the same generalized workflow family with its
  own `runtime.endpoint` / `runtime.model` / `runtime.credential_ref`.
- This is an implementation task for the Developer Agent (workflow YAML +
  adapter + tests) under a follow-up PR; this ADR fixes the *contract*, not the
  code.

### 2. Auth model

- `credential_ref` resolves to an Azure OpenAI **API key** (`api-key` header),
  the zero-config default (Constitution §V) — no new secret-management system.
  Convention: `AZURE_OPENAI_API_KEY` (project-level GitHub Actions secret,
  never committed, resolved the same way `ANTHROPIC_API_KEY`/`GITHUB_TOKEN`
  are today).
- Azure AD / managed-identity auth is explicitly **out of scope** for this ADR
  (recorded as `ARCH-CONCERN`: viable future enhancement for orgs that forbid
  long-lived API keys, but it is a separate auth dependency requiring its own
  review).

### 3. Endpoint / model shape

Azure OpenAI addresses models by **deployment name**, not raw model name.
The existing schema fields are reused as-is, with a fixed convention:

```yaml
runtimes:
  azure-foundry-standard:
    kind: azure-openai
    endpoint: https://<resource>.openai.azure.com/openai/deployments/<deployment>
    credential_ref: AZURE_OPENAI_API_KEY
    model: <deployment-name>          # Azure "deployment", not the base model id
    parameters:
      api_version: "2024-10-21"        # required Azure query param
```

No schema change is required — `model`, `region`, and `parameters` are already
present in `runtimes.schema.json` (ADR-005).

### 4. Per-agent, cost-aware model selection — no new mechanism needed

FR-008's existing `agent_defaults` map already provides per-agent routing to a
named runtime. Cost-aware selection is achieved by declaring **multiple**
`azure-openai` runtime entries (different deployments/models) and mapping
cheaper deployments to high-frequency/low-stakes agents and higher-capability
deployments to low-frequency/high-stakes agents, e.g.:

```yaml
default_runtime: azure-foundry-standard

agent_defaults:
  triage-agent: azure-foundry-mini
  docs-agent: azure-foundry-mini
  architect-agent: azure-foundry-standard
  security-agent: azure-foundry-standard
  dev-agent: azure-foundry-standard

runtimes:
  azure-foundry-mini:
    kind: azure-openai
    endpoint: https://<resource>.openai.azure.com/openai/deployments/gpt-4o-mini
    credential_ref: AZURE_OPENAI_API_KEY
    model: gpt-4o-mini
    parameters: { api_version: "2024-10-21" }

  azure-foundry-standard:
    kind: azure-openai
    endpoint: https://<resource>.openai.azure.com/openai/deployments/gpt-4o
    credential_ref: AZURE_OPENAI_API_KEY
    model: gpt-4o
    parameters: { api_version: "2024-10-21" }
```

This is purely a **configuration exercise** in each consuming project's own
`src/runtimes.yml` — it requires no code change beyond the adapter itself, and
satisfies "per project" (Constitution §V: `src/runtimes.yml` is per-repo) and
"per agent, cost-configurable" from the issue.

### 5. Predictability — no silent cross-provider fallback

`resolveRuntime()` already resolves `step → agent_defaults → default_runtime`
and returns an explicit `runtime-unresolved` error if none match; adapters
throw `runtime-credential-missing` rather than substituting another kind. This
ADR reaffirms that behaviour as a **hard requirement** for `azure-openai`:
if the configured Azure runtime is unreachable or its credential is missing,
the pipeline step MUST fail visibly (Constitution §VI — observable, auditable
automation) rather than silently falling back to `copilot-default`. This
directly satisfies "predictable LLM provided by me" — the maintainer's explicit
choice is never second-guessed by the orchestrator.

### 6. Cost observability — explicitly out of scope

This ADR enables *configuring* cheaper/pricier models per agent; it does not
add cost *tracking/telemetry*. No such capability exists in the orchestrator
today. Recorded as `ARCH-CONCERN`: a future spec (via BA Agent) + its own ADR
would be needed for token/cost metering per agent-run, surfaced on the
dashboard (subject to Constitution §IX — dashboard remains read-only).

---

## Consequences

**Positive**
- Closes the exact gap identified in ADR-005 ("users who expected Azure OpenAI
  at v2 release will need to wait for ADR-NNN") — this is that ADR.
- Reuses the existing per-agent routing and credential-by-reference mechanisms
  unchanged; no schema or constitution amendment required.
- Gives the maintainer a predictable, self-hosted model provider and a
  cost/capability lever per agent, without introducing a new configuration
  system.

**Negative / Trade-offs**
- The generalized OpenAI-compatible dispatch step is now parameterized rather
  than hardcoded, slightly increasing workflow-YAML complexity (mitigated: it
  is one shared step, not N new workflow files).
- API-key-only auth is simpler but weaker than AAD/managed identity; orgs with
  stricter key-rotation policies must manage `AZURE_OPENAI_API_KEY` rotation
  themselves until a future ADR adds AAD support.

**Risks**
- *Risk*: A consuming project points `azure-foundry-*` entries at a
  decommissioned or quota-exhausted Azure deployment, causing hard pipeline
  failures with no fallback (by design, per §5 above).
  *Mitigation*: Documented explicitly in `docs/AGENT_PROTOCOL.md` and the
  `src/runtimes.yml` header comment as the intended, predictable behaviour —
  not a bug.
- *Risk*: Azure API version drift (`api_version` parameter) breaks the
  contract silently.
  *Mitigation*: `api_version` is an explicit, visible config value (not
  defaulted in code), so upgrades are a deliberate config change reviewed like
  any other.

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| Ship a brand-new parallel workflow fleet (`azure-agent-<slug>.yml` × N agents) | Fully isolated from Copilot path | Triples workflow-file maintenance surface; duplicates ADR-003's logic | Violates Constitution §VII (Simplicity/YAGNI) |
| Require Azure AD / managed identity auth from day one | Stronger security posture | New auth dependency, more setup friction, breaks Constitution §V zero-config default | Deferred as `ARCH-CONCERN`, not blocking |
| Add a dedicated `model_by_agent` config block distinct from `agent_defaults` | Slightly more explicit intent | Duplicates FR-008's existing mechanism; two ways to do the same thing | Existing `agent_defaults` + multiple named runtimes already covers it |
| Leave `azure-openai` reserved; tell the user to keep using `copilot-default` | Zero new work | Directly contradicts the issue's explicit ask and the Azure subscription already provisioned | Rejected — issue is a legitimate, anticipated request per ADR-005 |

---

## Follow-Up Work (not covered by this ADR)

1. **Developer Agent**: implement `runtimes/azure-openai.js`, generalize the
   dispatched-workflow HTTP step, add `azure-openai` to `ENABLED_KINDS` in
   `runtime-registry.js`, add tests (mirrors ADR-005 step 4).
2. **BA/Product Agent**: issue #332 is currently labelled `status:needs-info`
   with no acceptance criteria — a formal spec (`specs/332-.../spec.md`) is
   still required to pin down concrete deployment names, which agents map to
   which tier, and rollout acceptance scenarios. This ADR fixes the
   *architecture*; it does not substitute for that spec.
3. **Docs Agent**: update `docs/AGENT_PROTOCOL.md` and `src/runtimes.yml`
   header comments to document the new supported kind and the per-agent
   cost-tiering example above.
4. **Security Agent**: review the generalized dispatch step and the new
   `AZURE_OPENAI_API_KEY` secret handling before merge.

---

## References

- Issue #332 (this decision) and #326 (root cause, pipeline failure)
- `docs/architecture/adr-005-pluggable-runtime-registry-interface.md` — kind
  allowlist and the reserved-kind enablement process this ADR exercises
- `docs/architecture/adr-003-copilot-workflow-github-models-migration.md` —
  existing OpenAI-compatible dispatch pattern being generalized
- `docs/architecture/adr-006-dual-runtime-source-of-truth-and-sync.md` —
  `src/runtimes.yml` as canonical, per-project source of truth
- `engine/orchestrator/runtime-registry.js`, `engine/orchestrator/schemas/runtimes.schema.json`
- Constitution §V (Reusability/Zero-config), §VI (Observable automation),
  §VII (Simplicity/YAGNI), §IX (Dashboard read-only)
