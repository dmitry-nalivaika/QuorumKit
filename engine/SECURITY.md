# APM Engine — Security & Permissions

> **Audience:** consumer-repo maintainers wiring `uses: dmitry-nalivaika/agentic-dev-stack/engine@<sha>` into a workflow, and APM contributors changing engine behaviour.

This document is the security contract of the APM engine Action. It is
authoritative for FR-014, ADR-047 amendment §4, and SEC-MED-001. Every
permission the engine consumes MUST appear in the table below with a
written justification; reviewers reject changes that broaden the table
without a paired spec amendment.

---

## 1. Default permission posture

The engine declares **zero** permissions in `engine/action.yml`. Permissions
are granted at the **call site** by each consumer workflow. The minimum
viable token for a feature pipeline is:

```yaml
permissions:
  contents: read         # default — required for actions/checkout
  issues: write          # post audit comments, update labels
  pull-requests: write   # comment on PRs and update review state
  actions: read          # read workflow_run payloads
```

The engine **MUST NOT** be invoked with `permissions: write-all`.
`installer/init.sh --upgrade` (T-20) refuses to broaden the consumer's
existing `permissions:` block.

---

## 2. Per-scope justification table

| Scope                  | Default access | Why the engine needs it                                                                                                                | When to omit                                                  |
| ---------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `contents: read`       | required       | `actions/checkout` reads the consumer repo to load `.apm/pipelines/`, `.apm/agents/`, and other SoT files.                              | never — without this the engine cannot start.                 |
| `contents: write`      | **off**        | Only enable for consumer pipelines that include a step writing files via the orchestrator (e.g. dashboard regen). Most pipelines don't. | default — keep `contents: read`.                              |
| `issues: write`        | required       | Post audit comments (FR-026, ADR-002), `<APM-LIVE-STATUS>` updates, and label changes that drive the state machine.                     | only if the consumer does not use issue-driven pipelines.     |
| `pull-requests: write` | required       | Comment on PR threads, update review labels, and post timeline reconstructions.                                                          | only if the consumer disables PR-triggered pipelines.         |
| `actions: read`        | required       | Read `workflow_run` payloads to recover issue context (ADR-007 §6) and to re-correlate audit comments after agent failures.             | only if the pipeline never depends on `workflow_run` events.  |
| `actions: write`       | **off**        | Never required by the engine itself. Forbid in consumer workflows unless a custom step explicitly needs `gh workflow run` capability.    | always — no engine code path requests it.                     |
| `id-token: write`      | release-only   | Used **only** by the engine's own release workflow (`engine-release.yml`) for OIDC-trusted npm publishing. Never granted to consumer workflows. | always for consumers.                                       |
| `packages: read/write` | **off**        | The engine does not pull or push packages from `ghcr.io`.                                                                                | always — keep off.                                           |
| `deployments: write`   | **off**        | The engine never creates a Deployment resource.                                                                                          | always — keep off.                                           |
| `security-events: write` | **off**       | Code scanning / Dependabot is enforced by `dependabot.yml` and the GitHub-hosted scanners, not by the engine.                            | always — keep off.                                           |

---

## 3. Threat model snapshot (SEC-MED-001 / SEC-HIGH-001)

| Threat                                                          | Mitigation                                                                                                                                       | Tracked in                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Compromised third-party `uses:` ref                             | All third-party Actions SHA-pinned (FR-031, M9 mirror gate). Dependabot opens PRs for tag→SHA rotation.                                            | `installer/verify-mirror.sh` M9       |
| Untrusted YAML in `.apm/pipelines/**` deserialising arbitrary code | `yaml.load` pinned to `CORE_SCHEMA`; tag-aware loaders banned. Negative test: `engine/tests/api-version.test.js` `!!js/function` case.            | FR-013, T-10                          |
| Pipeline declares `apiVersion` newer than the pinned engine     | `assertApiVersionSupported` fails fast with a remediation message naming both versions.                                                          | FR-013, T-10                          |
| Workflow run with `permissions: write-all` (CWE-732 over-grant) | `installer/init.sh --upgrade` refuses to widen `permissions:` blocks; engine itself requests nothing.                                            | FR-024, SEC-MED-002, T-20             |
| Long-lived `NPM_TOKEN` in repo secrets                          | Release workflow uses **OIDC trusted publishing + `npm publish --provenance`**; no `NPM_TOKEN` ever written to env.                              | SEC-HIGH-001, T-12                    |
| Tampered release artefact                                       | Signed `v*` tags + SLSA build provenance attached by `npm publish --provenance`. Verifying key documented in `engine/RELEASING.md`.              | SC-009, SEC-MED-004, T-12, T-23       |
| Engine-bundle drift (unreviewed `dist/` change)                 | `engine-build-gate.yml` rebuilds via `ncc` on every PR touching `engine/**` and fails if `git diff --quiet engine/dist/` is non-empty.            | FR-009, T-09                          |

---

## 4. Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository
(<https://github.com/dmitry-nalivaika/agentic-dev-stack/security>) — do **not** open a
public issue. The Security Agent owns triage SLA and CVE assignment per
`SECURITY.md` at the repo root.

---

## 5. Change-control rules

1. **Adding a permission scope to the table above** requires a paired
   spec change (`specs/047-repo-topology/spec.md` or a successor) and
   Security Agent sign-off on the PR.
2. **Removing a scope** requires a deprecation note in `CHANGELOG.md`
   and a major-version bump if any documented consumer pipeline used it.
3. **Tag-aware YAML loading is forbidden** — any reintroduction of
   `yaml.load(raw)` without `{ schema: yaml.CORE_SCHEMA }` (or stricter)
   is a Security Agent veto.
