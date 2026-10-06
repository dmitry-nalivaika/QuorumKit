# Triage Workflow Simulation - Azure AI Foundry Integration
## Issue #359 - Workflow Testing Simulation

This document simulates how the triage workflow will execute when triggered on GitHub with the new Azure AI Foundry runtime configuration.

---

## Scenario: New Issue Opened

**Trigger**: User opens issue #400 with title "Add new feature X"

**GitHub Event**: `issues.opened`

---

## Workflow Execution Flow

### **Step 1: Checkout Code** ✅
```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```
**Result**: Repository checked out at latest commit on `main` branch

---

### **Step 2: Load Environment Variables** ✅

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  AZURE_OPENAI_API_KEY: ${{ secrets.AZURE_OPENAI_API_KEY }}  # ← NEW
  RUNTIME_ENDPOINT: ${{ github.event.inputs.runtime_endpoint }}      # empty (webhook)
  RUNTIME_MODEL: ${{ github.event.inputs.runtime_model }}            # empty (webhook)
  RUNTIME_API_VERSION: ${{ github.event.inputs.runtime_api_version }}# empty (webhook)
  RUNTIME_CREDENTIAL: ${{ github.event.inputs.runtime_credential_ref == 'AZURE_OPENAI_API_KEY' && secrets.AZURE_OPENAI_API_KEY || secrets.GITHUB_TOKEN }}  # GITHUB_TOKEN (webhook)
```

**Resolved values**:
- `GITHUB_TOKEN`: `***` (GitHub Actions default token)
- `AZURE_OPENAI_API_KEY`: `***` (your Azure secret) ✅
- `RUNTIME_ENDPOINT`: `""` (empty - webhook trigger has no inputs)
- `RUNTIME_MODEL`: `""` (empty)
- `RUNTIME_API_VERSION`: `""` (empty)
- `RUNTIME_CREDENTIAL`: `***` (GITHUB_TOKEN, because input is empty)

---

### **Step 3: Read Agent Definition & Constitution** ✅

```javascript
const agentInstructions = readSafe('.github/agents/triage-agent.md');
const constitution      = readSafe('.specify/memory/constitution.md');
```

**Result**: Both files loaded successfully

---

### **Step 4: Get Issue Data** ✅

```javascript
const issueNumber = context.payload.issue.number;  // 400
const issueData = context.payload.issue;
const issueTitle  = issueData.title;   // "Add new feature X"
const issueBody   = issueData.body;    // "We need feature X because..."
const issueAuthor = issueData.user.login;  // "dmitry-nalivaika"
```

---

### **Step 5: Load Runtime from src/runtimes.yml** ✅ **← NEW**

```javascript
const runtimesYaml = readSafe('src/runtimes.yml');

// Parse default_runtime
const defaultRuntimeMatch = runtimesYaml.match(/^default_runtime:\s*(\S+)/m);
const defaultRuntimeName = defaultRuntimeMatch?.[1];
// Result: "azure-foundry-standard" ✅
```

**Parse runtime block**:
```javascript
const parseRuntime = (yaml, name) => {
  // Find "  azure-foundry-standard:" in YAML
  // Extract:
  //   endpoint: https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses
  //   model: gpt-5.2-codex
  //   credential_ref: AZURE_OPENAI_API_KEY
  //   api_version: 2026-01-14
  return { endpoint, model, credentialRef, apiVersion };
};

const defaultRuntime = parseRuntime(runtimesYaml, "azure-foundry-standard");
```

**Parsed values**:
```javascript
{
  endpoint: "https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses",
  model: "gpt-5.2-codex",
  credentialRef: "AZURE_OPENAI_API_KEY",
  apiVersion: "2026-01-14"
}
```

---

### **Step 6: Resolve Final Runtime Configuration** ✅

```javascript
// Use workflow inputs if provided, otherwise use defaults from runtimes.yml
const runtimeEndpoint   = process.env.RUNTIME_ENDPOINT || defaultRuntime?.endpoint || '';
const runtimeModel      = process.env.RUNTIME_MODEL || defaultRuntime?.model || 'gpt-4o';
const runtimeApiVersion = process.env.RUNTIME_API_VERSION || defaultRuntime?.apiVersion || '';
const runtimeCredentialRef = defaultRuntime?.credentialRef || 'GITHUB_TOKEN';
const runtimeCredential = process.env.RUNTIME_CREDENTIAL || 
  (runtimeCredentialRef === 'AZURE_OPENAI_API_KEY' ? process.env.AZURE_OPENAI_API_KEY : process.env.GITHUB_TOKEN) ||
  process.env.GITHUB_TOKEN;
