# ADR-005: Pluggable Runtime Registry — Interface-Only; Per-Kind Adoption Gated by ADR

| Field | Value |
|---|---|
| **ADR Number** | 005 |
| **Issue** | #44 — Orchestrator v2 Design |
| **Status** | Accepted |
| **Date** | 2026-05-08 |
| **Deciders** | Architect Agent |
| **Supersedes** | — |

---

## Context

Spec #44 (FR-007) proposes a runtime registry whose `kind` enum admits
`claude`, `copilot`, `azure-openai`, `bedrock`, `ollama`, and `custom`.

Per Constitution §VII ("No new dependencies without an ADR") and the Architect
Agent Hard Constraints ("ADR is required when a new external dependency is
introduced"), each non-existent runtime kind is a separate dependency decision.
Bundling four new external integrations into one spec PR would:

1. Hide four independent risk profiles (auth model, data residency, SLA, cost,
   maintenance churn) behind a single approval.
2. Create the precedent that future kinds can be added by editing a JSON enum
   without ADR scrutiny.
3. Force the Developer Agent to implement four integrations whose constraints
   have not been individually evaluated.

---

## Decision

**The orchestrator v2 ships a kind-agnostic runtime registry interface and
ships only the two runtime kinds already in production (`claude`, `copilot`).**

All other `kind` values are **reserved names** that MUST NOT be accepted by the
validator until a per-kind ADR is merged.

### Interface contract (frozen)

A runtime entry in `.apm/runtimes.yml`:

```yaml
<runtime-name>:
  kind: <reserved-or-supported-string>   # see registry below
  endpoint: <string-or-${secret-ref}>    # opaque to the orchestrator
  credential_ref: <secret-ref>           # name only; never a value
  model: <string>                        # optional, kind-specific
  region: <string>                       # optional, kind-specific
  parameters: { … }                      # optional free-form, kind-specific
```

The orchestrator itself MUST NOT contain any kind-specific code paths. Each
registered kind delegates to a **runtime adapter** module under
`scripts/orchestrator/runtimes/<kind>.js` that exports a single
`invoke(context)` function. Loading the adapter requires the kind to be present
in the **kind allowlist**.

### Kind allowlist (ships with v2)

| `kind` | Status | Adapter | Authorising ADR |
|---|---|---|---|
| `claude` | **Supported** | `runtimes/claude.js` | ADR-002 (existing path) |
| `copilot` | **Supported** | `runtimes/copilot.js` | ADR-003 (existing path) |
| `azure-openai` | **Reserved** | not shipped | future ADR required |
| `bedrock` | **Reserved** | not shipped | future ADR required |
| `ollama` | **Reserved** | not shipped | future ADR required |
| `custom` | **Reserved** | not shipped | future ADR required |

Reserved kinds: the validator MUST reject `.apm/runtimes.yml` files that use
them with the error `RUNTIME_KIND_NOT_ENABLED: <kind> is reserved; enable
requires a per-kind ADR. See docs/architecture/`. The string is reserved (i.e. a
user cannot register their own `kind: ollama` adapter to bypass the gate)
because the kind name is the public identifier for that integration.

### Process to enable a reserved kind

1. Open an issue.
2. Author ADR-NNN with: dependency review (CVE history, maintenance, license),
   data-handling implications, auth model, cost model, fallback behaviour.
3. Merge the ADR.
4. PR adds `runtimes/<kind>.js` adapter + tests + adds the kind to the
   allowlist.

---

## Consequences

**Positive**
- The v2 architecture (registry, validator, message protocol) can ship without
  taking on four un-vetted external dependencies.
- Each future runtime gets first-class architectural review.
- The "BYO model" promise of issue #44 is preserved: users can already register
  multiple `claude` or `copilot` runtime *instances* with different endpoints
  and per-agent assignments (the multi-runtime acceptance criteria of US-2 are
  satisfied without enabling reserved kinds).

**Negative / Trade-offs**
- Users who expected to plug in Azure OpenAI or Ollama at v2 release will need
  to wait for ADR-NNN. Mitigation: ADR-005 publishes the explicit on-ramp; the
  reserved-kind error message links here.
- The kind-allowlist is an additional moving piece in the validator. Mitigation:
  it is one constant in one file; trivial to test.

**Risks**
- *Risk*: Users patch the allowlist locally to bypass the ADR gate.
  *Mitigation*: This is their right in their own fork; the upstream constraint
  is enforced via CI (validator + Reviewer Agent BLOCKER on allowlist edits
  without a linked ADR).

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| Ship all 4 reserved kinds with v2 (BA spec as-written) | Marketing-friendly | 4 hidden dependency decisions in one PR | Violates Constitution §VII and Architect Hard Constraints |
| Ship only `custom` (escape hatch) | Maximum flexibility | Eliminates all dependency review for user-installed runtimes | Same violation, plus no security boundary |
| Ship none — block FR-007 entirely | Maximally conservative | Blocks the genuinely useful BYO-runtime architecture | Throws out the v2 design baby with the bathwater |
| Ship interface + `claude`/`copilot` only; reserve the rest (chosen) | Architecture lands; per-kind risk gated | Slightly slower path for users wanting Azure/Bedrock | Accepted |

---

## References

- `specs/044-orchestrator-v2-design/spec.md` — FR-007, FR-008, FR-009, US-2
- Constitution §VII (Simplicity / no new dependencies without an ADR)
- Constitution §IV (Dual-AI Compatibility — generalised to N runtimes)
- ADR-003 (existing Copilot runtime via GitHub Models)
- `.apm/agents/architect-agent.md` — "When an ADR is Required"
