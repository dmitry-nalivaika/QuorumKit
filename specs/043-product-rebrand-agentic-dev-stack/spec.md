# Spec: Product Rebrand — "APM Dark Factory" → "Agentic Dev Stack" — Issue #43

## Overview

The product is currently labelled **"APM Dark Factory"** throughout the UI, server
output, documentation, and package metadata. "APM" is a Microsoft trademark (Azure
Pipeline Manager / Application Performance Management) and creates confusion about
product identity. "Dark Factory" is a concept used to describe autonomous operation
but is not the product name.

The product's correct brand name is **Agentic Dev Stack** — an autonomous, AI-agent-
driven software development lifecycle stack. This spec covers the full rename across
the codebase: dashboard UI, server console, package files, markdown documentation,
and templates.

The "Dark Factory" *concept* (lights-out autonomous operation) is a valid feature
descriptor and may be retained in explanatory text (e.g. README, DARK_FACTORY_GUIDE.md),
but must not appear as the product's primary name or title.

---

## Brand Decision

| | Old | New |
|---|---|---|
| **Product name** | APM Dark Factory | Agentic Dev Stack |
| **Short form** | APM | ADS |
| **Tagline** | — | *"The software factory that runs itself."* |
| **Concept term** (retained) | Dark Factory | Dark Factory (descriptor only) |

> **Rationale for keeping "Dark Factory" as a descriptor:** The term has established
> meaning in industrial automation ("lights-out factory") and accurately describes
> the autonomous operation mode. It is valuable in guides and README prose but must
> not be the product title.

---

## Scope of Changes

### In Scope

1. **Dashboard UI** (`dashboard/index.html`)
   - `<title>` tag
   - Top-bar logo name (`.tb-logo-name`)
   - Console boot messages (`clog` calls)
   - Browser tab title template (`document.title = ...`)
   - Any hardcoded strings referencing "APM Dark Factory"

2. **Dashboard server** (`dashboard/server.js`)
   - ASCII banner / console startup output

3. **Dashboard package metadata** (`dashboard/package.json`)
   - `description` field

4. **VS Code extension** (`dashboard/extensions/apm-copilot-bridge/`)
   - `package.json` display name and description
   - `extension.js` any hardcoded product name strings

5. **Orchestrator documentation** (`ORCHESTRATOR.md`)
   - All occurrences of "APM Dark Factory" in prose, diagrams, and UI mockups

6. **README.md**
   - Product name in headings and introductory prose
   - "Dark Factory" where used as the product title (not as concept descriptor)

7. **Templates** (`templates/`)
   - Any hardcoded "APM Dark Factory" references in copilot-instructions, CONTRIBUTING, etc.

### Out of Scope

- Renaming the GitHub repository slug (`agentic-dev-stack` is already correct)
- Changing the `DARK_FACTORY_GUIDE.md` file name or its conceptual content
- Updating the `DARK_FACTORY_GUIDE.md` prose that describes the *concept* (not the product name)
- Changing git history, tags, or release names already published
- Logo / icon design assets (no graphic assets currently exist)
- Domain names or external references

---

## User Stories

### US-1: Dashboard displays "Agentic Dev Stack" everywhere

As a **user of the Orchestrator dashboard**, I want the UI to show "Agentic Dev Stack"
as the product name, so that I am not confused by references to a Microsoft product
(APM) or an industrial manufacturing metaphor (Dark Factory) as the product title.

**Acceptance Scenarios:**

- Given the dashboard is loaded in a browser  
  When the page title renders  
  Then `<title>` reads `Agentic Dev Stack — Agent Orchestrator`

- Given the dashboard top-bar is visible  
  When the page is fully loaded  
  Then the `.tb-logo-name` element reads `Agentic Dev Stack`

- Given a project is selected in the dashboard  
  When the browser tab title updates  
  Then it reads `<project-name> — Agentic Dev Stack`

- Given the console panel is initialised  
  When the boot sequence runs  
  Then the first system message reads `🚀  Agentic Dev Stack  v<VERSION>` (not "APM Dark Factory")

- Given the console panel shows the SDLC loop banner  
  When it appears  
  Then it reads `🚀  Agentic Dev Stack — Autonomous SDLC Loop`

### US-2: Server startup output uses new brand name

As a **developer running the local orchestrator server**, I want the terminal output
to display "Agentic Dev Stack" so that there is no confusion about which product is
running.

**Acceptance Scenarios:**

- Given the server is started with `node server.js`  
  When the startup banner is printed  
  Then it reads `Agentic Dev Stack — Orchestrator Server` (not "APM Dark Factory")

### US-3: Package metadata reflects correct product name

As a **consumer of this package**, I want `package.json` files to describe the product
correctly, so that the npm registry, VS Code Marketplace, and tooling display the
right name.

**Acceptance Scenarios:**

- Given `dashboard/package.json` is inspected  
  When reading the `description` field  
  Then it reads `Agentic Dev Stack — real orchestrator backend`

- Given `dashboard/extensions/apm-copilot-bridge/package.json` is inspected  
  When reading `displayName` and `description`  
  Then both reference "Agentic Dev Stack" not "APM Dark Factory"

