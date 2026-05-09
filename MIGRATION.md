# Migration Guide — APM / Agentic Dev Stack → QuorumKit (v3)

This guide documents every breaking change introduced in Issue #67 and tells you
exactly what to update in your consumer project.

> **Wire-format tokens and `.apm/` directory are NOT renamed in this release.**
> `apm-msg`, `apm-state`, `apm-pipeline-state`, and `.apm/` paths are unchanged.
> Existing GitHub Issues with embedded `<!-- apm-state -->` blocks continue to work.

---

## Quick checklist

- [ ] Rename `apm.yml` → `quorumkit.yml` in your project root
- [ ] Update the `name` field inside `quorumkit.yml` from `agentic-dev-stack` to `quorumkit`
- [ ] Update `uses:` paths in your GitHub Actions workflows
- [ ] Update `npm install` / `package.json` dependency name
- [ ] Update VS Code extension command references (if you scripted them)

---

## Before / after reference table

### 1. Consumer configuration manifest

| Before | After |
|--------|-------|
| `apm.yml` (file name) | `quorumkit.yml` |
| `name: agentic-dev-stack` (field inside `apm.yml`) | `name: quorumkit` |

**Action required:**
```bash
mv apm.yml quorumkit.yml
# Then edit quorumkit.yml:
sed -i '' 's/^name: agentic-dev-stack/name: quorumkit/' quorumkit.yml
```

> `installer/init.sh` will exit non-zero with a migration notice if it detects
> `apm.yml` without a corresponding `quorumkit.yml`.

---

### 2. GitHub Actions `uses:` paths

| Before | After |
|--------|-------|
| `uses: dmitry-nalivaika/agentic-dev-stack/engine@v2` | `uses: dmitry-nalivaika/quorumkit/engine@v3` |
| `uses: dmitry-nalivaika/agentic-dev-stack/engine@<sha>` | `uses: dmitry-nalivaika/quorumkit/engine@<sha>` |

**Action required:** Update every `.github/workflows/*.yml` that references the engine:
```bash
grep -rl "dmitry-nalivaika/agentic-dev-stack" .github/workflows/ | \
  xargs sed -i '' 's|dmitry-nalivaika/agentic-dev-stack|dmitry-nalivaika/quorumkit|g'
```

Then re-run the installer to get updated workflow templates:
```bash
bash /path/to/quorumkit/installer/init.sh --upgrade --apply --engine-ref=v3
```

---

### 3. NPM package names

| Before | After |
|--------|-------|
| `npm install apm-engine` | `npm install quorumkit-engine` |
| `"apm-engine": "^2.x"` in `package.json` | `"quorumkit-engine": "^3.x"` |
| `import ... from 'apm-orchestrator'` | `import ... from 'quorumkit-orchestrator'` |

**Action required:**
```bash
npm uninstall apm-engine apm-orchestrator
npm install quorumkit-engine quorumkit-orchestrator
```

---

### 4. VS Code extension

| Before | After |
|--------|-------|
| Extension name: `APM Copilot Bridge` | `QuorumKit Copilot Bridge` |
| Extension ID: `apm-copilot-bridge` | `quorumkit-copilot-bridge` |
| Command: `apm.submitAgentPrompt` | `quorumkit.submitAgentPrompt` |
| Publisher: `apm` | `quorumkit` |
| VSIX file: `apm-copilot-bridge-*.vsix` | `quorumkit-copilot-bridge-*.vsix` |

**Action required:** Uninstall the old extension and install the new VSIX.
If you reference `apm.submitAgentPrompt` in any VS Code tasks or scripts,
update them to `quorumkit.submitAgentPrompt`.

---

### 5. Repository URL / GitHub reference

| Before | After |
|--------|-------|
| `github.com/dmitry-nalivaika/agentic-dev-stack` | `github.com/dmitry-nalivaika/quorumkit` |
| `git clone https://github.com/dmitry-nalivaika/agentic-dev-stack` | `git clone https://github.com/dmitry-nalivaika/quorumkit` |

---

## What did NOT change

The following identifiers are **intentionally frozen** in v3 and will be renamed
in a future release with a dedicated protocol-migration ADR:

| Identifier | Reason frozen |
|-----------|--------------|
| `.apm/` directory | Renaming breaks all consumer `init.sh` installs; requires full migration strategy |
| `apm-msg` (HTML comment token) | Changing breaks existing GitHub Issue state recovery |
| `apm-state` (HTML comment token) | Same — embedded in live Issue bodies |
| `apm-pipeline-state` (HTML comment token) | Same |
| `<!-- apm-state -->` blocks | Same |

---

## Running the installer after migration

```bash
# On an existing project:
mv apm.yml quorumkit.yml
sed -i '' 's/^name: agentic-dev-stack/name: quorumkit/' quorumkit.yml

# Re-run init to pull updated templates:
bash /path/to/quorumkit/installer/init.sh --ai=both

# Or for v2 → v3 workflow upgrade:
bash /path/to/quorumkit/installer/init.sh --upgrade --apply --engine-ref=v3
```

---

## Further help

- Open an Issue at `github.com/dmitry-nalivaika/quorumkit/issues`
- See `CHANGELOG.md` for the full release notes
- See `docs/architecture/adr-067-quorumkit-rebranding.md` for the full rationale
