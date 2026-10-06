# Complete Workflow Simulation Guide - All Agents
## Issue #359 - Testing All Azure AI Foundry Integrations

This document provides step-by-step simulation guides for testing all 11 agent workflows with Azure AI Foundry runtime.

---

## Table of Contents

1. [Triage Agent](#1-triage-agent-entry-point)
2. [BA Enrichment Agent](#2-ba-enrichment-agent-issue-refinement)
3. [BA/Product Agent](#3-baproduct-agent-spec-creation)
4. [Developer Agent](#4-developer-agent-implementation)
5. [QA Agent](#5-qa-agent-testing)
6. [Reviewer Agent](#6-reviewer-agent-code-review)
7. [Security Agent](#7-security-agent-security-scan)
8. [Architect Agent](#8-architect-agent-adr-creation)
9. [Release Agent](#9-release-agent-release-management)
10. [Tech Debt Agent](#10-tech-debt-agent-technical-debt)
11. [Docs Agent](#11-docs-agent-pr-documentation)

---

## Prerequisites for All Tests

### 1. Azure AI Foundry Configuration ✅
```yaml
# src/runtimes.yml
default_runtime: azure-foundry-standard

runtimes:
  azure-foundry-standard:
    kind: azure-openai
    endpoint: https://quorum-kit-resource.services.ai.azure.com/openai/v1/responses
    credential_ref: AZURE_OPENAI_API_KEY
    model: gpt-5.2-codex
    parameters: { api_version: "2026-01-14" }
```

### 2. GitHub Secret Configured ✅
```bash
$ gh secret list
AZURE_OPENAI_API_KEY        2026-10-05T17:46:43Z ✅
```

### 3. Branch Status
- Feature branch: `359-agent-inventory-and-invocation-docs`
- Ready to merge to `main`

---

## 1. Triage Agent (Entry Point)

### Trigger Method
**Automatic webhook**: `issues.opened`

### Test Scenario
```bash
# Method 1: Open a real issue
# Go to GitHub UI → Issues → New Issue → "Add feature X"

# Method 2: Manual workflow trigger
gh workflow run copilot-agent-triage.yml \
  --field issue_number=400
```

### Expected Flow
1. **Webhook triggers** workflow immediately
2. **Reads `src/runtimes.yml`** (inputs empty)
3. **Loads azure-foundry-standard config**:
   - Endpoint: `https://quorum-kit-resource.services.ai.azure.com...`
   - Model: `gpt-5.2-codex`
   - Credential: `AZURE_OPENAI_API_KEY`
4. **Calls Azure AI Foundry** with issue title + body
5. **Posts triage comment** with classification
6. **Applies labels**: `triaged`, `type:*`, `priority:*`, `agent:*`

### Verification Steps
```bash
# 1. Check workflow logs
gh run list --workflow=copilot-agent-triage.yml --limit=1
gh run view <run-id> --log

# Look for:
# "Using runtime: azure-foundry-standard"
# "Endpoint: https://quorum-kit-resource.services.ai.azure.com..."
# "Model: gpt-5.2-codex"
# "Credential: AZURE_OPENAI_API_KEY"

# 2. Check Azure AI Foundry portal
# → Your resource → Monitoring → Logs
# → Filter for requests to gpt-5.2-codex deployment

# 3. Check issue
# → Should have triage comment
# → Should have labels applied
```

### Success Criteria
- ✅ Workflow completes without errors
- ✅ Logs show Azure AI Foundry endpoint usage
- ✅ Issue has triage comment
- ✅ Issue has labels: `triaged`, `type:feature`, `priority:medium`, `agent:ba`

---

## 2. BA Enrichment Agent (Issue Refinement)

### Trigger Method
**Orchestrator-driven**: Triggered by ba-enrichment-pipeline when `triaged` + `agent:ba` labels are applied

### Test Scenario
```bash
# Method 1: Via orchestrator (after triage)
# 1. Issue gets triaged with agent:ba label
# 2. Orchestrator automatically triggers ba-enrichment-pipeline
# 3. Pipeline invokes ba-enrich-agent

# Method 2: Manual workflow trigger
gh workflow run copilot-agent-ba-enrich.yml \
  --field issue_number=400
```

### Expected Flow
1. **Orchestrator invokes** workflow via `workflow_dispatch`
2. **Reads `src/runtimes.yml`** (inputs empty from orchestrator)
3. **Loads azure-foundry-standard config**
4. **Reads issue body** and checks for four sections:
   - Proposed Solution
   - Acceptance Criteria
   - Out of Scope
   - Alternatives Considered
5. **Calls Azure AI Foundry** to infer missing sections
6. **Updates issue body** in-place (if successful)
7. **Swaps labels**: Removes `status:needs-info`, adds `status:confirmed`
8. **Posts confirmation comment**

### Verification Steps
```bash
# 1. Check workflow logs
gh run list --workflow=copilot-agent-ba-enrich.yml --limit=1
gh run view <run-id> --log

# 2. Check issue body
# → Should have all four sections filled

# 3. Check labels
# → Should NOT have status:needs-info
# → Should have status:confirmed

# 4. Check Azure AI Foundry logs
# → Should show request with issue body content
```

### Success Criteria
- ✅ Issue body enriched with inferred sections
- ✅ Labels updated (`status:confirmed` added)
- ✅ Confirmation comment posted
- ✅ Azure AI Foundry logs show request

---

## 3. BA/Product Agent (Spec Creation)

### Trigger Method
**Pipeline-driven**: feature-pipeline → ba step

### Test Scenario
```bash
# Manual workflow trigger
gh workflow run copilot-agent-ba.yml \
  --field issue_number=400
```

### Expected Flow
1. **Reads `src/runtimes.yml`** → `azure-foundry-standard`
2. **Reads issue** title + body + labels
3. **Calls Azure AI Foundry** to generate:
   - `spec.md` (user stories, acceptance criteria, success metrics)
   - `plan.md` (implementation plan, constitution check)
   - `tasks.md` (granular tasks with dependencies)
4. **Creates feature branch**: `400-feature-slug`
5. **Creates spec directory**: `specs/400-feature-slug/`
6. **Writes files**: spec.md, plan.md, tasks.md
7. **Commits and pushes** to branch
8. **Opens PR** to `main`
9. **Posts comment** on issue with PR link

### Verification Steps
```bash
# 1. Check workflow logs
gh run list --workflow=copilot-agent-ba.yml --limit=1

# 2. Check branch created
git fetch origin
git branch -r | grep 400-

# 3. Check PR created
gh pr list | grep 400

# 4. Check spec files
gh pr view <pr-number> --json files

# 5. Check Azure AI Foundry
# → Should show large request (spec generation)
```

### Success Criteria
- ✅ Branch created: `400-feature-slug`
- ✅ Spec files created: spec.md, plan.md, tasks.md
- ✅ PR opened to `main`
- ✅ Issue comment with PR link
- ✅ Azure logs show spec generation request

---

## 4. Developer Agent (Implementation)

### Trigger Method
**Pipeline-driven**: feature-pipeline → dev step (after BA complete)

### Test Scenario
```bash
# Manual workflow trigger
gh workflow run copilot-agent-dev.yml \
  --field issue_number=400
```

### Expected Flow
1. **Reads `src/runtimes.yml`** → `azure-foundry-standard`
2. **Reads spec files** from `specs/400-*/spec.md` and `plan.md`
3. **Reads constitution** and agent definition
4. **Calls Azure AI Foundry** to generate:
   - Implementation code
   - Unit tests
   - Documentation updates
5. **Creates/updates feature branch**
6. **Writes files** according to plan
7. **Commits and pushes**
8. **Updates or creates PR**
9. **Posts agent footprint comment** with apm-msg

### Verification Steps
```bash
# 1. Check workflow logs (longest timeout: 90 min)
gh run list --workflow=copilot-agent-dev.yml --limit=1

# 2. Check commits on feature branch
gh pr view <pr-number> --json commits

# 3. Check files modified
gh pr diff <pr-number>

# 4. Check Azure AI Foundry
# → Should show long-running request (code generation)
# → Monitor token usage (code gen is expensive)
```

### Success Criteria
- ✅ Code files created/modified
- ✅ Tests created
- ✅ PR updated with implementation
- ✅ Agent footprint comment posted
- ✅ Azure logs show code generation request

---

## 5. QA Agent (Testing)

### Trigger Method
**Pipeline-driven**: feature-pipeline → qa step (after dev complete)

### Test Scenario
```bash
# Manual workflow trigger
gh workflow run copilot-agent-qa.yml \
  --field issue_number=400
```

### Expected Flow
1. **Reads `src/runtimes.yml`** → `azure-foundry-standard`
2. **Reads spec** and implementation code
3. **Calls Azure AI Foundry** to:
   - Review tests for coverage
   - Generate additional test cases
   - Create integration tests
4. **Runs tests** locally
5. **Generates test report**
6. **Posts comment** with test results
7. **apm-msg outcome**: `success` or `fail` (bounces to dev)

### Verification Steps
```bash
# 1. Check workflow logs (timeout: 60 min)
gh run list --workflow=copilot-agent-qa.yml --limit=1

# 2. Check test results comment
gh issue view 400 --comments

# 3. Check Azure AI Foundry
# → Should show test generation request
```

### Success Criteria
- ✅ Tests reviewed/enhanced
- ✅ Test report posted
- ✅ apm-msg posted with outcome
- ✅ Azure logs show request

---

## 6. Reviewer Agent (Code Review)

### Trigger Method
**Comment-triggered**: `issue_comment` or `pull_request_review_comment`

### Test Scenario
```bash
# Method 1: Post comment on PR
gh pr comment <pr-number> --body "@reviewer-agent review this PR"

# Method 2: Manual trigger
gh workflow run copilot-agent-reviewer.yml \
  --field issue_number=400
```

### Expected Flow
1. **Reads `src/runtimes.yml`** → `azure-foundry-standard`
2. **Reads PR diff** and related files
3. **Calls Azure AI Foundry** to perform code review:
   - Check code quality
   - Identify potential bugs
   - Suggest improvements
   - Verify constitution compliance
4. **Posts review comment** with findings
5. **Does NOT modify code** (analysis only)

### Verification Steps
```bash
# 1. Check workflow logs (timeout: 30 min)
gh run list --workflow=copilot-agent-reviewer.yml --limit=1

# 2. Check review comment
gh pr view <pr-number> --comments

# 3. Check Azure AI Foundry
# → Should show review analysis request
```

### Success Criteria
- ✅ Review comment posted
- ✅ Comments are actionable
- ✅ No code changes (analysis only)
- ✅ Azure logs show request

---

## 7. Security Agent (Security Scan)

### Trigger Method
**Pipeline-driven**: release-pipeline → security step

### Test Scenario
```bash
# Manual workflow trigger
gh workflow run copilot-agent-security.yml \
  --field issue_number=400
```

### Expected Flow
1. **Reads `src/runtimes.yml`** → `azure-foundry-standard`
2. **Scans codebase** for security issues:
   - SQL injection
   - XSS vulnerabilities
   - Hardcoded secrets
   - Dependency vulnerabilities
3. **Calls Azure AI Foundry** to analyze findings
4. **Generates security report**
5. **Posts comment** with severity levels
6. **apm-msg outcome**: `success` (pass) or `fail` (block)

### Verification Steps
```bash
# 1. Check workflow logs (timeout: 45 min)
gh run list --workflow=copilot-agent-security.yml --limit=1

# 2. Check security report comment
gh issue view 400 --comments

# 3. Check Azure AI Foundry
# → Should show security analysis request
```

### Success Criteria
- ✅ Security scan completed
- ✅ Report posted with findings
- ✅ apm-msg posted with outcome
- ✅ Azure logs show request

---

## 8. Architect Agent (ADR Creation)

### Trigger Method
**Comment-triggered**: `issue_comment` when architecture decision needed

### Test Scenario
```bash
# Method 1: Post comment on issue
gh issue comment 400 --body "@architect-agent create ADR for feature X"

# Method 2: Manual trigger
gh workflow run copilot-agent-architect.yml \
  --field issue_number=400
```

### Expected Flow
1. **Reads `src/runtimes.yml`** → `azure-foundry-standard`
2. **Reads issue** and spec
3. **Calls Azure AI Foundry** to generate ADR:
   - Context
   - Decision
   - Consequences
   - Alternatives considered
4. **Creates ADR file**: `docs/architecture/adr-NNN-slug.md`
5. **Opens PR** with ADR
6. **Posts comment** with ADR summary

### Verification Steps
```bash
# 1. Check workflow logs (timeout: 30 min)
gh run list --workflow=copilot-agent-architect.yml --limit=1

# 2. Check ADR file created
gh pr view <pr-number> --json files

# 3. Check Azure AI Foundry
# → Should show ADR generation request
```

### Success Criteria
- ✅ ADR file created
- ✅ PR opened with ADR
- ✅ Comment posted with summary
- ✅ Azure logs show request

---

## 9. Release Agent (Release Management)

### Trigger Method
**Pipeline-driven**: release-pipeline → release step (after QA + security pass)

### Test Scenario
```bash
# Manual workflow trigger
gh workflow run copilot-agent-release.yml \
  --field issue_number=400
```

### Expected Flow
1. **Reads `src/runtimes.yml`** → `azure-foundry-standard`
2. **Gathers release info**:
   - Version number
   - Changelog entries
   - Breaking changes
3. **Calls Azure AI Foundry** to generate:
   - Changelog section
   - Release notes
   - Migration guide (if needed)
4. **Updates CHANGELOG.md**
5. **Creates release tag**
6. **Publishes GitHub release**
7. **Posts announcement comment**

### Verification Steps
```bash
# 1. Check workflow logs (timeout: 45 min)
gh run list --workflow=copilot-agent-release.yml --limit=1

# 2. Check CHANGELOG.md updated
git show HEAD:CHANGELOG.md

# 3. Check release created
gh release list

# 4. Check Azure AI Foundry
# → Should show changelog generation request
```

### Success Criteria
- ✅ CHANGELOG.md updated
- ✅ Git tag created
- ✅ GitHub release published
- ✅ Announcement posted
- ✅ Azure logs show request

---

## 10. Tech Debt Agent (Technical Debt)

### Trigger Method
**Pipeline-driven**: tech-debt-pipeline or manual invocation

### Test Scenario
```bash
# Manual workflow trigger
gh workflow run copilot-agent-tech-debt.yml \
  --field issue_number=400
```

### Expected Flow
1. **Reads `src/runtimes.yml`** → `azure-foundry-standard`
2. **Scans codebase** for tech debt:
   - Code smells
   - Dead code
   - Outdated dependencies
   - TODO comments
3. **Calls Azure AI Foundry** to prioritize findings
4. **Generates refactoring plan**
5. **Creates sub-issues** for each debt item
6. **Posts summary comment**

### Verification Steps
```bash
# 1. Check workflow logs (timeout: 45 min)
gh run list --workflow=copilot-agent-tech-debt.yml --limit=1

# 2. Check tech debt report
gh issue view 400 --comments

# 3. Check sub-issues created
gh issue list --label tech-debt

# 4. Check Azure AI Foundry
# → Should show analysis request
```

### Success Criteria
- ✅ Tech debt scan completed
- ✅ Report posted with priorities
- ✅ Sub-issues created (if needed)
- ✅ Azure logs show request

---

## 11. Docs Agent (PR Documentation)

### Trigger Method
**Automatic webhook**: `pull_request.opened`, `pull_request.synchronize`

### Test Scenario
```bash
# Method 1: Open/update a PR (automatic)
gh pr create --title "Test PR" --body "Testing docs agent"

# Method 2: Manual trigger
gh workflow run copilot-agent-docs.yml \
  --field pr_number=<pr-number>
```

### Expected Flow
1. **PR webhook triggers** workflow
2. **Reads `src/runtimes.yml`** → `azure-foundry-standard`
3. **Analyzes PR diff**:
   - Code changes
   - New APIs
   - Config changes
4. **Calls Azure AI Foundry** to:
   - Identify documentation needs
   - Draft documentation updates
5. **Posts comment** with recommendations or "No changes needed"
6. **Does NOT block PR** (orthogonal quality gate)

### Verification Steps
```bash
# 1. Check workflow logs (timeout: 30 min)
gh run list --workflow=copilot-agent-docs.yml --limit=1

# 2. Check docs recommendation comment
gh pr view <pr-number> --comments

# 3. Check Azure AI Foundry
# → Should show diff analysis request
```

### Success Criteria
- ✅ Docs analysis completed
- ✅ Comment posted (recommendations or "no changes")
- ✅ PR NOT blocked (quality gate only)
- ✅ Azure logs show request

---

## Common Troubleshooting

### 1. Workflow Fails with "401 Unauthorized"
**Cause**: `AZURE_OPENAI_API_KEY` is invalid or expired

**Fix**:
```bash
# Regenerate key in Azure portal
# Update GitHub secret
gh secret set AZURE_OPENAI_API_KEY < azure-key.txt
```

### 2. Workflow Fails with "404 Not Found"
**Cause**: Endpoint URL is wrong or deployment doesn't exist

**Fix**:
```bash
# Verify endpoint in Azure portal
# Update src/runtimes.yml with correct URL
# Verify model deployment name matches
```

### 3. Workflow Fails with "RUNTIME_ENDPOINT is not declared in src/runtimes.yml"
**Cause**: Security check (SEC-HIGH-001) working correctly

**Fix**: This is expected if endpoint is not in `src/runtimes.yml`. Add it if legitimate.

### 4. Workflow Times Out
**Cause**: Azure AI Foundry is slow or unresponsive

**Fix**:
- Check Azure service health
- Monitor quota usage
- Consider increasing timeout in workflow

### 5. Azure Shows No Requests
**Cause**: Workflow is still using GitHub Models (config not applied)

**Fix**:
- Verify `default_runtime: azure-foundry-standard` in `src/runtimes.yml`
- Check workflow logs for "Using runtime: azure-foundry-standard"
- Ensure PR #360 is merged to `main`

---

## Testing Checklist

### Before Testing
- [ ] PR #360 merged to `main`
- [ ] `AZURE_OPENAI_API_KEY` secret configured
- [ ] Azure AI Foundry deployment verified
- [ ] `gpt-5.2-codex` deployment exists

### Test Each Agent
- [ ] 1. Triage Agent (webhook)
- [ ] 2. BA Enrichment Agent (orchestrator)
- [ ] 3. BA/Product Agent (spec creation)
- [ ] 4. Developer Agent (code generation)
- [ ] 5. QA Agent (testing)
- [ ] 6. Reviewer Agent (code review)
- [ ] 7. Security Agent (security scan)
- [ ] 8. Architect Agent (ADR creation)
- [ ] 9. Release Agent (release management)
- [ ] 10. Tech Debt Agent (refactoring)
- [ ] 11. Docs Agent (documentation)

### Verify Azure Integration
- [ ] All workflow logs show Azure endpoint usage
- [ ] Azure AI Foundry logs show requests
- [ ] No workflows fall back to GitHub Models
- [ ] Token usage visible in Azure portal
- [ ] Costs visible in Azure subscription

---

## Expected Results Summary

| Agent | Trigger | Timeout | Expected Outcome |
|-------|---------|---------|------------------|
| triage | webhook | 15 min | Labels + comment |
| ba-enrich | orchestrator | 30 min | Issue body updated |
| ba | pipeline | 60 min | Spec PR created |
| dev | pipeline | 90 min | Code PR created/updated |
| qa | pipeline | 60 min | Test report posted |
| reviewer | comment | 30 min | Review comment |
| security | pipeline | 45 min | Security report |
| architect | comment | 30 min | ADR PR created |
| release | pipeline | 45 min | Release published |
| tech-debt | pipeline | 45 min | Tech debt report |
| docs | webhook | 30 min | Docs recommendations |

**All agents should show Azure AI Foundry endpoint usage in logs** ✅

---

**End of Simulation Guide**