### US-4: Documentation uses correct product name

As a **contributor reading ORCHESTRATOR.md or README.md**, I want the docs to use
"Agentic Dev Stack" as the product name, so that documentation matches the live
product.

**Acceptance Scenarios:**

- Given `ORCHESTRATOR.md` is opened  
  When searching for "APM Dark Factory"  
  Then zero matches are found; all occurrences are replaced with "Agentic Dev Stack"

- Given `README.md` is opened  
  When reading the product heading and introduction  
  Then the product is introduced as "Agentic Dev Stack"  
  And "Dark Factory" appears only as a *concept descriptor* in explanatory prose,
  never as the product name in a heading or title

---

## Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | All occurrences of the string `APM Dark Factory` in `.html`, `.js`, `.json`, `.md`, `.yml` files under the repository root MUST be replaced with `Agentic Dev Stack` |
| FR-2 | The `<title>` element of `dashboard/index.html` MUST be `Agentic Dev Stack — Agent Orchestrator` |
| FR-3 | The `.tb-logo-name` text in `dashboard/index.html` MUST be `Agentic Dev Stack` |
| FR-4 | The dynamic `document.title` template in `dashboard/index.html` MUST use `— Agentic Dev Stack` as the suffix |
| FR-5 | Console boot messages MUST use `🚀  Agentic Dev Stack` not `🏭  APM Dark Factory` |
| FR-6 | The server startup ASCII banner in `dashboard/server.js` MUST read `Agentic Dev Stack — Orchestrator Server` |
| FR-7 | `dashboard/package.json` description MUST reference `Agentic Dev Stack` |
| FR-8 | The "Dark Factory" concept term MAY remain in explanatory body text but MUST NOT appear in any heading (`#`, `##`), `<title>`, `.tb-logo-name`, or console banner as the product name |
| FR-9 | All template files under `templates/` that reference "APM Dark Factory" MUST be updated to "Agentic Dev Stack" |

---

## Non-Functional Requirements

- **No behaviour change:** This is a pure rename. No logic, routing, API, or agent
  behaviour changes.
- **Zero breaking changes:** Internal identifiers, file paths, environment variables,
  and npm package names are unchanged.
- **Searchability:** After the rename, `grep -r "APM Dark Factory"` across the repo
  MUST return zero matches.

---

## Out-of-Scope / Explicit Exclusions

| Item | Reason |
|---|---|
| `DARK_FACTORY_GUIDE.md` file rename | Conceptual guide; "Dark Factory" here is the concept, not the product |
| Prose in DARK_FACTORY_GUIDE.md | Explains the *concept* of a dark factory; accurate and correct as-is |
| `apm.yml` root config file rename | Internal config identifier; renaming is a breaking change requiring separate ADR |
| npm package name changes | Would break consumers; out of scope for this issue |
| Icon/logo design | No graphic assets exist yet |

---

## Acceptance Checklist (for Developer Agent)

- [ ] `grep -r "APM Dark Factory" .` returns zero results
- [ ] Dashboard `<title>` = `Agentic Dev Stack — Agent Orchestrator`
- [ ] Top-bar `.tb-logo-name` = `Agentic Dev Stack`
- [ ] Dynamic `document.title` suffix = `— Agentic Dev Stack`
- [ ] Console boot banner uses `🚀  Agentic Dev Stack`
- [ ] Server startup banner uses `Agentic Dev Stack — Orchestrator Server`
- [ ] `dashboard/package.json` description updated
- [ ] `dashboard/extensions/apm-copilot-bridge/package.json` updated
- [ ] `ORCHESTRATOR.md` has zero "APM Dark Factory" matches
- [ ] `README.md` product name updated; "Dark Factory" retained only as concept descriptor
- [ ] `templates/` files updated
- [ ] All existing tests pass (no logic changed)

---

## Constitution Compliance

| Principle | Compliant? | Notes |
|---|---|---|
| I. Agent-First Design | ✅ | Pure rename; no agent behaviour changes |
| II. NNN Traceability | ✅ | Tied to GitHub Issue #43; branch: `043-product-rebrand-agentic-dev-stack` |
| III. Spec-Before-Code | ✅ | This spec must be approved before implementation begins |
| IV. Dual-AI Compatibility | ✅ | Template files updated for both Claude and Copilot variants |
| V. Reusability / Zero-Config | ✅ | No new config introduced |
| VI. Observable Automation | ✅ | No automation changes |
| VII. Simplicity / YAGNI | ✅ | Minimal change; no new abstractions |
| VIII. Orchestrator as Single Control Plane | ✅ | Not affected |
| IX. Dashboard Read-Only | ✅ | No write-path changes to dashboard |

---

## Open Questions

_None. The owner confirmed:_
- Scope: main page and everywhere in the solution
- New name: **Agentic Dev Stack** (preferred), no constraints on alternatives
- "APM" context: Microsoft package name, not ours — must be removed as primary brand identifier

---

*Spec authored by BA/Product Agent on 2026-05-08*
