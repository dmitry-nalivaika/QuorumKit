# Azure AI Foundry Runtime Guide

Route agent pipelines to your own **Azure AI Foundry / Azure OpenAI** deployment
instead of the shared `copilot-default` runtime — a predictable, maintainer-controlled
LLM provider with per-agent, cost-aware model selection (Issue #332, [ADR-332][ADR-332]).

This is entirely a **configuration change** in `src/runtimes.yml` — no code
changes, schema changes, or pipeline YAML edits are required.

---

## Why

| Shared default (`copilot-default`) | Your own Azure AI Foundry runtime |
|---|---|
| Routes through GitHub Models — shared, rate-limited, no per-project SLA | Your own Azure subscription — dedicated quota, predictable latency |
| One model for every agent | Different deployments per agent (e.g. a cheap model for `triage-agent`, a stronger one for `dev-agent`) |
| No cost control | You choose model tier per agent for cost/capability trade-offs |

Once configured, a missing credential or unreachable endpoint fails the run
**visibly** — there is no silent fallback to another provider ([ADR-332][ADR-332] §5).

---

## Prerequisites

- An Azure subscription with access to **Azure AI Foundry** (or an Azure OpenAI resource)
- Repository **admin** or **maintain** permission (to add GitHub Actions secrets)
- The Azure CLI (`az`) — optional, only needed for the CLI steps below; the Azure AI Foundry portal covers the same steps

---

## Step 1: Create an Azure AI Foundry resource and deploy a model

You only need to do this once per Azure subscription (or once per environment,
e.g. dev/prod).

### Option A — Azure AI Foundry portal

1. Go to [ai.azure.com](https://ai.azure.com) and sign in with your Azure account.
2. Select **Create new** → **AI Foundry resource** (or use an existing project).
3. Fill in:
   - **Subscription** and **Resource group**
   - **Region** — pick a region that offers the model you want (not all models are available in all regions)
   - **Resource name** — this becomes `<resource>` in the endpoint URL below
4. Once the resource is created, open it and go to **Deployments** → **Deploy model**.
5. Pick a base model (e.g. `gpt-4o`, `gpt-4o-mini`) and give the deployment a name —
   this becomes `<deployment>` in the endpoint URL. Deployment name and base model
   name do not have to match; Azure addresses models **by deployment name**.
6. After deployment finishes, open **Deployments** → your deployment → note:
   - **Target URI** (the endpoint, of the form `https://<resource>.openai.azure.com/openai/deployments/<deployment>`)
   - **Key** (under **Keys and Endpoint** on the resource, not the deployment)
   - **API version** shown in the sample code (e.g. `2024-10-21`)

### Option B — Azure CLI

```zsh
# 1. Create a resource group (skip if you already have one)
az group create --name rg-quorumkit-llm --location eastus

# 2. Create the Azure AI Foundry / Azure OpenAI resource
az cognitiveservices account create \
  --name my-quorumkit-foundry \
  --resource-group rg-quorumkit-llm \
  --kind AIServices \
  --sku S0 \
  --location eastus \
  --custom-domain my-quorumkit-foundry

# 3. Deploy a model to the resource (example: gpt-4o-mini for low-cost agents)
az cognitiveservices account deployment create \
  --name my-quorumkit-foundry \
  --resource-group rg-quorumkit-llm \
  --deployment-name gpt-4o-mini \
  --model-name gpt-4o-mini \
  --model-version "2024-07-18" \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name Standard

# 4. Retrieve the endpoint and key
az cognitiveservices account show \
  --name my-quorumkit-foundry --resource-group rg-quorumkit-llm \
  --query properties.endpoint -o tsv

az cognitiveservices account keys list \
  --name my-quorumkit-foundry --resource-group rg-quorumkit-llm \
  --query key1 -o tsv
```

Repeat the deployment step with a different `--deployment-name`/`--model-name`
(e.g. `gpt-4o` for higher-capability agents) if you want per-agent cost tiering
— see Step 4.

---

## Step 2: Add the API key as a GitHub Actions secret

The Orchestrator resolves credentials **by name only** — never inline a key in
`src/runtimes.yml`.

1. In your repository: **Settings → Secrets and variables → Actions → New repository secret**.
2. Name: `AZURE_OPENAI_API_KEY` (this exact name is required — see [Security note](#security-note) below).
3. Value: the key from Step 1.

```zsh
# Equivalent via gh CLI
gh secret set AZURE_OPENAI_API_KEY --body "<your-key>"
```

---

## Step 3: Register the runtime in `src/runtimes.yml`

Add an entry under `runtimes:` using `kind: azure-openai`:

```yaml
runtimes:
  # ...existing copilot-default / claude-default entries...

  azure-foundry-standard:
    kind: azure-openai
    endpoint: https://<resource>.openai.azure.com/openai/deployments/<deployment>
    credential_ref: AZURE_OPENAI_API_KEY
    model: <deployment-name>
    parameters: { api_version: "2024-10-21" }
```

Replace `<resource>`, `<deployment>`, and `<deployment-name>` with the values
from Step 1. `endpoint` and `model` must match exactly what you deployed —
the Orchestrator validates the endpoint against this file before dispatch
([ADR-332][ADR-332] §7).

`src/runtimes.yml` already ships with commented-out `azure-foundry-mini` /
`azure-foundry-standard` examples — uncomment and adjust them instead of
retyping from scratch.

---

## Step 4: Assign agents to the runtime (optional, cost tiering)

By default every agent uses `default_runtime`. To route specific agents to
your Azure deployment, add entries to `agent_defaults`:

```yaml
default_runtime: copilot-default

agent_defaults:
  triage-agent: azure-foundry-mini       # cheap/fast model for high-frequency, low-stakes work
  docs-agent: azure-foundry-mini
  architect-agent: azure-foundry-standard # stronger model for low-frequency, high-stakes work
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

To switch **all** agents to Azure instead of just a few, set
`default_runtime: azure-foundry-standard` and leave `agent_defaults` empty.

---

## Step 5: Validate before pushing

```zsh
node engine/orchestrator/pipeline-validator-cli.js src/pipelines/*.yml
node engine/orchestrator/regulation-lint.js
```

A clean run produces no output and exits `0`. Commit and push — the
Orchestrator picks up the new runtime on the next qualifying event.

---

## Security note

Only the literal `credential_ref: AZURE_OPENAI_API_KEY` is recognized by the
dispatched workflows; any other value falls back to `secrets.GITHUB_TOKEN`
rather than resolving an arbitrary secret name. `endpoint` must also exactly
match a committed entry in `src/runtimes.yml` — this closes an SSRF /
secret-exfiltration path where a `workflow_dispatch` caller could otherwise
supply an attacker-controlled endpoint or credential name. See
[ADR-332][ADR-332] §7 for the full threat model. Do not rename the secret and
do not point `credential_ref` at anything else — it will silently fall back to
`GITHUB_TOKEN` and your Azure request will fail with an auth error.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `RUNTIME_KIND_NOT_ENABLED` | You used a kind other than `claude`, `copilot`, or `azure-openai`. `bedrock`/`ollama`/`custom` remain reserved. |
| Step fails with an endpoint/credential error even though the secret is set | `endpoint` in `src/runtimes.yml` doesn't exactly match what's dispatched, or `credential_ref` isn't the literal `AZURE_OPENAI_API_KEY` — see [Security note](#security-note). |
| Azure returns 404 on a valid-looking endpoint | The `<deployment>` segment must be the **deployment name**, not the base model name — check **Deployments** in the Azure AI Foundry portal. |
| Azure returns a version error | `parameters.api_version` is out of date — check the current supported version in the Azure AI Foundry portal sample code and update it explicitly (never silently defaulted). |
| Run fails instead of falling back to `copilot-default` | Expected behaviour — [ADR-332][ADR-332] §5 requires visible failure, not silent fallback, so a misconfigured Azure runtime never masks itself as a different provider. |

---

## Related topics

| Resource | What it covers |
|----------|---------------|
| [PIPELINES.md#runtime-registry](PIPELINES.md#runtime-registry) | Runtime resolution precedence (`step` → `agent_defaults` → `default_runtime`) |
| [ADR-005][ADR-005] | Pluggable runtime registry interface and the reserved-kind enablement process |
| [ADR-332][ADR-332] | Full decision record for the `azure-openai` runtime kind, including the threat model |
| [`src/runtimes.yml`](../src/runtimes.yml) | The file you edit — ships with commented-out Azure examples |

[ADR-005]: architecture/adr-005-pluggable-runtime-registry-interface.md
[ADR-332]: architecture/adr-332-enable-azure-openai-runtime-kind.md
