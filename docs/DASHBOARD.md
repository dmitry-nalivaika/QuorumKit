# QuorumKit Dashboard — Complete Guide

> **The QuorumKit Dashboard** is the local browser interface for monitoring and
> steering your QuorumKit agents. It surfaces all 15 AI agents as live cards,
> streams their output in real time, and gives you a Kanban board view of the
> full SDLC pipeline — all from one browser tab.
>
> **Not to be confused with the GitHub Actions Orchestrator**, which drives
> agent chains in CI. See [`PIPELINES.md`](PIPELINES.md) for that system.

---

## Table of Contents

1. [What the Dashboard Is](#1-what-the-dashboard-is)
2. [Architecture Overview](#2-architecture-overview)
3. [Prerequisites](#3-prerequisites)
4. [Installing QuorumKit into Your Project](#4-installing-quorumkit-into-your-project)
5. [Launching the Dashboard](#5-launching-the-dashboard)
6. [Connecting a Project (Manual Override)](#6-connecting-a-project-manual-override)
7. [The Dashboard UI](#7-the-dashboard-ui)
8. [Running Agents](#8-running-agents)
9. [The Board — Live Agent Status](#9-the-board--live-agent-status)
10. [The Console](#10-the-console)
11. [Offline / Simulation Mode](#11-offline--simulation-mode)
12. [Worked Example — "Todo API" from Zero to Deployed](#12-worked-example--todo-api-from-zero-to-deployed)
13. [Configuration Reference](#13-configuration-reference)
14. [API Reference](#14-api-reference)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)
16. [Known Limitations](#16-known-limitations)
17. [Troubleshooting](#17-troubleshooting)
18. [Related Topics](#18-related-topics)

---

## 1. What the Dashboard Is

The dashboard is a two-part local system:

| Part | File | What it does |
|------|------|--------------|
| **Backend server** | `engine/dashboard/server.js` | Node.js HTTP + WebSocket server. Spawns agent processes, streams their output in real time, opens native terminal windows, and manages project configuration. |
| **Dashboard UI** | `engine/dashboard/index.html` | Single-page app served by the backend. Displays all 15 agents as cards, a live console, a Kanban board, and a settings modal. |

The two parts communicate over **WebSocket** (`ws://localhost:3131`). When the server
is not running, the UI degrades gracefully to a built-in simulation mode — you can
open `index.html` as a plain file and still explore every agent.

> **Constitution note (Principle IX):** The dashboard is the project's primary
> observability surface. Agent invocation features (§8) exist for local development
> convenience; in production pipelines, agents are triggered exclusively through
> the GitHub Actions Orchestrator (see [`PIPELINES.md`](PIPELINES.md)).

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser  (http://localhost:3131)                               │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Agent Grid  │  │  Console /   │  │  ⚙ Settings Modal     │ │
│  │  15 cards    │  │  Board /     │  │  (project path,        │ │
│  │  status dots │  │  About tabs  │  │   AI tool, terminal)   │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────────┘ │
│         │                 │  WebSocket (ws://localhost:3131)     │
└─────────┼─────────────────┼──────────────────────────────────────┘
          │                 │
┌─────────▼─────────────────▼──────────────────────────────────────┐
│  engine/dashboard/server.js  (Node.js, port 3131)                │
│                                                                   │
│  HTTP routes          WebSocket broadcast                        │
│  GET  /               → serves index.html                        │
│  GET  /api/config     → read project config                      │
│  POST /api/config     → write project config                     │
│  POST /api/invoke     → spawn agent process ──────────┐          │
│  POST /api/terminal   → open native terminal window   │          │
│  POST /api/stop       → SIGTERM agent process         │          │
│  GET  /api/log/:id    → per-agent log history         │          │
└───────────────────────────────────────────────────────┼──────────┘
                                                        │
              ┌─────────────────────────────────────────┘
              │  child_process.spawn()
              ▼
    ┌─────────────────────────────────────┐
    │  AI Agent Process                   │
    │  e.g. claude --system-prompt        │
    │       src/skills/qa-agent/SKILL.md  │
    │       --cwd /your/project           │
    │                                     │
    │  stdout/stderr → streamed over WS   │
    └─────────────────────────────────────┘
              │
              ▼  opens
    ┌──────────────────────┐
    │  Native Terminal     │
    │  (iTerm2 / Terminal  │
    │   / Warp / gnome-    │
    │   terminal / wt)     │
    └──────────────────────┘
```

**Data flow for a single invocation:**

```
User clicks ▶ Invoke
  → Browser POST /api/invoke {agentId, agentName}
  → server.js spawns:  claude --system-prompt <skill.md> --cwd <localPath>
  → process stdout/stderr lines arrive
  → server broadcasts WS message: {type:"log", agentId, level, msg}
  → browser appends log line to Console
  → server broadcasts: {type:"agentStatus", agentId, status:"running"}
  → browser turns card green, dot pulses
  → process exits 0
  → server broadcasts: {type:"agentStatus", agentId, status:"done"}
  → server broadcasts: {type:"kanban", action:"move", col:"done"}
  → browser moves Kanban card to Done column
```

---

## 3. Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | ≥ 18 | `node --version` |
| npm | ≥ 9 | `npm --version` |
| git | any | `git --version` |
| An AI CLI tool | any | `claude --version` *or* VS Code with Copilot |
| A project repository | — | local folder, with or without `.git` |

The dashboard has **one npm dependency** ([`ws`](https://github.com/websockets/ws)). The first `start.sh` run installs it automatically.

The dashboard works with both:

- **Greenfield projects** — a fresh directory you just `git init`ed.
- **Brownfield projects** — an existing repo with code, history, CI, and conventions you want to preserve.

Install QuorumKit **into your project**, then launch the dashboard **from your project directory**. The dashboard auto-detects the project name, git remote, and current branch — no manual configuration needed for the common case.

---

## 4. Installing QuorumKit into Your Project

Run this once per project. The installer is idempotent — re-running it is safe and never overwrites existing files.

### 4.1 — Get the QuorumKit package

Clone the package to any stable location on your machine. It does **not** need to live inside your project.

```zsh
# A reasonable home for the QuorumKit package:
git clone https://github.com/quorumkit/quorumkit.git ~/.quorumkit
```

> Any path works — `~/Documents/Projects/quorumkit`, `~/code/quorumkit`, etc. Note the path; you'll reference it as `~/.quorumkit` in commands below.

### 4.2 — Run `init.sh` from inside your project

Navigate to your project root, then run the installer:

```zsh
# Greenfield: create and initialise a new project
mkdir -p ~/projects/my-new-app && cd ~/projects/my-new-app
git init

# Brownfield: use an existing project
cd ~/work/legacy-billing-service
```

From your **project root**, run the installer once:

```zsh
bash ~/.quorumkit/scripts/init.sh                                # Claude Code (default)
bash ~/.quorumkit/scripts/init.sh --ai=copilot                   # GitHub Copilot
bash ~/.quorumkit/scripts/init.sh --ai=both                      # Both runtimes
bash ~/.quorumkit/scripts/init.sh --ai=both --domain=industrial  # Both + industrial agents
```

The script writes the following files into your project:

| Path | Purpose |
|------|---------|
| `.claude/agents/*.md` | Claude agent role definitions (when `--ai=claude` or `both`) |
| `.claude/skills/*/SKILL.md` | Slash-command skill definitions for Claude |
| `.github/agents/*.md` | Shared agent role definitions for Copilot (when `--ai=copilot` or `both`) |
| `.github/instructions/*.instructions.md` | Per-agent Copilot custom instructions |
| `.github/copilot-instructions.md` | Workspace-level Copilot context |
| `.github/workflows/agent-*.yml` | GitHub Actions workflows that invoke agents on PR/issue events |
| `.github/ISSUE_TEMPLATE/*` | Bug, feature, and security report templates |
| `.github/pull_request_template.md` | PR template pre-wired to the Reviewer Agent |
| `CLAUDE.md` | Workspace-level Claude context (created only if missing) |
| `CONTRIBUTING.md`, `SECURITY.md` | Community files (created only if missing) |
| `BROWNFIELD_GUIDE.md`, `DARK_FACTORY_GUIDE.md`, `ENHANCEMENTS.md` | Reference documentation |

> **Brownfield safety:** the script never overwrites an existing `CLAUDE.md`, PR template, issue template, workflow, or instruction file. If one already exists, the installer skips it and prints `⚠ already exists — skipping`. Diff and merge by hand afterward if you want the updated content.

### 4.3 — Verify the install

```zsh
ls .claude/agents 2>/dev/null | head             # Claude agents present?
ls .github/agents 2>/dev/null | head             # Copilot agents present?
ls .github/workflows | grep -E '^(copilot-)?agent-' | head
```

If the directories contain `.md` and `.yml` files, you're ready to launch the dashboard.

---

## 5. Launching the Dashboard

The dashboard picks up project context **automatically** when you launch it from inside the project directory.

### 5.1 — Recommended: run `start.sh` from your project root

```zsh
cd ~/work/legacy-billing-service
bash ~/.quorumkit/engine/dashboard/start.sh
```

`start.sh` captures `$PWD` into `QUORUMKIT_PROJECT_DIR` *before* `cd`-ing into the dashboard folder, then passes it to the server. The server uses that path as the default `localPath`, runs `git config --get remote.origin.url` and `git rev-parse --abbrev-ref HEAD` to populate **GitHub Repository URL** and **Default Branch**, and derives the **Project Name** for the topbar pill and browser tab title.

The terminal echoes the detected context before the server starts:

```
  QuorumKit Dashboard — Server
  Project: /Users/alice/work/legacy-billing-service
```

When the dashboard opens at `http://localhost:3131`, the topbar shows:

```
🏭 QuorumKit   📁 legacy-billing-service   ● 0 active   15 agents   …   ⚙
```

You can invoke any agent immediately without opening Settings.

### 5.2 — Optional: shell alias

If you orchestrate several projects, a shell alias saves typing:

```zsh
# Add to ~/.zshrc or ~/.bashrc
alias qk='bash ~/.quorumkit/engine/dashboard/start.sh'
```

Then from any project: `cd ~/work/foo && qk`.

### 5.3 — Custom port

```zsh
QUORUMKIT_PORT=4000 bash ~/.quorumkit/engine/dashboard/start.sh
```

### 5.4 — Override the auto-detected project

The auto-detected values are always editable from **⚙ Settings** in the UI, or by passing `QUORUMKIT_PROJECT_DIR` explicitly at launch:

```zsh
QUORUMKIT_PROJECT_DIR=~/work/some-other-repo bash ~/.quorumkit/engine/dashboard/start.sh
```

### 5.5 — Verify the server is up

```zsh
curl http://localhost:3131/api/config
```

```json
{
  "localPath":   "/Users/alice/work/legacy-billing-service",
  "repoUrl":     "git@github.com:alice/legacy-billing-service.git",
  "branch":      "main",
  "projectName": "legacy-billing-service",
  "aiTool":      "claude"
}
```

The topbar **● live** badge (green) confirms the WebSocket is connected. **● offline** (amber) means the server is unreachable.

---

## 6. Connecting a Project (Manual Override)

The dashboard auto-detects the project on launch (see §5). Use this section only if:

- The auto-detected values are wrong (e.g. you launched from a parent directory).
- You want to change the AI tool, terminal app, or VS Code app for this project.
- You are switching the running dashboard between two projects without restarting it.

Click **⚙** (top-right) to open Settings.

### Settings fields

| Field | What to enter | Auto-detected? | Example |
|-------|--------------|----------------|---------|
| **Local Project Path** | Absolute path to the project root on disk. Agents run from here. | ✅ from `$PWD` at launch | `/Users/alice/work/legacy-billing-service` |
| **GitHub Repository URL** | Full URL of the repository. | ✅ from `git config remote.origin.url` | `git@github.com:alice/legacy-billing-service.git` |
| **Default Branch** | Main integration branch. | ✅ from `git rev-parse --abbrev-ref HEAD` | `main` |
| **AI Tool** | Which AI CLI to invoke. See table below. | ❌ user choice | `Claude Code` |
| **Custom Command** | Template string used when AI Tool = "Custom". | ❌ | `aider --model gpt-4o --cwd {cwd}` |
| **Terminal App** | Which app to open when you click "⬜ Terminal". | ✅ first installed of iTerm/Warp/… | `iTerm2` |

### AI Tool options

| Option | What the server runs | Best for |
|--------|---------------------|---------|
| **Claude Code** | `claude --system-prompt <skill.md> --cwd <localPath>` | Claude Code users (most autonomous) |
| **GitHub Copilot** | `code <localPath>` (opens VS Code) | Copilot workspace users |
| **Custom** | Your template, with tokens replaced | Aider, Continue, GPT-4o, etc. |
| **Shell only** | `cat <agent.md> && bash` | Exploring agents or manual use |

#### Custom command tokens

| Token | Replaced with |
|-------|--------------|
| `{agent}` | Agent short ID (e.g. `qa`) |
| `{agentName}` | Agent full name (e.g. `QA/Test Agent`) |
| `{skill}` | Absolute path to the agent's `SKILL.md` |
| `{cwd}` | Absolute path to your project (localPath) |

**Example — Aider with GPT-4o-mini:**
```
aider --model gpt-4o-mini --read {skill} --cwd {cwd}
```

Click **Save & Connect** to apply. The server writes the configuration to `engine/dashboard/.apm-project.json` (inside the QuorumKit package, not your project) and broadcasts the updated config to all connected browser tabs.

---

## 7. The Dashboard UI

```
┌────────────────────────────────────────────────────────────────────┐
│ 🏭 QuorumKit            ● 0 active  15 agents  v2.0.0  ⚙  `      │  ← topbar
├────────────────────────────────────────────────────────────────────┤
│ 🔍 Search…   All agents  🌐 Universal  🏭 Industrial        15 ag │  ← toolbar
├─────────────────── agent grid (scrollable) ────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │ 📋 BA Agent │  │ 💻 Dev Agent│  │ 🔬 QA Agent │  …            │
│  │ ● Idle      │  │ ⚡ Working  │  │ ● Idle      │               │
│  │ "I ask why" │  │ "Ships…"   │  │ "Bug whis…" │               │
│  │ ▶ Invoke   │  │ ▶ Invoke   │  │ ▶ Invoke   │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
├────────────────────────────────────────────────────────────────────┤
│ 💻 Console   📋 Board   ℹ️ Stack               ▼ (collapse)       │  ← drawer
│ [08:42:11] [QA/TEST AGENT ] Running test suite…                   │
│ ❯ /invoke qa_                                                      │
└────────────────────────────────────────────────────────────────────┘
```

### Topbar indicators

| Element | Meaning |
|---------|---------|
| **● live** (green) | WebSocket connected to server — real invocations available |
| **● offline** (amber) | Server not running — simulation mode only |
| **0 active** | Number of agents currently running |
| **v2.0.0** | QuorumKit version |
| **⚙** | Opens Settings modal |
| **`** (backtick) | Toggles the bottom drawer (also: press the backtick key) |

### Agent card anatomy

```
┌──────────────────────────────┐
│ ████ (accent colour bar)    │
│  📋              ● Idle     │
│                             │
│  BA/Product Agent           │
│  Requirements Whisperer     │
│                             │
│ ╔═══════════════════════╗   │
│ ║ "I ask 'why?' until   ║   │
│ ║  someone cries."      ║   │
│ ╚═══════════════════════╝   │
│                             │
│ /speckit-specify +2 more    │
│                             │
│ 🌐 Universal    ▶ Invoke   │
└──────────────────────────────┘
```

- **Click the card** — opens the detail slide-over panel (full responsibilities, all commands, fun fact, action buttons)
- **Click ▶ Invoke** — invokes the agent immediately in background mode

### Detail slide-over panel

Opens from the right when you click a card. Contains:

- Full responsibility list
- Clickable slash-command chips (click to pre-fill the console input)
- Fun fact
- **⚡ Invoke** — spawns the agent as a background process; output streams to the Console tab
- **⬜ Terminal** — opens a native terminal window running the agent interactively
- **⏹ Stop** — sends SIGTERM to a running agent (visible only while the agent is running)

---

## 8. Running Agents

> **Local development use.** The invocation features in this section let you run
> agents directly from your local dashboard. In CI/CD pipelines, agents are
> triggered through GitHub Actions workflows — see [`PIPELINES.md`](PIPELINES.md).

### Via the UI

1. Confirm the server is running and the topbar shows **● live**.
2. Confirm **⚙ Settings** has a valid **Local Project Path**.
3. Click **▶ Invoke** on any agent card.
4. The card turns green and its dot pulses — the agent is running.
5. Press `` ` `` (or click the Console tab) to see live output.
6. Click the **Board** tab to watch the card move through Queue → In Progress → Done.

### Via the console

```
/invoke qa
/invoke ba
/invoke security
/invoke all        ← runs the full SDLC agent sequence (Triage → BA → Architect → Dev → QA → Review → Security → DevOps → Release → Docs)
```

### Opening a native terminal (interactive mode)

Click **⬜ Terminal** on any agent's detail panel. The dashboard opens a new window in your configured terminal app, `cd`s into your project, and starts the agent command.

Use this when you want to **interact** with the AI — answer questions, provide additional context, or steer its output — rather than letting it run unattended.

### Stopping an agent

- Click **⏹ Stop** in the detail panel (visible only while the agent is running).
- Or type `/stop <agentId>` in the console (calls `POST /api/stop`).

---

## 9. The Board — Live Agent Status

The **📋 Board** tab shows a three-column Kanban view. Card positions reflect real agent state, driven by WebSocket events from the server:

| Column | When a card appears here |
|--------|--------------------------|
| **📥 Queue** | Agent invoked but not yet started, or awaiting an available slot |
| **⚡ In Progress** | Agent process is running (green left border, ⚡ prefix) |
| **✅ Done** | Agent exited with code 0 |

If an agent exits with a non-zero code, the card returns to **Queue** with a red left border, and the console shows the full error output.

Pre-seeded example cards illustrate the kind of work each agent handles. They disappear as cards from live invocations accumulate.

---

## 10. The Console

A real terminal-style interface. All agent output streams here in real time.

### Built-in commands

| Command | Effect |
|---------|--------|
| `/help` | Print all commands |
| `/status` | Show current status of all 15 agents |
| `/invoke <agent>` | Invoke an agent by ID or name (e.g. `/invoke qa`, `/invoke "BA Agent"`) |
| `/invoke all` | Run the full SDLC sequence: Triage → BA → Architect → Dev → QA → Review → Security → DevOps → Release → Docs |
| `/stop <agent>` | Stop a running agent |
| `/clear` | Clear console output |
| `/version` | Show stack version info |
| `/coffee` | Emergency refill ☕ |
| `/chaos` | Trigger a random SEV incident drill |
| `/haiku` | Request poetry from the autonomous void |
| `/about` | About QuorumKit |

### Console history

- **↑ / ↓** — cycle through previously entered commands
- **Clicking a slash-command chip** in an agent's detail panel pre-fills the input

### Log line format

```
[HH:MM:SS]  [AGENT NAME    ]  message text
  │              │                │
timestamp    14-char padded    stdout/stderr from the process
             agent name        or system message
```

Colour coding:

| Colour | Meaning |
|--------|---------|
| **Cyan** | System or structural messages |
| **Green** | Success or process completed |
| **Amber** | Warnings or in-progress steps |
| **Red** | Errors |
| **Purple** | Personality or fun lines |

---

## 11. Offline / Simulation Mode

When the server is not running (badge shows **● offline**), the dashboard falls back to a **built-in simulation**:

- **▶ Invoke** plays an animated log sequence drawn from pre-written agent quips.
- Board cards move through the columns on a timer.
- All console commands work.
- `/invoke all` runs the full pipeline simulation.

Use simulation mode as a **demo tool** or to explore agent capabilities before setting up a real project.

---

## 12. Worked Example — "Todo API" from Zero to Deployed

This walkthrough builds a simple Node.js REST API for a todo app, guided entirely by QuorumKit agents. Follow each step in order.

### 12.1 — Project setup

```zsh
# Create the project directory and initialise git
mkdir ~/projects/todo-api && cd ~/projects/todo-api
git init
echo '{"name":"todo-api","version":"0.1.0"}' > package.json
git add . && git commit -m "chore: initial project skeleton"

# Create the GitHub repository and push
gh repo create todo-api --public --source=. --remote=origin --push
```

### 12.2 — Install QuorumKit into the project

Run from the project root once (idempotent — safe to re-run):

```zsh
cd ~/projects/todo-api
bash ~/.quorumkit/scripts/init.sh --ai=copilot
# Writes .github/agents/, .github/instructions/, .github/workflows/, etc.
git add . && git commit -m "chore: install quorumkit"
```

Use `--ai=claude` for Claude Code, or `--ai=both` to install both runtimes.

### 12.3 — Launch the dashboard from the project

```zsh
cd ~/projects/todo-api
bash ~/.quorumkit/engine/dashboard/start.sh
# Browser opens at http://localhost:3131
```

The topbar displays the project context automatically:

```
🏭 QuorumKit   📁 todo-api   ● 0 active   15 agents   …   ⚙
```

The browser tab title reads `todo-api — QuorumKit`. Open **⚙ Settings** only if you need to change the AI tool or override the auto-detected path.

Console confirms the project:
```
[09:00:01]  [SYSTEM        ]  Project: /Users/alice/projects/todo-api  [copilot]
```

### 12.4 — Step 1: Triage Agent → BA/Product Agent (spec)

Create a GitHub Issue in your project:

```
Title: "Add CRUD endpoints for todo items"
Body: "Users need to create, list, update, and delete todos via a REST API."
```

**Invoke Triage Agent:**

1. Find the 🎯 **Triage Agent** card → click **⬜ Terminal**.
2. In the terminal, type:
   ```
   Please triage issue #1 "Add CRUD endpoints for todo items"
   ```
3. The agent applies labels `type:feature`, `priority:medium`, and posts a triage summary.

**Invoke BA/Product Agent:**

4. Find the 📋 **BA/Product Agent** card → click **⬜ Terminal**.
5. Type:
   ```
   /speckit-specify issue #1: CRUD endpoints for todo items
   ```
6. The agent generates `specs/001-todo-crud/spec.md` and commits it.

Board view after this step:
```
📥 Queue              ⚡ In Progress        ✅ Done
                                            🎯 Triage: issue #1
                                            📋 BA: spec 001
```

### 12.5 — Step 2: Architect Agent (ADR)

1. Click 🏗️ **Architect Agent** card → **⬜ Terminal**.
2. Type:
   ```
   Review specs/001-todo-crud/spec.md and produce an ADR for the persistence layer.
   ```
3. The agent produces `docs/architecture/adr-001-persistence.md` comparing in-memory vs SQLite vs PostgreSQL, recommends SQLite for this use case, and commits the ADR.

### 12.6 — Step 3: Developer Agent (implementation)

1. Click 💻 **Developer Agent** card → **⬜ Terminal**.
2. Type:
   ```
   /speckit-plan specs/001-todo-crud/spec.md
   ```
   The agent creates `specs/001-todo-crud/plan.md`.
3. Type:
   ```
   /speckit-tasks
   ```
   The agent creates `specs/001-todo-crud/tasks.md`:
   ```
   [ ] Task 1: Create Express app skeleton with health endpoint
   [ ] Task 2: Add SQLite schema migration (todos table)
   [ ] Task 3: POST /todos — create item
   [ ] Task 4: GET  /todos — list all items
   [ ] Task 5: PATCH /todos/:id — update item
   [ ] Task 6: DELETE /todos/:id — delete item
   [ ] Task 7: Write Jest integration tests for all endpoints
   ```
4. Type:
   ```
   /speckit-implement
   ```
   The agent implements all 7 tasks using TDD (tests first, then code), commits each task atomically, and opens PR `001-todo-crud`.

Watch live output in the **Console** tab while the Developer runs:
```
[09:14:32]  [DEVELOPER AGENT]  git checkout -b 001-todo-crud
[09:14:33]  [DEVELOPER AGENT]  Writing test: POST /todos returns 201...
[09:14:41]  [DEVELOPER AGENT]  npm test → 1 failing (expected)
[09:14:45]  [DEVELOPER AGENT]  Implementing POST /todos handler...
[09:14:58]  [DEVELOPER AGENT]  npm test → 1 passing ✓
```

### 12.7 — Step 4: QA Agent + Reviewer Agent

Use **▶ Invoke** (background mode — no steering needed):

1. Click 🔬 **QA/Test Agent** → **▶ Invoke**
   - Runs the test suite, checks coverage against the constitution threshold, and reports results.
2. Click 👁️ **Reviewer Agent** → **▶ Invoke**
   - Reviews the PR diff against `spec.md` and flags any BLOCKER items.

Board during this phase:
```
📥 Queue              ⚡ In Progress        ✅ Done
                      🔬 QA: PR #1          💻 Dev: 001-todo-crud
                      👁️ Reviewer: PR #1    📋 BA: spec 001
```

### 12.8 — Step 5: Security Agent

```
/invoke security
```

Expected console output:
```
[09:31:12]  [SECURITY AGENT ]  Running OWASP scanner...
[09:31:18]  [SECURITY AGENT ]  Checking for CVEs in package-lock.json...
[09:31:22]  [SECURITY AGENT ]  ✓ No high/critical vulnerabilities found
[09:31:23]  [SECURITY AGENT ]  ✓ No secrets in diff
[09:31:23]  [SECURITY AGENT ]  ✓ Input validation present on all endpoints
[09:31:24]  [SECURITY AGENT ]  APPROVED — no blockers
```

### 12.9 — Step 6: Release Agent

After the PR merges to `main`:

```
/invoke release
```

The agent:
1. Reads the git log since the last tag.
2. Determines this is a `minor` bump (`feat:` commits present).
3. Updates `package.json` → `0.2.0`.
4. Generates `CHANGELOG.md`.
5. Opens a Version Bump PR.
6. After that PR merges: creates GitHub Release `v0.2.0` with generated release notes.

### 12.10 — Final board state

```
📥 Queue              ⚡ In Progress        ✅ Done
                                            🎯 Triage: issue #1
                                            📋 BA: spec 001
                                            🏗️ Architect: ADR-001
                                            💻 Developer: PR #1
                                            🔬 QA: PR #1 ✓
                                            👁️ Reviewer: PR #1 ✓
                                            🔐 Security: PR #1 ✓
                                            📦 Release: v0.2.0
```

**Total human input for this feature:** writing the GitHub issue + merging 2 PRs.  
Everything else — spec, plan, tasks, implementation, tests, review, security scan, changelog, and release — was handled by agents.

---

## 13. Configuration Reference

### `engine/dashboard/.apm-project.json`

The server stores project configuration here (inside the QuorumKit package, not your project). It is git-ignored so paths remain local. The server re-derives `projectName` and any missing fields on every launch from `QUORUMKIT_PROJECT_DIR` + `git`, so older saved configs upgrade automatically.

```json
{
  "localPath":   "/Users/alice/projects/todo-api",
  "repoUrl":     "https://github.com/alice/todo-api",
  "branch":      "main",
  "projectName": "todo-api",
  "aiTool":      "copilot",
  "customCmd":   "",
  "terminalApp": "iterm"
}
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QUORUMKIT_PORT` | `3131` | HTTP + WebSocket port |
| `QUORUMKIT_PROJECT_DIR` | `$PWD` at launch | Project root used for auto-detection. `start.sh` captures this before `cd`-ing into the dashboard folder. |

### Agent-to-skill mapping

The server maps each agent card ID to the correct skill file:

| Card ID | Skill folder | Agent definition file |
|---------|-------------|----------------------|
| `ba` | `src/skills/ba-agent/SKILL.md` | `src/agents/ba-product-agent.md` |
| `developer` | `src/skills/dev-agent/SKILL.md` | `src/agents/developer-agent.md` |
| `qa` | `src/skills/qa-agent/SKILL.md` | `src/agents/qa-test-agent.md` |
| `reviewer` | `src/skills/reviewer-agent/SKILL.md` | `src/agents/reviewer-agent.md` |
| `architect` | `src/skills/architect-agent/SKILL.md` | `src/agents/architect-agent.md` |
| `devops` | `src/skills/devops-agent/SKILL.md` | `src/agents/devops-agent.md` |
| `security` | `src/skills/security-agent/SKILL.md` | `src/agents/security-agent.md` |
| `triage` | `src/skills/triage-agent/SKILL.md` | `src/agents/triage-agent.md` |
| `release` | `src/skills/release-agent/SKILL.md` | `src/agents/release-agent.md` |
| `docs` | `src/skills/docs-agent/SKILL.md` | `src/agents/docs-agent.md` |
| `techdebt` | `src/skills/tech-debt-agent/SKILL.md` | `src/agents/tech-debt-agent.md` |
| `ot` | `src/skills/ot-integration-agent/SKILL.md` | `src/agents/ot-integration-agent.md` |
| `twin` | `src/skills/digital-twin-agent/SKILL.md` | `src/agents/digital-twin-agent.md` |
| `compliance` | `src/skills/compliance-agent/SKILL.md` | `src/agents/compliance-agent.md` |
| `incident` | `src/skills/incident-agent/SKILL.md` | `src/agents/incident-agent.md` |

---

## 14. API Reference

All endpoints are on `http://localhost:3131` (or your custom port).

### `GET /`
Returns `index.html`. Open in any browser.

### `GET /api/config`
Returns the current project configuration.

```zsh
curl http://localhost:3131/api/config
```
```json
{
  "localPath": "/Users/alice/projects/todo-api",
  "repoUrl": "https://github.com/alice/todo-api",
  "branch": "main",
  "aiTool": "claude",
  "customCmd": "",
  "terminalApp": "iterm"
}
```

### `POST /api/config`
Save project configuration. Broadcasts the new config to all WebSocket clients.

```zsh
curl -X POST http://localhost:3131/api/config \
  -H 'Content-Type: application/json' \
  -d '{"localPath":"/Users/alice/projects/todo-api","aiTool":"claude"}'
```

### `GET /api/agents`
Returns a map of currently-running agent statuses.

```zsh
curl http://localhost:3131/api/agents
```
```json
{
  "statuses": {
    "qa": { "status": "running", "startedAt": 1748260400000, "pid": 12345 }
  }
}
```

### `POST /api/invoke`
Spawn an agent process in the background.

```zsh
curl -X POST http://localhost:3131/api/invoke \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"qa","agentName":"QA/Test Agent"}'
```
```json
{ "ok": true, "pid": 12345, "agentId": "qa" }
```

Errors:

| Response | Cause |
|----------|-------|
| `{ "ok": false, "error": "No project path configured" }` | Open **⚙ Settings** and set a project path first |
| `{ "ok": false, "error": "qa is already running" }` | Stop the running instance before invoking again |

### `POST /api/terminal`
Open a native terminal window running the agent interactively.

```zsh
curl -X POST http://localhost:3131/api/terminal \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"qa","agentName":"QA/Test Agent"}'
```
```json
{ "ok": true, "terminalApp": "iterm" }
```

### `POST /api/stop`
Send SIGTERM to a running agent.

```zsh
curl -X POST http://localhost:3131/api/stop \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"qa"}'
```
```json
{ "ok": true }
```

### `GET /api/log/:agentId`
Retrieve the in-memory log buffer for an agent (last session only — not persisted across restarts).

```zsh
curl http://localhost:3131/api/log/qa
```
```json
{
  "log": [
    { "ts": 1748260400123, "level": "info",    "msg": "Running test suite..." },
    { "ts": 1748260412000, "level": "success", "msg": "✅ All tests passing (47/47)" }
  ]
}
```

### WebSocket messages (server → browser)

Connect to `ws://localhost:3131`. The server sends the following message types:

| `type` | Payload fields | When sent |
|--------|---------------|-----------|
| `hello` | `statuses`, `config` | Immediately on WebSocket connection |
| `log` | `agentId`, `level`, `msg` | Every stdout/stderr line from a running agent |
| `agentStatus` | `agentId`, `status` | When an agent starts, finishes, or errors |
| `kanban` | `action` (`"add"` or `"move"`), `col`, `card` or `agentId` | When Kanban state changes |
| `config` | `cfg` | After a successful `POST /api/config` |

---

## 15. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `` ` `` | Toggle the console/board drawer open and closed |
| `Esc` | Close the agent detail slide-over panel |
| `↑` / `↓` | Cycle through console command history |

---

## 16. Known Limitations

- **Log buffer is in-memory only.** `GET /api/log/:agentId` returns the log from the current server session. Restarting the server clears all logs. Persist important output by redirecting agent output to a file in your terminal session.
- **One instance per port.** Running two dashboards on the same port is not supported. Use `QUORUMKIT_PORT` to run separate instances for separate projects.
- **WebSocket reconnection is manual.** If the server restarts while the browser tab is open, refresh the page to re-establish the WebSocket connection. The **● offline** badge indicates a dropped connection.
- **Native terminal support varies by OS.** The Terminal action supports iTerm2, Warp, macOS Terminal.app, GNOME Terminal, and Windows Terminal. Other apps require the **Shell only** fallback.
- **Agent log history resets on stop.** If an agent crashes and you invoke it again, the previous session's log is overwritten. There is no built-in log rotation.

---

## 17. Troubleshooting

### Badge stays ● offline

The browser cannot reach `ws://localhost:3131`.

1. Check the server is running: `ps aux | grep server.js`
2. Check whether something else holds the port: `lsof -i :3131`
3. Try a different port: `QUORUMKIT_PORT=4000 bash ~/.quorumkit/engine/dashboard/start.sh`, then open `http://localhost:4000`
4. Check for firewall rules blocking localhost connections.

### "No project path configured" error on invoke

This is rare because the dashboard auto-detects `$PWD` at launch (§5). If you see it:

1. Confirm you launched `start.sh` from inside the project, not from `~/`:
   ```zsh
   cd ~/projects/todo-api && bash ~/.quorumkit/engine/dashboard/start.sh
   ```
2. Or set `QUORUMKIT_PROJECT_DIR` explicitly:
   ```zsh
   QUORUMKIT_PROJECT_DIR=~/projects/todo-api bash ~/.quorumkit/engine/dashboard/start.sh
   ```
3. Or open **⚙ Settings** and enter the **Local Project Path**. The path must exist on disk:
   ```zsh
   ls /Users/alice/projects/todo-api   # must return files
   ```

### Topbar pill shows the wrong project name

The dashboard derives the project name from `git remote origin` (repo basename), falling back to the directory basename.

- Check the remote: `git -C <project> remote -v` — is `origin` pointing to the expected repo?
- Override **Local Project Path** in **⚙ Settings** and click **Save & Connect**.
- Or relaunch from the correct directory: `cd <correct-path> && bash ~/.quorumkit/engine/dashboard/start.sh`.

### Agent spawns but produces no output

The AI CLI tool is not installed or not on `$PATH`.

```zsh
# Claude Code:
which claude     # must return a path
claude --version

# VS Code / Copilot:
which code
code --version
```

If you get `command not found`, install the tool and make sure its binary is on your shell's `PATH`. The server inherits the same `PATH` as the terminal that started it.

### Terminal window does not open

The configured terminal app may not be installed. In **⚙ Settings**, switch to **macOS Terminal.app** (always available on macOS) or **Shell only**.

You can test the terminal command directly:

```zsh
# iTerm2:
osascript -e 'tell application "iTerm2" to activate'

# Terminal.app:
osascript -e 'tell application "Terminal" to activate'
```

### Port already in use

```
✗ Port 3131 is already in use.
  Try:  QUORUMKIT_PORT=3132 bash ~/.quorumkit/engine/dashboard/start.sh
```

Stop the existing process or use a different port:

```zsh
kill $(lsof -t -i:3131)
# or
QUORUMKIT_PORT=3132 bash ~/.quorumkit/engine/dashboard/start.sh
```

### Agent process exits immediately with an error

The server logs the exit code and stderr to the console. Common causes:

| Symptom | Fix |
|---------|-----|
| `claude: command not found` | Install Claude Code and add its binary to `$PATH` |
| `Permission denied on project path` | `chmod -R u+rw <localPath>` |
| `Skill file not found` | Run `bash ~/.quorumkit/scripts/init.sh` from your project root |
| `node: command not found` | Ensure Node.js ≥ 18 is installed and on `$PATH` |

---

## 18. Related Topics

- [README.md](../README.md) — Stack overview, agent table, NNN traceability convention
- [DARK_FACTORY_GUIDE.md](DARK_FACTORY_GUIDE.md) — Industrial (OT/ICS) agent configuration and dark factory mode
- [BROWNFIELD_GUIDE.md](BROWNFIELD_GUIDE.md) — Adopting QuorumKit in an existing project without disrupting conventions
- [PIPELINES.md](PIPELINES.md) — GitHub Actions Orchestrator: CI/CD agent pipelines and workflow structure
- [CONTRIBUTING.md](../CONTRIBUTING.md) — How to extend the stack, add agents, or contribute upstream
- [engine/dashboard/server.js](../engine/dashboard/server.js) — Dashboard backend source
- [engine/dashboard/index.html](../engine/dashboard/index.html) — Dashboard UI source
