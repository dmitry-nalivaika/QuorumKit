# QuorumKit Engine — Release Procedure

> **Audience:** maintainers cutting a release of `engine/`. Contributors should not need to read this.

This document is the operational counterpart to `engine/SECURITY.md` and
the authoritative procedure referenced by FR-010, FR-028, SEC-MED-004,
and SC-009 in `specs/047-repo-topology/spec.md`.

The engine ships through **two channels**, both released atomically from
the same `engine/` source on every signed `v*` tag:

1. **GitHub Action ref** — consumers pin via
   `uses: dmitry-nalivaika/quorumkit/engine@vX.Y.Z` (or `@vX` for floating major).
2. **npm package `quorumkit-engine`** — published with `--provenance` via
   OIDC trusted publishing (no `NPM_TOKEN`).

---

## 1. Release prerequisites (one-time setup)

| Setup task | Where | Who |
|---|---|---|
| Maintainer GPG key registered with GitHub & in the local keyring | `gpg --import` + `git config user.signingkey <FPR>` + `gpg --export <FPR>` uploaded to GitHub | Maintainer |
| `release` GitHub Environment with required-reviewer protection rule | Repo Settings → Environments → `release` | Maintainer (admin) |
| npm "Trusted Publisher" mapping for `quorumkit-engine` | <https://www.npmjs.com/package/quorumkit-engine/access> → Trusted Publishers → add this repo + workflow `engine-release.yml` | Maintainer + npm package owner |
| Branch-protection on `main` requires PR + verify-mirror green | Repo Settings → Branches → `main` | Maintainer (admin) |

If any of these are missing, the release workflow fails fast — you never
publish a half-configured artefact by accident.

---

## 2. Release procedure (per release)

```bash
# 1. Make sure you are on a clean main with the new engine source committed.
git checkout main && git pull --ff-only
bash installer/verify-mirror.sh                       # M1–M9 must be green
(cd engine/orchestrator && npm test)                  # all engine tests pass
(cd engine && npm ci --ignore-scripts && npm run build)
git status                                            # MUST be clean (dist/ in sync)

# 2. Bump quorumkit.yml (T-25) and CHANGELOG.md (T-24) in a release PR. Get review
#    + Security Agent sign-off. Merge.

# 3. Cut a SIGNED tag at the merge commit on main.
git tag -s v3.0.0 -m "QuorumKit v3.0.0 — three-zone topology + engine distribution"
git push origin v3.0.0

# 4. The engine-release.yml workflow auto-runs:
#       a. git verify-tag — refuses unsigned tags
#       b. rebuild engine/dist/ via ncc — refuses tag → bundle drift
#       c. npm publish --provenance — OIDC, no NPM_TOKEN
#       d. github-script creates the GitHub Release with auto-notes
#    The 'release' Environment requires a maintainer reviewer click before
#    step (c) runs — that is the supply-chain gate.
```

A successful run produces:

- A GitHub Release at <https://github.com/dmitry-nalivaika/quorumkit/releases/tag/vX.Y.Z>.
- An npm package at <https://www.npmjs.com/package/quorumkit-engine/v/X.Y.Z>
  whose page shows the **"Built and signed on GitHub Actions"** provenance
  badge with a link to the workflow run that produced it.
- A signed git tag verifiable with `git verify-tag vX.Y.Z`.

---

## 3. Verifying a release as a downstream user

```bash
# Action ref (what consumer workflows pin):
gh api repos/dmitry-nalivaika/quorumkit/git/refs/tags/vX.Y.Z

# Tag signature:
git fetch --tags
git verify-tag vX.Y.Z

# npm provenance:
npm view quorumkit-engine@X.Y.Z --json | jq '.dist'
# Expect: dist.attestations.provenance is present and signed by the
#         GitHub Actions OIDC issuer for this repository.
```

The maintainer's GPG public key fingerprint is published at
`docs/architecture/adr-047-action-runtime.md` §Verifying-key. Rotate the
fingerprint there — and only there — when the maintainer's signing key
changes.

---

## 4. Floating major-version tag (`v3`)

After every patch / minor release on the `v3.x` series, fast-forward the
floating `v3` tag so consumers pinned to `@v3` automatically receive the
update:

```bash
git tag -fs v3 -m "Track v3.0.1"   # signed, force-update
git push --force origin v3
```

Floating tags are **only** acceptable for first-party QuorumKit Actions inside
`templates/github/workflows/`. Third-party Actions remain SHA-pinned per
FR-031 / mirror gate M9 — Dependabot rotates them.

---

## 5. Rollback

If a release ships a regression:

1. **Yank the npm version** (does not delete; warns installers):
   ```bash
   npm deprecate quorumkit-engine@X.Y.Z "Yanked — see #<issue>; upgrade to X.Y.Z+1"
   ```
2. **Re-publish the prior known-good** as the latest dist-tag:
   ```bash
   npm dist-tag add quorumkit-engine@X.Y.(Z-1) latest
   ```
3. **Move the floating major tag back** so consumers pinned to `@v3`
   pick up the rollback on their next workflow run:
   ```bash
   git tag -fs v3 -m "Rollback to vX.Y.(Z-1)" <good-commit-sha>
   git push --force origin v3
   ```
4. Open an incident issue with the `incident` label so the Incident Agent
   timestamps the postmortem (per `.apm/agents/incident-agent.md`).
5. Cut a fixed `vX.Y.(Z+1)` per §2 once the regression is patched.

`npm unpublish` is **forbidden** — it breaks reproducibility for any
consumer who already pinned to the bad version. Always deprecate + supersede.

---

## 6. Disaster recovery — fallback NPM token (SEC-HIGH-001)

If npm trusted publishing is unavailable (e.g. a registry-side outage or
the maintainer needs to publish from an air-gapped host), and only then,
a fallback token MAY be used under the following constraints:

- **Granular**, package-scoped (`quorumkit-engine` only), publish-only.
- **≤90-day expiry** — never rotated to a longer lifetime.
- Stored in the `release` GitHub Environment **only**; never in repo
  secrets, never in `.env`, never in a maintainer's shell history.
- Rotation owner: the maintainer named in `quorumkit.yml` `owner.npm`.
- Each use of the fallback MUST be paired with a public Security Agent
  comment on the corresponding incident issue.

Removing the fallback token after the trusted-publishing path is restored
is the responsibility of the same maintainer.
