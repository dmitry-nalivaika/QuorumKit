# Implementation Plan: LLM Keys for the Project to Be Configured — Issue #332

## Source of Truth

This plan implements exactly the "Follow-Up Work" item 1 assigned to the
Developer Agent in
[docs/architecture/adr-332-enable-azure-openai-runtime-kind.md](../../docs/architecture/adr-332-enable-azure-openai-runtime-kind.md):

> implement `runtimes/azure-openai.js`, generalize the dispatched-workflow
> HTTP step, add `azure-openai` to `ENABLED_KINDS` in `runtime-registry.js`,
> add tests (mirrors ADR-005 step 4).

ADR-332 fixes the *contract*; this plan fixes the *code*. No new architectural
decisions are made here — where the ADR is silent, the existing `claude.js` /
`copilot.js` adapters and `runtime-registry.js` validator are the pattern to
mirror (per ADR-005's frozen interface contract).

## Constitution Check

| Rule | How this plan satisfies it |
|------|---------------------------|
| No direct commits to `main` | Feature branch: `332-llm-keys-for-the-project-to-be-configure` (already checked out) |
| Tests before implementation | TDD: adapter/registry tests written first (red), then implementation (green), per task list below |
| No hardcoded secrets | `credential_ref` name-only pattern reused unchanged; new convention `AZURE_OPENAI_API_KEY` resolved from `process.env`/GitHub Actions secrets at invocation time only |
| Input validation at boundaries | Runtime registry schema/validator (`runtime-registry.js`, `runtimes.schema.json`) unchanged in shape — `azure-openai` only added to the kind allowlist; adapter validates `credential_ref` presence before dispatch |
| Data access scoping | N/A — no end-user auth boundary; this is maintainer-facing CI configuration |
| Coverage threshold | New unit tests for `runtimes/azure-openai.js` (mirrors `runtime-adapters.test.js` cases for `copilot`/`claude`) and an `ENABLED_KINDS` assertion update in `runtime-registry.test.js`; existing suite must stay green |

## Design

### 1. New adapter: `engine/orchestrator/runtimes/azure-openai.js`

Structurally parallel to `copilot.js` (same `invoke(context)` contract,
`requiredPermissions`, `resolveCredential` helper, retry wrapping via
`withRetry`). Differences:

- `KIND = 'azure-openai'`
- Dispatches the **same** `copilot-agent-<slug>.yml` workflow family (per ADR-332 §1 —
  no fourth parallel workflow fleet), but additionally passes
  `runtime_endpoint`, `runtime_model`, `runtime_credential_ref`, and
  `runtime_api_version` as workflow inputs so the dispatched workflow's
  generalized HTTP step (design §2) routes to Azure OpenAI instead of the
  GitHub Models default.
- `credential_ref` convention: `AZURE_OPENAI_API_KEY` (per ADR-332 §2), but the
  adapter reads whatever `credential_ref` is configured in `src/runtimes.yml`
  (no hardcoding of the env var name in code).
- `requiredPermissions` mirrors `copilot.js` (`contents: read`, `issues: write`,
  `pull-requests: write`) but omits `models: read` (no GitHub Models scope
  needed — the call goes to the maintainer's own Azure endpoint).

### 2. Generalize the dispatched-workflow HTTP step

The 9 `copilot-agent-*.yml` workflows that call
`https://models.inference.ai.azure.com/chat/completions` directly via an
inline `actions/github-script` step are updated identically in both
`.github/workflows/` and `src/.github/workflows/` (ADR-006 §4 M5 byte-parity).

`copilot-agent-dev.yml` is also in scope — it does not have an inline fetch
call, but its `dev-agent-runner.cjs` (iterative agentic loop, RUNTIME_KIND=copilot
branch) makes the *same* hardcoded `models.inference.ai.azure.com` /
`gpt-4o` call via Node's `https` module. ADR-332 §4's own worked example
(`dev-agent: azure-foundry-standard`) requires `dev-agent` to be assignable to
an `azure-openai` runtime like every other agent, so `copilot-agent-dev.yml`
gets the same four new `workflow_dispatch.inputs` + env forwarding, and
`runCopilot()` in `dev-agent-runner.cjs` (both `.github/scripts/` and
`src/.github/scripts/` copies) is generalized the same way, using `URL()` to
split `runtime_endpoint` into hostname/path since `https.request()` takes
those separately (unlike `fetch()`'s single URL argument).

`copilot-agent-compliance/digital-twin/incident/ot-integration.yml` remain out
of scope: they use `github/copilot-code-action` instead of a raw fetch/HTTP
call, so there is nothing to generalize.

For the 9 inline-fetch workflows:

- Add four new **optional** `workflow_dispatch.inputs` (default `''`,
  `required: false`): `runtime_endpoint`, `runtime_model`,
  `runtime_credential_ref`, `runtime_api_version`. Declaring them is required
  because GitHub Actions rejects undeclared `workflow_dispatch` inputs.
- Add corresponding `env:` entries on the `github-script` step:
  `RUNTIME_ENDPOINT`, `RUNTIME_MODEL`, `RUNTIME_API_VERSION`, and
  `RUNTIME_CREDENTIAL` (resolved dynamically via
  `secrets[github.event.inputs.runtime_credential_ref]`, falling back to
  `secrets.GITHUB_TOKEN` when unset/empty).
- Replace the hardcoded `fetch('https://models.inference.ai.azure.com/chat/completions', …)`
  call and `model: 'gpt-4o'` body field with variables that default to the
  exact current behaviour when no runtime override is supplied (issue_comment
  triggers, and existing `copilot.js`-dispatched runs, are unaffected — they
  never populate these inputs):
  - `requestUrl` = `${runtime_endpoint}/chat/completions?api-version=...` when
    `runtime_endpoint` is set, else the existing GitHub Models URL.
  - Auth header = `api-key: <credential>` when `runtime_endpoint` is set
    (Azure OpenAI convention), else the existing `Authorization: Bearer
    <credential>` header.
  - `model` body field = `runtime_model` when set, else `'gpt-4o'` (unchanged
    default).

This is a pure generalization: behaviour is byte-for-byte identical to today
when the four new inputs are absent/empty.

### 3. Registry allowlist

`engine/orchestrator/runtime-registry.js`: move `azure-openai` from
`RESERVED_KINDS` to `ENABLED_KINDS`. No schema change (`runtimes.schema.json`
already supports `model`/`region`/`parameters` per ADR-005).

### 4. Tests

- `engine/tests/runtime-adapters.test.js`: add a `describe('runtimes/azure-openai')`
  block mirroring the existing `copilot`/`claude` cases: required permissions
  (no `models` scope), dispatch inputs include the four runtime overrides,
  `runtime-credential-missing` on absent `AZURE_OPENAI_API_KEY`-style ref,
  retry-then-success behaviour.
- `engine/tests/runtime-registry.test.js`: update the `ENABLED_KINDS` assertion
  to include `azure-openai`; add a case proving `azure-openai` runtime entries
  now pass `validateRegistry` instead of being rejected.

### 5. Documentation (FR-009, ADR-332 Follow-Up item 3)

- `src/runtimes.yml` header comment: note `azure-openai` is now supported, with
  a worked multi-tier example (mirrors the ADR-332 §4 snippet).
- `docs/AGENT_PROTOCOL.md`: document the new supported kind, `credential_ref`
  convention (`AZURE_OPENAI_API_KEY`), and the terminology mapping table from
  ADR-332 (LLM Provider → runtime entry, etc.).

## Out of Scope (per spec + ADR-332)

- Cost/token telemetry (spec Out of Scope; ADR-332 §6 `ARCH-CONCERN`, future work)
- AAD/managed-identity auth (spec Out of Scope; ADR-332 §2)
- Any runtime kind other than `azure-openai` (bedrock/ollama/custom remain reserved)
- Rewriting `copilot-agent-dev.yml`'s iterative agentic-loop *architecture*
  (tool-calling, `signal_outcome`, etc.) — only its LLM-call routing is
  generalized, mirroring the other 9 workflows
- The `copilot-code-action`-based workflows (compliance/digital-twin/incident/
  ot-integration) — no hardcoded fetch/HTTP call exists there to generalize
- `agent-dev.yml` / the `RUNTIME_KIND=claude` branch of `dev-agent-runner.cjs`
  — unrelated to `azure-openai` (Claude routes through Anthropic only)
