# Tasks: LLM Keys for the Project to Be Configured — Issue #332

Ordered by dependency. TDD: write/confirm failing test before implementation
in every code task.

1. **[test]** Add `describe('runtimes/azure-openai')` block to
   `engine/tests/runtime-adapters.test.js` covering: required permissions
   (no `models` scope), dispatch of `copilot-agent-<slug>.yml` with the four
   new runtime-override inputs, `runtime-credential-missing` on absent
   credential, retry-then-success. Confirm it fails (module doesn't exist yet).
2. **[impl]** Create `engine/orchestrator/runtimes/azure-openai.js` mirroring
   `copilot.js`, passing `runtime_endpoint`, `runtime_model`,
   `runtime_credential_ref`, `runtime_api_version` as extra workflow inputs.
   Confirm task 1 tests pass.
3. **[test]** Update `engine/tests/runtime-registry.test.js`:
   `ENABLED_KINDS` assertion includes `azure-openai`; add a registry-acceptance
   case for an `azure-openai` runtime entry. Confirm it fails.
4. **[impl]** In `engine/orchestrator/runtime-registry.js`, move `azure-openai`
   from `RESERVED_KINDS` to `ENABLED_KINDS`. Confirm task 3 tests pass.
5. **[impl]** Generalize the dispatched-workflow HTTP step in the 9 inline-fetch
   `copilot-agent-*.yml` files (both `.github/workflows/` and
   `src/.github/workflows/`, keeping byte-parity per ADR-006 M5): add the four
   optional `workflow_dispatch.inputs`, the four new `env:` entries, and the
   conditional endpoint/auth-header/model logic in the fetch call. Excludes
   the `copilot-code-action`-based workflows (compliance/digital-twin/incident/
   ot-integration — no fetch call to generalize there).
5b. **[impl]** Generalize `copilot-agent-dev.yml` (both trees) and
    `dev-agent-runner.cjs`'s `runCopilot()` (both `.github/scripts/` and
    `src/.github/scripts/`) the same way, so `dev-agent` can also be assigned
    an `azure-openai` runtime per ADR-332 §4's own worked example
    (`dev-agent: azure-foundry-standard`). Uses `URL()` to split
    `runtime_endpoint` into hostname/path since the runner calls
    `https.request()` directly rather than `fetch()`.
6. **[docs]** Update `src/runtimes.yml` header comment with the `azure-openai`
   worked example (cheaper + stronger deployment tiers).
7. **[docs]** Update `docs/AGENT_PROTOCOL.md` with the new supported kind,
   `AZURE_OPENAI_API_KEY` convention, and the ADR-332 terminology mapping.
8. **[verify]** Run full test suite (`npm test` in `engine/`), run
   `scripts/verify-mirror.sh` (M5 byte-parity), run markdown-link-check on any
   edited `.md` files, confirm all green.
9. **[pr]** Commit atomically per task group, push, open/verify Draft PR
   linked to #332.