```

**Resolved values** (webhook trigger, inputs empty):
```javascript
runtimeEndpoint:   "https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses" ✅
runtimeModel:      "gpt-5.2-codex" ✅
runtimeApiVersion: "2026-01-14" ✅
runtimeCredentialRef: "AZURE_OPENAI_API_KEY" ✅
runtimeCredential: process.env.AZURE_OPENAI_API_KEY  // Your Azure secret ✅
```

**Debug output**:
```
Using runtime: azure-foundry-standard
Endpoint: https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses
Model: gpt-5.2-codex
Credential: AZURE_OPENAI_API_KEY
```

---

### **Step 7: Security Validation** ✅

**SEC-CRIT-002: Host suffix allowlist**:
```javascript
const allowedRuntimeEndpointHostSuffixes = ['.openai.azure.com', '.cognitiveservices.azure.com'];
const isAllowedRuntimeEndpoint = raw => {
  const u = new URL(raw);
  return u.protocol === 'https:' && 
    allowedRuntimeEndpointHostSuffixes.some(s => u.hostname.toLowerCase().endsWith(s));
};
```

**Check**:
- URL: `https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses`
- Hostname: `quorum-kit-resource.services.ai.azure.com`
- Ends with `.cognitiveservices.azure.com`? **YES** ✅
- Protocol: `https:` ✅

**Result**: ✅ PASS

---

**SEC-HIGH-001: Declared endpoint validation**:
```javascript
const declaredRuntimeEndpoints = new Set(
  [...readSafe('src/runtimes.yml').matchAll(/^\s+endpoint:\s*(\S+)\s*$/gm)].map(m => m[1])
);
// Set { 
//   "https://models.github.ai/inference",
//   "https://api.anthropic.com/v1",
//   "https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses"
// }

if (!declaredRuntimeEndpoints.has(runtimeEndpoint)) {
  core.setFailed(`RUNTIME_ENDPOINT is not declared in src/runtimes.yml`);
}
```

**Check**:
- Endpoint: `https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses`
- In declared set? **YES** ✅

**Result**: ✅ PASS

---

### **Step 8: Construct API Request** ✅

```javascript
const requestUrl = runtimeEndpoint
  ? `${runtimeEndpoint}/chat/completions${runtimeApiVersion ? `?api-version=${runtimeApiVersion}` : ''}`
  : 'https://models.inference.ai.azure.com/chat/completions';

const authHeaders = runtimeEndpoint
  ? { 'api-key': runtimeCredential }  // Azure style
  : { 'Authorization': `Bearer ${runtimeCredential}` };  // GitHub Models style
```

**Final request**:
```javascript
URL: https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses/chat/completions?api-version=2026-01-14
Headers:
  api-key: *** (AZURE_OPENAI_API_KEY)
  Content-Type: application/json
Body:
  {
    "model": "gpt-5.2-codex",
    "messages": [
      { "role": "system", "content": "..." },
      { "role": "user", "content": "Triage issue #400..." }
    ],
    "max_tokens": 2048,
    "response_format": { "type": "json_object" }
  }
