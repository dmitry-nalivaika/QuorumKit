# APM Orchestrator — Complete Guide

> **The Orchestrator Dashboard** is the command centre for the APM Dark Factory.
> It turns the 15 AI agents from a set of Markdown definitions into a live, interactive
> system you can watch, steer, and control — all from one browser tab.

---

## Table of Contents

1. [What the Orchestrator Is](#1-what-the-orchestrator-is)
2. [Architecture Overview](#2-architecture-overview)
3. [Prerequisites](#3-prerequisites)
4. [Installing agentic-dev-stack into your project](#4-installing-agentic-dev-stack-into-your-project)
5. [Launching the dashboard from your project directory](#5-launching-the-dashboard-from-your-project-directory)
6. [Connecting a project (manual override)](#6-connecting-a-project-manual-override)
7. [The Dashboard UI](#7-the-dashboard-ui)
8. [Running Agents](#8-running-agents)
9. [The Board — Live Agent Status](#9-the-board--live-agent-status)
10. [The Console](#10-the-console)
11. [Offline / Simulation Mode](#11-offline--simulation-mode)
12. [Worked Example — "Todo App" from Zero to Deployed](#12-worked-example--todo-app-from-zero-to-deployed)
13. [Configuration Reference](#13-configuration-reference)
14. [API Reference](#14-api-reference)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What the Orchestrator Is

The Orchestrator is a two-part system:

| Part | File | What it does |
|------|------|--------------|
| **Backend server** | `dashboard/server.js` | Node.js HTTP + WebSocket server. Spawns agent processes, streams their output live, opens native terminal windows, manages project config. |
| **Dashboard UI** | `dashboard/index.html` | Single-page app served by the backend. Shows all 15 agents as cards, a live console, a Kanban board, and a settings modal. |

The two parts communicate over **WebSocket** (`ws://localhost:3131`). The UI degrades
gracefully to a simulation mode when the server is not running — so you can open
`index.html` as a plain file and still explore the agents.

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
│  dashboard/server.js  (Node.js, port 3131)                       │
│                                                                   │
│  HTTP routes          WebSocket broadcast                        │
│  GET  /               → serves index.html                        │
│  GET  /api/config     → read .apm-project.json                   │
│  POST /api/config     → write .apm-project.json                  │
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
    │       .apm/skills/qa-agent/SKILL.md │
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

The dashboard itself has **one npm dependency** ([`ws`](https://github.com/websockets/ws)) and is installed automatically on first run.

The orchestrator works equally well on:

- 🌱 **Greenfield** projects — a fresh `mkdir` you just `git init`ed.
- 🏭 **Brownfield** projects — an existing repo with code, history, CI, and conventions you want to keep.

You install the agentic-dev-stack **into your project**, then launch the dashboard **from your project directory**. The dashboard auto-detects the project name, the git remote, and the current branch — no manual settings needed for the common case.

---

## 4. Installing agentic-dev-stack into your project

You only need to do this once per project.

### 4.1 — Get the agentic-dev-stack package

Clone the package somewhere on your machine. It does **not** need to live inside your project.

```zsh
# A reasonable home for the package itself:
git clone https://github.com/dmitry-nalivaika/agentic-dev-stack.git ~/.agentic-dev-stack
```

> Anywhere works — `~/Documents/Projects/agentic-dev-stack`, `~/code/agentic-dev-stack`, etc. Just remember the path; the install script lives at `<that-path>/scripts/init.sh`.

### 4.2 — Run `init.sh` from inside your project

```zsh
# Greenfield example
mkdir -p ~/projects/my-new-app && cd ~/projects/my-new-app
git init

# Brownfield example
cd ~/work/legacy-billing-service
```

Then, **from your project root**, run the installer once:

```zsh
bash ~/.agentic-dev-stack/scripts/init.sh                                # Claude Code (default)
bash ~/.agentic-dev-stack/scripts/init.sh --ai=copilot                   # GitHub Copilot
bash ~/.agentic-dev-stack/scripts/init.sh --ai=both                      # Both
bash ~/.agentic-dev-stack/scripts/init.sh --ai=both --domain=industrial  # Both + industrial agents
```

What the script writes into your project (idempotent — re-running is safe and never overwrites your files):

| Path | Purpose |
|------|---------|
| `.claude/agents/*.md` | Claude agent role definitions (when `--ai=claude` or `both`) |
| `.claude/skills/*/SKILL.md` | Slash-command skill definitions for Claude |
| `.github/agents/*.md` | Shared agent role definitions for Copilot (when `--ai=copilot` or `both`) |
| `.github/instructions/*.instructions.md` | Per-agent Copilot custom instructions |
| `.github/copilot-instructions.md` | Workspace-level Copilot context |
| `.github/workflows/agent-*.yml` | GitHub Actions that invoke agents on PR/issue events |
| `.github/ISSUE_TEMPLATE/*` | Bug/feature/security templates |
| `.github/pull_request_template.md` | PR template wired up to the reviewer agent |
| `CLAUDE.md` | Workspace-level Claude context (only created if missing) |
| `CONTRIBUTING.md`, `SECURITY.md` | Community files (only created if missing) |
| `BROWNFIELD_GUIDE.md`, `DARK_FACTORY_GUIDE.md`, `ENHANCEMENTS.md` | Reference docs |

> **Brownfield safety**: the script never overwrites an existing `CLAUDE.md`, PR template, issue template, workflow, or instruction file. If you've already got one, the new copy is skipped and you'll see a `⚠ already exists — skipping` line. Diff afterward and merge by hand if you want the new bits.

### 4.3 — Verify the install

```zsh
ls .claude/agents 2>/dev/null | head             # Claude agents present?
ls .github/agents 2>/dev/null | head             # Copilot agents present?
ls .github/workflows | grep -E '^(copilot-)?agent-' | head
```

If the directories exist and contain `.md` / `.yml` files, you're ready to launch the dashboard.

---

## 5. Launching the dashboard from your project directory

This is the part that changed in the latest release: the orchestrator now picks up the project context **automatically** when you launch it from inside the project.

### 5.1 — Recommended: run `start.sh` from your project root

From **your project directory**:

```zsh
cd ~/work/legacy-billing-service
bash ~/.agentic-dev-stack/dashboard/start.sh
```

`start.sh` captures `$PWD` into `APM_PROJECT_DIR` *before* `cd`-ing into the dashboard folder, then passes it to the server. The server uses it as the default `localPath`, runs `git config --get remote.origin.url` and `git rev-parse --abbrev-ref HEAD` to fill in the **GitHub Repository URL** and **Default Branch**, and derives the **Project Name** for the topbar pill and browser tab title.

You'll see the project context echoed before the server starts:

```
  APM Dark Factory — Orchestrator
  Project: /Users/alice/work/legacy-billing-service
```

When the dashboard opens at `http://localhost:3131` the topbar shows:

```
🏭 APM Dark Factory   📁 legacy-billing-service   ● 0 active   15 agents   …   ⚙
```

— and you can invoke any agent without ever opening Settings.

### 5.2 — Optional: shell alias

If you orchestrate several projects, a one-liner saves typing:

```zsh
# In ~/.zshrc
alias apm='bash ~/.agentic-dev-stack/dashboard/start.sh'
```

Then from any project: `cd ~/work/foo && apm`.

### 5.3 — Custom port

```zsh
APM_PORT=4000 apm
# or
bash ~/.agentic-dev-stack/dashboard/start.sh --port 4000
```

### 5.4 — Override the auto-detected project

The detected values can always be edited from **⚙ Settings** in the UI, or by setting `APM_PROJECT_DIR` explicitly:

```zsh
APM_PROJECT_DIR=~/work/some-other-repo apm
```

### 5.5 — Verifying the server is up

```zsh
curl http://localhost:3131/api/config
```

```json
{
  "localPath":   "/Users/alice/work/legacy-billing-service",
  "repoUrl":     "git@github.com:alice/legacy-billing-service.git",
  "branch":      "main",
  "projectName": "legacy-billing-service",
  "aiTool":      "claude",
  ...
}
```

The topbar **● live** badge (green) confirms the WebSocket is connected. **● offline** (amber) means the server is not reachable.

---

## 6. Connecting a project (manual override)

The dashboard auto-detects the project on launch (see §5). You only need this section if any of these apply:

- The auto-detected values are wrong (e.g. you launched from a parent directory).
- You want to change the AI tool, terminal app, or VS Code app per project.
- You're switching the running dashboard between two projects without restarting it.

Click the **⚙** button (top-right) to open Settings.

### Settings fields

| Field | What to enter | Auto-detected? | Example |
|-------|--------------|----------------|---------|
| **Local Project Path** | Absolute path to the project root on disk. Agents are spawned from here. | ✅ from `$PWD` at launch | `/Users/alice/work/legacy-billing-service` |
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
| **Shell only** | `cat <agent.md> && bash` | Exploring agents / manual use |

#### Custom command tokens

| Token | Replaced with |
|-------|--------------|
| `{agent}` | Agent short ID (e.g. `qa`) |
| `{agentName}` | Agent full name (e.g. `QA/Test Agent`) |
| `{skill}` | Absolute path to the agent's `SKILL.md` |
| `{cwd}` | Absolute path to your project (localPath) |

**Example custom command for Aider:**
```
aider --model gpt-4o-mini --read {skill} --cwd {cwd}
```

Click **Save & Connect** — the server writes `.apm-project.json` inside the `dashboard/`
folder and broadcasts the config to all connected browser tabs.

---

## 7. The Dashboard UI

```
┌────────────────────────────────────────────────────────────────────┐
│ 🏭 APM Dark Factory          ● 0 active  15 agents  ...  ⚙  💻`  │  ← topbar
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
| **v2.0.0** | APM stack version |
| **⚙** | Opens Settings modal |
| **💻 Console `** | Toggles the bottom drawer (also: press backtick `` ` ``) |

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

- **Click the card** → opens the detail slide-over panel (full responsibilities, all commands, fun fact, action buttons)
- **Click ▶ Invoke** → invokes the agent immediately

### Detail slide-over panel

Opens from the right when you click a card. Contains:

- Full responsibility list
- Clickable slash-command chips (click → pre-fills the console input)
- Fun fact
- **⚡ Invoke** — spawns the agent (background process, output streams to Console)
- **⬜ Terminal** — opens a native terminal window running the agent
- **⏹ Stop** — sends SIGTERM to a running agent (only visible while running)

---

## 8. Running Agents

### Via the UI

1. Make sure the server is running and **● live** shows in the topbar
2. Make sure **⚙ Settings** has a valid **Local Project Path**
3. Click **▶ Invoke** on any agent card
4. The card turns green and its dot pulses — the agent is running
5. Switch to the **Console** tab (or press `` ` ``) to see live output
6. Switch to the **Board** tab to see the card move through Queue → In Progress → Done

### Via the console

```
/invoke qa
/invoke ba
/invoke security
/invoke all        ← runs the full SDLC pipeline in sequence
```

### Opening a native terminal (interactive mode)

Click **⬜ Terminal** on any agent's detail panel. This opens a new window/tab in
your configured terminal app, `cd`s into your project, and runs the agent command.
Useful when you want to **interact** with the AI (give it follow-up instructions,
answer questions, steer its output) rather than letting it run unattended.

### Stopping an agent

- Click **⏹ Stop** in the detail panel (only visible while the agent is running)
- Or type `/stop <agentId>` in the console (calls `POST /api/stop`)

---

## 9. The Board — Live Agent Status

The **📋 Board** tab shows a three-column Kanban that reflects real agent state,
driven by WebSocket events from the server:

| Column | When a card appears here |
|--------|--------------------------|
| **📥 Queue** | Agent invoked but not yet started, or queued |
| **⚡ In Progress** | Agent process is running (green left border, ⚡ prefix) |
| **✅ Done** | Agent exited with code 0 |

If an agent exits with a non-zero code the card moves to **Queue** with a red left
border (error state), and the console shows the error output.

Pre-seeded example cards show the kind of work each agent typically handles. These
disappear as real cards from live invocations accumulate.

---

## 10. The Console

A real terminal-style interface. All agent output streams here in real time.

### Built-in commands

| Command | Effect |
|---------|--------|
| `/help` | Print all commands |
| `/status` | Show current status of all 15 agents |
| `/invoke <agent>` | Invoke an agent by ID or name (e.g. `/invoke qa`, `/invoke "BA Agent"`) |
| `/invoke all` | Run the full SDLC pipeline (Triage → BA → Architect → Dev → QA → Review → Security → DevOps → Release → Docs) |
| `/stop <agent>` | Stop a running agent |
| `/clear` | Clear console output |
| `/version` | Show stack version info |
| `/coffee` | Emergency refill ☕ |
| `/chaos` | Trigger a random SEV incident drill |
| `/haiku` | Request poetry from the autonomous void |
| `/about` | About the Dark Factory |

### Console history

- **↑ / ↓** arrows cycle through previously entered commands
- All slash commands from agent detail chips pre-fill the input (click the chip)

### Log line format

```
[HH:MM:SS]  [AGENT NAME    ]  message text
  │              │                │
timestamp    14-char padded    stdout/stderr from the process
             agent name        or system message
```

Colour coding:
- **Cyan** — system / structural messages
- **Green** — success / process completed
- **Amber** — warnings / in-progress steps
- **Red** — errors
- **Purple** — fun / personality lines

---

## 11. Offline / Simulation Mode

When the server is not running (badge shows **● offline**), the dashboard falls back
to a **built-in simulation**:

- ▶ Invoke plays an animated log sequence drawn from pre-written `QUIPS` per agent
- Board cards move through the columns on a timer
- All console commands work
- `/invoke all` runs the full pipeline simulation

This makes the dashboard useful as a **demo tool** or **exploration tool** even
without a live project.

---

## 12. Worked Example — "Todo App" from Zero to Deployed

This walkthrough shows how to use the Orchestrator on a real project. We will
build a simple Node.js REST API for a todo app, guided entirely by APM agents.

### 12.1 — Project setup

```zsh
# Create the project
mkdir ~/projects/todo-api && cd ~/projects/todo-api
git init
echo '{"name":"todo-api","version":"0.1.0"}' > package.json
git add . && git commit -m "chore: initial project skeleton"

# Push to GitHub (creates the remote)
gh repo create todo-api --public --source=. --push
```

### 12.2 — Install agentic-dev-stack into the project

From the project root (one-time, idempotent — see §4 for details):

```zsh
cd ~/projects/todo-api
bash ~/.agentic-dev-stack/scripts/init.sh --ai=copilot
# → writes .github/agents/, .github/instructions/, .github/workflows/, etc.
git add . && git commit -m "chore: install agentic-dev-stack"
```

Use `--ai=claude` if you prefer Claude Code, or `--ai=both` for both.

### 12.3 — Launch the Orchestrator from the project

```zsh
cd ~/projects/todo-api
bash ~/.agentic-dev-stack/dashboard/start.sh
# → browser opens http://localhost:3131
```

Or, if you set up the `apm` alias from §5.2:

```zsh
cd ~/projects/todo-api && apm
```

The topbar now shows the project pill automatically:

```
🏭 APM Dark Factory   📁 todo-api   ● 0 active   15 agents   …   ⚙
```

The browser tab title also reads `todo-api — APM Dark Factory`. Open **⚙ Settings**
only if you want to flip the **AI Tool** to something other than the default, or
override the auto-detected path/repo/branch.

Console shows:
```
[09:00:01]  [SYSTEM        ]  Project: /Users/alice/projects/todo-api  [copilot]
```

### 12.4 — Step 1: Triage → BA/Product Agent (spec)

Create a GitHub Issue in your project:

```
Title: "Add CRUD endpoints for todo items"
Body: "Users need to create, list, update and delete todos via a REST API."
```

Now invoke **Triage Agent** from the dashboard — it reads the issue, applies labels,
and routes it to the BA agent.

Then invoke **BA/Product Agent**. It will:
- Open a terminal session in your project directory
- Ask clarifying questions about the spec
- Produce `specs/001-todo-crud/spec.md`

**In the Orchestrator:**
1. Find the 🎯 **Triage Agent** card → click **⬜ Terminal**
2. In the terminal: the agent loads and reads open issues. Type:
   ```
   Please triage issue #1 "Add CRUD endpoints for todo items"
   ```
3. Agent labels the issue `type:feature`, `priority:medium`, creates a triage summary.
4. Find the 📋 **BA/Product Agent** card → click **⬜ Terminal**
5. Type:
   ```
   /speckit-specify issue #1: CRUD endpoints for todo items
   ```
6. Agent generates `specs/001-todo-crud/spec.md` and commits it.

Board view after this step:
```
📥 Queue              ⚡ In Progress        ✅ Done
                                            🎯 Triage: issue #1
                                            📋 BA: spec 001
```

### 12.5 — Step 2: Architect Agent (ADR)

Invoke **Architect Agent** via the dashboard:

1. Click 🏗️ **Architect Agent** card → **⬜ Terminal**
2. Type:
   ```
   Review specs/001-todo-crud/spec.md and produce an ADR for the persistence layer choice.
   ```
3. Agent produces `docs/adr/ADR-001-persistence.md` comparing in-memory vs SQLite vs PostgreSQL,
   recommends SQLite for a simple todo API, commits the ADR.

### 12.6 — Step 3: Developer Agent (implementation)

1. Click 💻 **Developer Agent** card → **⬜ Terminal**
2. Type:
   ```
   /speckit-plan specs/001-todo-crud/spec.md
   ```
   Agent creates `specs/001-todo-crud/plan.md`.
3. Type:
   ```
   /speckit-tasks
   ```
   Agent creates `specs/001-todo-crud/tasks.md`:
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
   Agent implements all 7 tasks using TDD (writes tests first, then code),
   commits each task atomically, opens a PR: `001-todo-crud`.

While the Developer is running you can see its output live in the **Console** tab:
```
[09:14:32]  [DEVELOPER AGENT]  git checkout -b 001-todo-crud
[09:14:33]  [DEVELOPER AGENT]  Writing test: POST /todos returns 201...
[09:14:41]  [DEVELOPER AGENT]  npm test → 1 failing (expected)
[09:14:45]  [DEVELOPER AGENT]  Implementing POST /todos handler...
[09:14:58]  [DEVELOPER AGENT]  npm test → 1 passing ✓
```

### 12.7 — Step 4: QA Agent + Reviewer Agent

Invoke via the **▶ Invoke** button (background mode — no steering needed):

1. Click 🔬 **QA/Test Agent** → **▶ Invoke**
   - Runs test suite, checks coverage (must meet constitution threshold), reports results
2. Click 👁️ **Reviewer Agent** → **▶ Invoke**
   - Reviews PR diff against `spec.md`, flags any BLOCKER items

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

Console output:
```
[09:31:12]  [SECURITY AGENT ]  Running OWASP scanner...
[09:31:18]  [SECURITY AGENT ]  Checking for CVEs in package-lock.json...
[09:31:22]  [SECURITY AGENT ]  ✓ No high/critical vulnerabilities found
[09:31:23]  [SECURITY AGENT ]  ✓ No secrets in diff
[09:31:23]  [SECURITY AGENT ]  ✓ Input validation present on all endpoints
[09:31:24]  [SECURITY AGENT ]  APPROVED — no blockers
```

### 12.9 — Step 6: Release Agent

PR merged to main (manually or by the Reviewer). Then:

```
/invoke release
```

Agent:
- Reads git log since last tag
- Determines this is a `minor` bump (`feat:` commits present)
- Updates `package.json` → `0.2.0`
- Generates `CHANGELOG.md`
- Opens Version Bump PR
- After merge: creates GitHub Release `v0.2.0` with generated notes

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

**Total human keystrokes for this feature:** creating the GitHub issue + merging 2 PRs.
Everything else — spec, plan, tasks, implementation, tests, review, security scan,
changelog, release — was handled by agents.

---

## 13. Configuration Reference

### `.apm-project.json` (auto-detected on launch, overridable from Settings)

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

This file lives in `dashboard/.apm-project.json` (inside the agentic-dev-stack repo, not your project).
It is git-ignored so your paths stay local. The server re-derives `projectName` and any
missing fields on every launch from `APM_PROJECT_DIR` + `git`, so older saved configs upgrade automatically.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APM_PORT` | `3131` | HTTP + WebSocket port |
| `APM_PROJECT_DIR` | `$PWD` at launch | Project root used for auto-detection. `start.sh` captures it before `cd`-ing into the dashboard folder. |

### Agent-to-skill mapping

The server maps each agent card ID to the correct skill file:

| Card ID | Skill folder | Agent definition file |
|---------|-------------|----------------------|
| `ba` | `.apm/skills/ba-agent/SKILL.md` | `.apm/agents/ba-product-agent.md` |
| `developer` | `.apm/skills/dev-agent/SKILL.md` | `.apm/agents/developer-agent.md` |
| `qa` | `.apm/skills/qa-agent/SKILL.md` | `.apm/agents/qa-test-agent.md` |
| `reviewer` | `.apm/skills/reviewer-agent/SKILL.md` | `.apm/agents/reviewer-agent.md` |
| `architect` | `.apm/skills/architect-agent/SKILL.md` | `.apm/agents/architect-agent.md` |
| `devops` | `.apm/skills/devops-agent/SKILL.md` | `.apm/agents/devops-agent.md` |
| `security` | `.apm/skills/security-agent/SKILL.md` | `.apm/agents/security-agent.md` |
| `triage` | `.apm/skills/triage-agent/SKILL.md` | `.apm/agents/triage-agent.md` |
| `release` | `.apm/skills/release-agent/SKILL.md` | `.apm/agents/release-agent.md` |
| `docs` | `.apm/skills/docs-agent/SKILL.md` | `.apm/agents/docs-agent.md` |
| `techdebt` | `.apm/skills/tech-debt-agent/SKILL.md` | `.apm/agents/tech-debt-agent.md` |
| `ot` | `.apm/skills/ot-integration-agent/SKILL.md` | `.apm/agents/ot-integration-agent.md` |
| `twin` | `.apm/skills/digital-twin-agent/SKILL.md` | `.apm/agents/digital-twin-agent.md` |
| `compliance` | `.apm/skills/compliance-agent/SKILL.md` | `.apm/agents/compliance-agent.md` |
| `incident` | `.apm/skills/incident-agent/SKILL.md` | `.apm/agents/incident-agent.md` |

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
    "qa": { "status": "running", "startedAt": 1714820400000, "pid": 12345 }
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
- `{ "ok": false, "error": "No project path configured" }` — open Settings first
- `{ "ok": false, "error": "qa is already running" }` — stop it first

### `POST /api/terminal`
Open a native terminal window running the agent.

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
Retrieve the in-memory log buffer for an agent (last session).

```zsh
curl http://localhost:3131/api/log/qa
```
```json
{
  "log": [
    { "ts": 1714820400123, "level": "info", "msg": "Running test suite..." },
    { "ts": 1714820412000, "level": "success", "msg": "✅ All tests passing (47/47)" }
  ]
}
```

### WebSocket messages (server → browser)

| `type` | Payload | When |
|--------|---------|------|
| `hello` | `{statuses, config}` | Immediately on WS connection |
| `log` | `{agentId, level, msg}` | Every stdout/stderr line from a running agent |
| `agentStatus` | `{agentId, status}` | When an agent starts, finishes, or errors |
| `kanban` | `{action:"add"\|"move", col, card?\|agentId}` | When Kanban state changes |
| `config` | `{cfg}` | After a successful POST /api/config |

---

## 15. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `` ` `` | Toggle the console/board drawer open/closed |
| `Esc` | Close the agent detail slide-over panel |
| `↑` / `↓` | Cycle through console command history |
| `/invoke all` | Full SDLC pipeline simulation (or real, if server connected) |

---

## 16. Troubleshooting

### Badge stays ● offline

The browser cannot reach `ws://localhost:3131`.

1. Check the server is running: `ps aux | grep server.js`
2. Check the port is not in use by something else: `lsof -i :3131`
3. Try a different port: `node dashboard/server.js --port 4000` then open `http://localhost:4000`
4. Check for firewall rules blocking localhost connections

### "No project path configured" error on invoke

This should be rare since the dashboard auto-detects `$PWD` at launch (§5).
If you see it:

1. Confirm you launched `start.sh` from inside the project (not from `~/`):
   ```zsh
   cd ~/projects/todo-api && bash ~/.agentic-dev-stack/dashboard/start.sh
   ```
2. Or set `APM_PROJECT_DIR` explicitly: `APM_PROJECT_DIR=~/projects/todo-api apm`
3. Or open **⚙ Settings** and fill in **Local Project Path**. The path must exist on disk.

```zsh
ls /Users/alice/projects/todo-api   # must return files
```

### Topbar pill shows the wrong project name

The dashboard derives the name from the git remote (`remote.origin.url` → repo basename),
falling back to the directory basename. If you see the wrong name:

- Check `git -C <project> remote -v` — is `origin` set to the expected repo?
- Or override **Local Project Path** in **⚙ Settings** and click **Save & Connect**.
- Or relaunch from the right directory: `cd <correct-path> && apm`.

### Agent spawns but produces no output

The AI CLI tool is not installed or not on `$PATH`.

```zsh
# For Claude Code:
which claude    # should return a path
claude --version

# For VS Code / Copilot:
which code
code --version
```

If you get "command not found", install the tool and ensure its binary is in your
shell's `PATH`. The server inherits the same `PATH` as the terminal that started it.

### Terminal window does not open

The configured terminal app may not be installed. In Settings, try switching to
**macOS Terminal.app** (always available on macOS) or **Shell only**.

You can also test the terminal command directly:

```zsh
# For iTerm2:
osascript -e 'tell application "iTerm2" to activate'

# For Terminal.app:
osascript -e 'tell application "Terminal" to activate'
```

### Port already in use

```
✗ Port 3131 is already in use.
  Try:  node server.js --port 3132
```

Either stop the existing process (`kill $(lsof -t -i:3131)`) or use a different port.

### Agent process exits immediately with error

The server logs the exit code and the stderr output to the console. Common causes:

| Cause | Fix |
|-------|-----|
| `claude: command not found` | Install Claude Code, add to PATH |
| Permission denied on project path | `chmod -R u+rw <localPath>` |
| Skill file not found | Run `bash ~/.agentic-dev-stack/scripts/init.sh` from your project root to install agents |
| Python/Node not found in PATH | Start server from a terminal with the full environment |

---

## See Also

- [`README.md`](README.md) — Stack overview, agent table, NNN convention
- [`DARK_FACTORY_GUIDE.md`](DARK_FACTORY_GUIDE.md) — Architectural philosophy and agent design
- [`BROWNFIELD_GUIDE.md`](BROWNFIELD_GUIDE.md) — Adopting APM in an existing project
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — How to extend the stack
- [`dashboard/server.js`](dashboard/server.js) — Orchestrator backend source
- [`dashboard/index.html`](dashboard/index.html) — Dashboard UI source
