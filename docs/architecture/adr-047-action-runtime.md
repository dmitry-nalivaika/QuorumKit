# ADR-047 (amendment): Engine Action Runtime — node20 + Bundled `dist/` (SEC-MED-005)

| Field | Value |
|---|---|
| **ADR Number** | 047 (amendment) |
| **Issue** | [#47](https://github.com/dmitry-nalivaika/agentic-dev-stack/issues/47) |
| **Parent ADR** | `docs/architecture/adr-047-repo-topology-and-engine-distribution.md` |
| **Spec** | `specs/047-repo-topology/spec.md` (FR-008, FR-014, FR-031) |
| **Status** | Proposed |
| **Date** | 2026-05-10 |
| **Deciders** | Architect Agent |
| **Resolves** | SEC-MED-005 (Security Agent review, 2026-05-09 — issue #47) |
| **Source** | [issue #47 comment 4410703363](https://github.com/dmitry-nalivaika/agentic-dev-stack/issues/47#issuecomment-4410703363) |

---

## Context

The 2026-05-09 Security Agent review of `specs/047-repo-topology/spec.md`
flagged **SEC-MED-005** ("Action runtime kind not specified"). Composite,
`node20`, and Docker Action runtimes have materially different security
profiles when distributed via `uses:` to consumer repositories:

- **Composite** Actions delegate to bundled steps and inherit each
  sub-Action's surface — supply-chain risk multiplies with every transitive
  `uses:`.
- **Docker** Actions run an arbitrary container image as `root` in the
  consumer's runner, with image-pull risk and noticeable cold-start cost.
- **node20** Actions execute bundled JavaScript directly in the runner with
  the consumer's `GITHUB_TOKEN`. Risk is bounded by what we ship in `dist/`
  and is therefore the easiest of the three to audit and pin.

The parent ADR (ADR-047) selects a reusable GitHub Action as Channel A of
engine distribution but does not pin the runtime kind, the build tool, the
post-install script policy, or the `dist/` commit policy. SEC-MED-005 is the
last open security item before the v3.0.0 release workflow (migration step 8)
can be unblocked.

OWASP Top 10 (2021) categories addressed: **A06** (Vulnerable / Outdated
Components), **A08** (Software & Data Integrity Failures).

## Decision

The reusable GitHub Action published from `engine/` MUST conform to the
following runtime contract:

1. **`runs.using: 'node20'`** in `engine/action.yml`. No composite, no Docker.
2. **Pre-bundled `engine/dist/index.js`** produced by `@vercel/ncc` and
   committed to source control. The Action's `runs.main` MUST point at the
   committed `dist/` artefact; the Action MUST NOT install dependencies at
   runtime.
3. **`npm ci --ignore-scripts`** is the only permitted command for installing
   build-time dependencies in the engine release workflow. No `npm install`,
   no lifecycle scripts, no `postinstall` hooks executed against npm-resolved
   packages.
4. **No runtime cache restore of `node_modules` or `dist/`** in the
   distributed Action. Every published version is fully self-contained in
   the committed `dist/`.
5. **All third-party Actions referenced from `engine/action.yml`** (and any
   workflow under `engine/`) MUST be pinned by 40-character commit SHA,
   per FR-031. Enforcement is the existing M9 mirror check.
6. **Dependabot** MUST track `package-ecosystem: github-actions` for both
   `/` and `/engine/`, plus `package-ecosystem: npm` for `/engine/` so the
   bundled lockfile receives upgrade PRs.

## Rationale

| Decision | Why |
|---|---|
| `node20` over composite | One bundled binary is easier to audit than a chain of `uses:` steps. |
| `node20` over Docker | No image-pull surface; faster cold start; no `root` execution in the runner. |
| Committed `dist/` | Removes the npm registry from the Action's runtime trust boundary; consumers execute exactly the bytes that were code-reviewed at release-tag time. |
| `--ignore-scripts` | A compromised transitive dep cannot run code at our `npm ci` time. Combined with the committed `dist/`, dependency code only runs if it is in our bundle. |
| No runtime cache | Cache poisoning across runs is impossible if no cache is consulted. |
| Dependabot for both ecosystems | SHA pins are inert without a maintenance loop; Dependabot supplies the loop. |

## Consequences

### Positive

- Closes SEC-MED-005 and aligns the engine Action with SLSA L3 build-integrity
  expectations (combined with the OIDC + provenance flow from FR-010).
- Cold-start performance: bundled `dist/` eliminates per-run `npm install` and
  is materially faster than composite or Docker.
- Reproducibility: a release tag points at a single `dist/index.js` blob.

### Negative

- Repository size grows by the bundled artefact (~mid-hundreds of KB,
  acceptable).
- Contributors must remember to rebuild `dist/` when source changes; CI gate
  required (see Implementation Plan §5).
- `@vercel/ncc` is a soft dependency on a specific bundler. Mitigation: the
  bundler is invoked only at release time; swapping it is a release-workflow
  change, not an API change.

### Risks

- `@vercel/ncc` deprecation → replaceable with `esbuild --bundle --platform=node`
  with no impact on the published Action contract.
- Stale `dist/` committed without source change → caught by the CI gate that
  rebuilds and diffs.

## Alternatives Considered

| Option | Pro | Con | Rejected because |
|---|---|---|---|
| **Composite Action** | No bundling step | Each transitive `uses:` is a new supply-chain edge; harder to SHA-pin transitively | Multiplies SEC-HIGH-003 surface |
| **Docker Action** | Hermetic runtime | Image-pull risk; runs as root; slow cold start; harder for consumers behind strict policies | Larger attack surface than `node20` for no benefit our engine needs |
| **`node20` + `npm ci` at runtime** | Smaller repo | Runtime trusts npm registry on every consumer run; defeats SLSA provenance | Fails OWASP A08 |
| **`node20` + cached `node_modules`** | Faster than `npm ci` | Cache poisoning across runs; not a security improvement over committed `dist/` | Strictly worse than committed `dist/` |
| **`node20` + committed `dist/`** *(selected)* | Auditable, fast, hermetic, OIDC + provenance friendly | Requires a build gate and slightly larger repo | Best fit |

## Implementation Plan

These tasks land as part of the parent migration (Issue #47, step 8 — release
workflow). They are listed here so the Developer Agent can encode them in the
forthcoming `tasks.md`. **No engine code is committed under this ADR alone**;
only the runtime contract is fixed.

1. **`engine/action.yml`** declares `runs.using: 'node20'`,
   `runs.main: 'dist/index.js'`, and `permissions:` per FR-014 (per-scope
   table in `engine/SECURITY.md`).
2. **`engine/package.json`** declares an `ncc:build` script that runs
   `ncc build src/index.js -o dist --source-map --license licenses.txt`.
   Release workflow runs `npm ci --ignore-scripts && npm run ncc:build`.
3. **`engine/dist/`** is committed; `.gitignore` does NOT ignore it.
4. **`installer/tests/`** gains a negative-test fixture asserting that
   `verify-mirror.sh` check **M9** fails when an `engine/` workflow uses an
   unpinned third-party Action.
5. **CI gate (`.github/workflows/quality.yml` or successor)** rebuilds
   `engine/dist/` on every PR touching `engine/src/**` and fails if the
   working tree diff is non-empty.
6. **`.github/dependabot.yml`** lists `github-actions` for `/` and `/engine/`
   plus `npm` for `/engine/`. (This file is also required by SEC-HIGH-003 /
   FR-031 already encoded in the spec; landing it now is independently
   useful.)
7. **`engine/RELEASING.md`** documents the deterministic rebuild step and
   the `dist/` commit policy.

## Acceptance Criteria

- [ ] `engine/action.yml` uses `runs.using: 'node20'`.
- [ ] `engine/dist/index.js` is present in source control and reproduces from
      a clean `npm ci --ignore-scripts && npm run ncc:build`.
- [ ] CI gate fails if `engine/dist/` is stale relative to `engine/src/`.
- [ ] No `engine/**.yml` workflow uses a third-party Action without a
      40-char SHA pin (M9 enforces).
- [ ] `.github/dependabot.yml` covers `github-actions` for `/` and `/engine/`
      and `npm` for `/engine/`.
- [ ] Security Agent re-reviews and lifts the SEC-MED-005 finding.

## Cross-References

- Spec: `specs/047-repo-topology/spec.md` (FR-008, FR-013, FR-014, FR-031,
  SC-009, SC-010, SC-011)
- Parent ADR: `docs/architecture/adr-047-repo-topology-and-engine-distribution.md`
- Constitution: Principles V (Reusability), VII (Simplicity), and the
  Security & Privacy Constraints section.