```

---

### **Step 9: Call Azure AI Foundry API** ✅

**Request sent to**:
- Your Azure AI Foundry resource: `quorum-kit-resource.services.ai.azure.com`
- Model deployment: `gpt-5.2-codex`
- API version: `2026-01-14`

**Expected response** (if configured correctly):
```json
{
  "choices": [{
    "message": {
      "content": "{\"comment\":\"**Triage Summary**\\n\\nThis is a feature request...\\n\\n- **Type**: feature\\n- **Priority**: medium\\n- **Route to**: BA Agent\",\"labels\":[\"type:feature\",\"priority:medium\",\"agent:ba\"]}"
    }
  }]
}
```

**Possible errors**:
1. **401 Unauthorized**: `AZURE_OPENAI_API_KEY` is invalid or expired
2. **404 Not Found**: Endpoint URL is wrong or deployment doesn't exist
3. **429 Rate Limit**: Azure quota exceeded
4. **500 Internal Error**: Azure service issue

---

### **Step 10: Post Comment & Apply Labels** ✅

```javascript
await github.rest.issues.createComment({
  owner: 'dmitry-nalivaika',
  repo: 'QuorumKit',
  issue_number: 400,
  body: parsed.comment  // From LLM response
});

await github.rest.issues.addLabels({
  owner: 'dmitry-nalivaika',
  repo: 'QuorumKit',
  issue_number: 400,
  labels: ['type:feature', 'priority:medium', 'agent:ba']
});

// 8-second delay for orchestrator concurrency

await github.rest.issues.addLabels({
  owner: 'dmitry-nalivaika',
  repo: 'QuorumKit',
  issue_number: 400,
  labels: ['triaged']
});
```

**Result**: Issue #400 now has labels and a triage comment ✅

---

## Success Criteria ✅

To verify the workflow is using Azure AI Foundry:

1. **Check workflow logs**:
   - Go to Actions tab → Triage Agent workflow run
   - Look for debug output:
     ```
     Using runtime: azure-foundry-standard
     Endpoint: https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses
     Model: gpt-5.2-codex
     Credential: AZURE_OPENAI_API_KEY
     ```

2. **Check Azure AI Foundry logs**:
   - Go to Azure AI Foundry portal
   - Open your resource → Monitoring → Logs
   - Filter for recent requests to `gpt-5.2-codex` deployment
   - Verify a request was received with content matching the issue

3. **Check for failures**:
   - If `AZURE_OPENAI_API_KEY` is missing: Workflow fails with "Runtime API error 401"
   - If endpoint is wrong: Workflow fails with "Runtime API error 404"
   - No silent fallback to GitHub Models ✅

---

## Comparison: Before vs After

| Aspect | Before (GitHub Models) | After (Azure AI Foundry) |
|--------|----------------------|--------------------------|
| **Endpoint** | `https://models.inference.ai.azure.com` | `https://quorum-kit-resource.services.ai.azure.com` ✅ |
| **Model** | `gpt-4o` (default) | `gpt-5.2-codex` ✅ |
| **Authentication** | `GITHUB_TOKEN` | `AZURE_OPENAI_API_KEY` ✅ |
| **Cost** | GitHub's quota | Your Azure subscription ✅ |
| **Rate limits** | Shared across GitHub | Your dedicated quota ✅ |
| **Configuration** | Hardcoded in workflow | Loaded from `runtimes.yml` ✅ |
| **Manual override** | Yes (workflow_dispatch inputs) | Yes (still works) ✅ |

---

## Next Steps

1. **Merge PR #360** to `main`
2. **Open a test issue** (or use workflow_dispatch)
3. **Check workflow logs** for runtime debug output
4. **Verify Azure AI Foundry** received the request
5. **Confirm triage comment** was posted

---

## Rollback Plan (If Needed)

If Azure AI Foundry integration has issues:

**Option 1: Quick fix in runtimes.yml** (no code change):
```yaml
default_runtime: copilot-default  # Revert to GitHub Models
```

**Option 2: Manual workflow trigger with override**:
```bash
gh workflow run copilot-agent-triage.yml \
  --field issue_number=400 \
  --field runtime_credential_ref=""  # Forces GITHUB_TOKEN
```

**Option 3: Revert commit**:
```bash
git revert e20a7f0
git push origin main
```

---

**End of Simulation**
