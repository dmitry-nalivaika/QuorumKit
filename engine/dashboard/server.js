/**
 * *  • /api/config              → GET / POST project config
 *  • /api/agents              → GET live agent status
 *  • /api/invoke              → POST invoke an agent in a real shell
 *  • /api/terminal            → POST open a native terminal for an agent
 *  • /api/stop                → POST stop a running agent
 *  • /api/pipelines           → GET list pipelines from project .apm/pipelines/
 *  • /api/pipeline/trigger    → POST create a manual pipeline run (broadcasts pipeline-event)
 *  • /api/pipeline/approve    → POST broadcast approval for a waiting run
 *  • /webhook/pipeline-event  → POST receive Orchestrator pipeline state (FR-007)ark Factory — Orchestrator Backend
 *
 * Provides:
 *  • HTTP server  → serves index.html
 *  • WebSocket    → real-time log streaming + agent state
 *  • /api/config  → GET / POST project config
 *  • /api/agents  → GET live agent status
 *  • /api/invoke  → POST invoke an agent in a real shell
 *  • /api/terminal→ POST open a native terminal for an agent
 *  • /api/stop    → POST stop a running agent
 *  • /webhook/pipeline-event  → POST receive Orchestrator pipeline state (FR-007)
 *  • /api/pipelines           → GET list pipelines from .apm/pipelines/
 *  • /api/pipeline/trigger    → POST manually trigger a pipeline run
 *  • /api/pipeline/approve    → POST approve a waiting pipeline run
 *
 *  • /api/local-pipelines        → GET list local feature worktrees
 *  • /api/local-pipelines/start  → POST start a pipeline (calls pipeline.sh)
 *  • /api/local-pipelines/stop   → POST stop a pipeline (calls pipeline.sh)
 *  • /api/local-pipelines/:n/join→ GET return worktree path for issue N
 *  • /api/timeline/:n            → GET fetch + parse GitHub issue comment timeline
 *
 * Usage:
 *   node server.js [--port 3131]
 */

'use strict';

const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const { exec, spawn }  = require('child_process');
const { WebSocketServer } = require('ws');
const os         = require('os');

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const PORT = parseInt(args[args.indexOf('--port') + 1] || process.env.QUORUMKIT_PORT || '3131', 10);
const DASHBOARD_DIR = __dirname;
const CONFIG_FILE   = path.join(DASHBOARD_DIR, '.apm-project.json');

// ─── Shell PATH enrichment ────────────────────────────────────────────────────
// When Node is launched by a script (not a login shell), $PATH is minimal.
// Resolve the user's real interactive-shell PATH once at startup so spawned
// processes can find claude, code, etc.
let SHELL_PATH = process.env.PATH || '';
try {
  const shell = process.env.SHELL || '/bin/zsh';
  const result = require('child_process').spawnSync(shell, ['-ilc', 'echo $PATH'], {
    encoding: 'utf8', timeout: 3000, env: process.env,
  });
  if (result.stdout) {
    // spawnSync with -i may emit PS1/banner lines; grab the last non-empty line
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const pathLine = lines[lines.length - 1];
    if (pathLine && pathLine.includes('/')) SHELL_PATH = pathLine;
  }
} catch { /* keep existing PATH */ }

// Common macOS tool locations to append if not already present
const EXTRA_PATHS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  path.join(os.homedir(), '.npm-global', 'bin'),
  path.join(os.homedir(), '.local', 'bin'),
  // VS Code CLI shims — /Applications first (proper install location), numbered versions win
  '/Applications/Visual Studio Code 3.app/Contents/Resources/app/bin',
  '/Applications/Visual Studio Code 2.app/Contents/Resources/app/bin',
  '/Applications/Visual Studio Code.app/Contents/Resources/app/bin',
  path.join(os.homedir(), 'Applications', 'Visual Studio Code 3.app', 'Contents', 'Resources', 'app', 'bin'),
  path.join(os.homedir(), 'Applications', 'Visual Studio Code 2.app', 'Contents', 'Resources', 'app', 'bin'),
  path.join(os.homedir(), 'Applications', 'Visual Studio Code.app',   'Contents', 'Resources', 'app', 'bin'),
  // Claude Code common install paths
  path.join(os.homedir(), '.claude', 'local'),
  path.join(os.homedir(), '.npm', 'bin'),
];
const pathParts = new Set(SHELL_PATH.split(':').filter(Boolean));
EXTRA_PATHS.forEach(p => pathParts.add(p));
SHELL_PATH = [...pathParts].join(':');

/** Resolve the absolute path of a CLI binary, checking known locations */
function resolveBin(name) {
  for (const dir of pathParts) {
    const full = path.join(dir, name);
    try { fs.accessSync(full, fs.constants.X_OK); return full; } catch { /* try next */ }
  }
  return name; // fallback — let the shell resolve it
}

/** Enriched env for all spawned processes */
function spawnEnv() {
  return { ...process.env, PATH: SHELL_PATH, FORCE_COLOR: '0' };
}

// ─── In-memory state ─────────────────────────────────────────────────────────
/** @type {Map<string, {pid:number, proc:import('child_process').ChildProcess, agent:string, startedAt:number, status:'running'|'done'|'error', log:string[]}>} */
const running = new Map(); // agentId → process info
let   seq     = 0;         // kanban card id sequence

// ─── Kanban ring buffer ──────────────────────────────────────────────────────
// Persists recent board cards in memory so reconnecting browsers can replay
// the live state instead of starting from the demo seed every time.
const KANBAN_MAX = 60;
/** @type {Array<{id:string, agentId:string, agent:string, title:string, col:'todo'|'wip'|'done'}>} */
const kanbanCards = [];

function kanbanAdd(col, card) {
  // card: { id, agentId, agent, title }
  const entry = { id: String(card.id), agentId: card.agentId, agent: card.agent, title: card.title, col };
  kanbanCards.push(entry);
  while (kanbanCards.length > KANBAN_MAX) kanbanCards.shift();
  broadcast('kanban', { action: 'add', col, card: { ...card, id: entry.id } });
  return entry;
}

function kanbanMove(matcher, col) {
  // matcher: { agentId } or { id }
  // Move the most recent matching card so re-runs of the same agent target
  // the right card and don't ping-pong an old WIP entry.
  for (let i = kanbanCards.length - 1; i >= 0; i--) {
    const e = kanbanCards[i];
    if ((matcher.id && e.id === String(matcher.id)) ||
        (matcher.agentId && e.agentId === matcher.agentId && e.col !== col)) {
      e.col = col;
      broadcast('kanban', { action: 'move', id: e.id, agentId: e.agentId, col });
      return e;
    }
  }
  // Fall back to a bare move event so old clients still react.
  broadcast('kanban', { action: 'move', ...matcher, col });
  return null;
}

/**
 * Default project config — user fills this in via the UI or .apm-project.json
 *
 * On first run we try to auto-detect:
 *   • localPath  — the directory the user launched start.sh from
 *                  (passed in via QUORUMKIT_PROJECT_DIR), falling back to the
 *                  parent of the dashboard dir (handy when the package is
 *                  vendored inside the project).
 *   • repoUrl    — `git config --get remote.origin.url`
 *   • branch     — `git rev-parse --abbrev-ref HEAD`
 * so the user doesn't have to open Settings before invoking their first agent.
 */
function autoDetectProject() {
  // 1) Resolve the project directory.
  let localPath = process.env.QUORUMKIT_PROJECT_DIR || '';
  if (!localPath) {
    // Heuristic: if the dashboard lives under <project>/ (e.g. vendored as
    // node_modules/quorumkit/dashboard or vendor/.../dashboard),
    // walk up looking for a .git directory.
    let cur = path.resolve(DASHBOARD_DIR, '..');
    for (let i = 0; i < 5 && cur !== '/'; i++) {
      if (fs.existsSync(path.join(cur, '.git'))) { localPath = cur; break; }
      cur = path.dirname(cur);
    }
  }
  // Last-resort fallback: the package's own parent directory.
  if (!localPath) localPath = path.resolve(DASHBOARD_DIR, '..');

  // 2) Try to read git remote + branch from that directory.
  let repoUrl = '';
  let branch  = 'main';
  try {
    if (fs.existsSync(path.join(localPath, '.git'))) {
      const cp = require('child_process');
      const opts = { cwd: localPath, encoding: 'utf8', timeout: 2000 };
      const url = cp.spawnSync('git', ['config', '--get', 'remote.origin.url'], opts);
      if (url.status === 0 && url.stdout) repoUrl = url.stdout.trim();
      const br = cp.spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts);
      if (br.status === 0 && br.stdout) {
        const b = br.stdout.trim();
        if (b && b !== 'HEAD') branch = b;
      }
    }
  } catch { /* git not available — keep defaults */ }

  return { localPath, repoUrl, branch };
}

/** Derive a human-readable project name from a repo URL or local path. */
function deriveProjectName(repoUrl, localPath) {
  // Prefer the repo name from the git remote URL (works for SSH and HTTPS).
  if (repoUrl) {
    const m = repoUrl.match(/[/:]([^/:]+?)(?:\.git)?\/?$/);
    if (m && m[1]) return m[1];
  }
  if (localPath) return path.basename(localPath);
  return 'project';
}

function defaultConfig() {
  const detected = autoDetectProject();
  return {
    repoUrl:     detected.repoUrl,
    localPath:   detected.localPath,
    branch:      detected.branch,
    projectName: deriveProjectName(detected.repoUrl, detected.localPath),
    aiTool:      'claude',   // 'claude' | 'copilot' | 'custom'
    customCmd:   '',         // used when aiTool === 'custom'
    terminalApp: autoDetectTerminal(),
    vscodeApp:   '',         // override: e.g. 'Visual Studio Code 3' (leave blank = auto-detect)
  };
}

function loadConfig() {
  const defaults = defaultConfig();
  let cfg;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const merged = { ...defaults, ...saved };
      for (const k of ['localPath', 'repoUrl', 'branch']) {
        if (!merged[k] && defaults[k]) merged[k] = defaults[k];
      }
      if (!merged.projectName) {
        merged.projectName = deriveProjectName(merged.repoUrl, merged.localPath);
      }
      cfg = merged;
    }
  } catch { /* ignore */ }
  if (!cfg) cfg = defaults;
  // QUORUMKIT_PROJECT_DIR always wins — useful for tests and CLI invocations.
  if (process.env.QUORUMKIT_PROJECT_DIR) cfg.localPath = process.env.QUORUMKIT_PROJECT_DIR;
  return cfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

// ─── Terminal detection ───────────────────────────────────────────────────────
function autoDetectTerminal() {
  const platform = os.platform();
  if (platform === 'darwin') {
    // Check for popular terminals on macOS
    for (const app of ['iTerm', 'Warp', 'Alacritty', 'kitty']) {
      if (fs.existsSync(`/Applications/${app}.app`)) return app.toLowerCase();
    }
    return 'terminal'; // macOS Terminal.app
  }
  if (platform === 'linux') return 'gnome-terminal';
  if (platform === 'win32') return 'wt'; // Windows Terminal
  return 'terminal';
}

/**
 * Build the shell command that opens a new native terminal tab/window
 * running `cmd` inside `cwd`.
 */
function buildTerminalCmd(terminalApp, cwd, cmd, title) {
  const safeCmd = cmd.replace(/'/g, "\\'");
  const safeTitle = (title || 'QuorumKit Agent').replace(/'/g, "\\'");
  const safeCwd = (cwd || os.homedir()).replace(/'/g, "\\'");

  switch (terminalApp) {
    case 'iterm':
      return `osascript -e 'tell application "iTerm2"
  activate
  tell current window
    create tab with default profile
    tell current session
      set name to "${safeTitle}"
      write text "cd \\"${safeCwd}\\" && ${safeCmd}"
    end tell
  end tell
end tell'`;

    case 'warp':
      return `open -a Warp "${safeCwd}"`;  // Warp opens to folder; cmd not injectable via AppleScript easily

    case 'terminal':  // macOS Terminal.app
      return `osascript -e 'tell application "Terminal"
  activate
  do script "cd \\"${safeCwd}\\" && ${safeCmd}"
end tell'`;

    case 'gnome-terminal':
      return `gnome-terminal --title="${safeTitle}" -- bash -c 'cd "${safeCwd}" && ${safeCmd}; exec bash'`;

    case 'xterm':
      return `xterm -title "${safeTitle}" -e bash -c 'cd "${safeCwd}" && ${safeCmd}; exec bash' &`;

    case 'wt':  // Windows Terminal
      return `wt new-tab --title "${safeTitle}" --startingDirectory "${safeCwd}" cmd /k ${safeCmd}`;

    default:
      return `osascript -e 'tell application "Terminal" to do script "cd \\"${safeCwd}\\" && ${safeCmd}"'`;
  }
}

/**
 * Build the AI agent invocation command string.
 * agentId is the QuorumKit short id; localPath is the project root.
 *
 * For `copilot` mode this returns a special sentinel object instead of a
 * shell string, because VS Code must be opened via `open`/AppleScript, not
 * spawned as a child process.
 */
function buildAgentCmd(agentId, cfg, agentName) {
  // Normalise some IDs to skill folder names
  const idToSkill = {
    ba: 'ba', developer: 'dev', qa: 'qa', reviewer: 'reviewer',
    architect: 'architect', devops: 'devops', security: 'security',
    triage: 'triage', release: 'release', docs: 'docs',
    techdebt: 'tech-debt', ot: 'ot-integration', twin: 'digital-twin',
    compliance: 'compliance', incident: 'incident',
  };

  // SEC-HIGH-003: agentId must be in the known allowlist before any shell use.
  if (!Object.prototype.hasOwnProperty.call(idToSkill, agentId)) {
    throw Object.assign(new Error(`Unknown agentId: ${agentId}`), { code: 'UNKNOWN_AGENT_ID' });
  }
  // SEC-HIGH-003: agentName must not contain shell-special characters.
  const safeAgentName = (agentName || agentId).replace(/[^a-zA-Z0-9 _\-]/g, '');
  const skill = idToSkill[agentId] || agentId;
  const agentFileName =
    skill === 'ba'              ? 'ba-product-agent.md'       :
    skill === 'dev'             ? 'developer-agent.md'        :
    skill === 'qa'              ? 'qa-test-agent.md'          :
    skill === 'tech-debt'       ? 'tech-debt-agent.md'        :
    skill === 'ot-integration'  ? 'ot-integration-agent.md'   :
    skill === 'digital-twin'    ? 'digital-twin-agent.md'     :
                                  `${skill}-agent.md`;

  const workDir = cfg.localPath || '.';

  // Agent definitions live in .github/agents/ (installed by init.sh).
  // Instructions (formerly skills) live in .github/instructions/.
  // Fall back to the package's own src/ copies for local development.
  function resolveFile(...candidates) {
    for (const rel of candidates) {
      const abs = path.isAbsolute(rel) ? rel : path.join(workDir, rel);
      if (fs.existsSync(abs)) return abs;
    }
    return candidates[0]; // last-resort: return first candidate (may not exist)
  }
  const skillFile = resolveFile(
    path.join('.github', 'instructions', `${skill}-agent.instructions.md`),
    path.join(DASHBOARD_DIR, '..', 'src', '.github', 'instructions', `${skill}-agent.instructions.md`)
  );
  const agentFile = resolveFile(
    path.join('.github', 'agents', agentFileName),
    path.join(DASHBOARD_DIR, '..', 'src', 'agents', agentFileName)
  );

  const qWork   = workDir.replace(/"/g, '\\"');
  const qSkill  = skillFile.replace(/"/g, '\\"');

  switch (cfg.aiTool) {
    case 'claude': {
      // Resolve the claude binary through the enriched PATH
      const claudeBin = resolveBin('claude');
      return fs.existsSync(skillFile)
        ? `"${claudeBin}" --system-prompt "${qSkill}" --cwd "${qWork}"`
        : `"${claudeBin}" --cwd "${qWork}"`;
    }

    case 'copilot':
      // VS Code cannot be meaningfully spawned as a background process.
      // Return a sentinel — the caller will handle it specially.
      return { __copilot: true, workDir, skillFile, agentFile, agentName: safeAgentName };

    case 'custom':
      // SEC-HIGH-003: use sanitised values only — never raw agentId/agentName from the request body.
      return (cfg.customCmd || 'bash')
        .replace('{agent}', agentId)
        .replace('{agentName}', safeAgentName)
        .replace('{skill}', skillFile)
        .replace('{cwd}', workDir);

    default:
      // Shell mode: print the agent definition then drop into an interactive shell
      return fs.existsSync(agentFile)
        ? `cat "${agentFile.replace(/"/g,'\\"')}" && printf '\\n═══ Agent console ready — type your instructions ═══\\n' && bash`
        : `echo "Agent: ${safeAgentName}" && bash`;
  }
}

// ─── WebSocket broadcast ─────────────────────────────────────────────────────
let wss;
function broadcast(type, payload) {
  if (!wss) return;
  const msg = JSON.stringify({ type, ...payload });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', d => { b += d; });
    req.on('end', () => {
      try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); }
    });
  });
}

// ─── Pipeline-sh path resolution ─────────────────────────────────────────────
// QUORUMKIT_TEST_PIPELINE_SH lets tests inject a stub; otherwise we resolve
// the script relative to the project root detected by autoDetectProject().
function resolvePipelineSh(localPath) {
  if (process.env.QUORUMKIT_TEST_PIPELINE_SH) return process.env.QUORUMKIT_TEST_PIPELINE_SH;
  // Try <project>/scripts/pipeline.sh first, then package-relative location.
  const candidates = [
    localPath && path.join(localPath, 'scripts', 'pipeline.sh'),
    path.resolve(DASHBOARD_DIR, '..', '..', 'scripts', 'pipeline.sh'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch { /* try next */ }
  }
  return candidates[0] || 'scripts/pipeline.sh'; // best-effort fallback
}

/** Run pipeline.sh with given args; resolves with { stdout, stderr }. */
function runPipelineSh(localPath, args) {
  return new Promise((resolve, reject) => {
    const script = resolvePipelineSh(localPath);
    // SEC: args come from validated server-side values only (integers + slug)
    const proc = require('child_process').spawn(
      'bash', [script, ...args],
      { cwd: localPath || process.cwd(), env: spawnEnv(), stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(Object.assign(new Error(stderr.trim() || `pipeline.sh exited ${code}`), { code }));
    });
    proc.on('error', reject);
  });
}

// ─── Local pipeline list (git worktree list --porcelain) ─────────────────────
/**
 * Returns all worktrees whose branch matches the NNN-slug pattern.
 * @param {string} localPath  — project root (where .git lives)
 * @returns {Promise<Array<{issueNumber:number, branch:string, path:string, head:string}>>}
 */
/**
 * Returns all worktrees whose branch matches the NNN-slug pattern.
 * Extended response includes createdAt (from git log), mode (from path vs
 * QUORUMKIT_PIPELINES_DIR), and runningAgent (true if a managed process is
 * currently running with cwd inside the worktree path).
 *
 * FR-176-001, FR-176-007, FR-176-015
 */
function listLocalPipelines(localPath) {
  return new Promise((resolve, reject) => {
    if (!localPath) { resolve([]); return; }
    const pipelinesDir = process.env.QUORUMKIT_PIPELINES_DIR || '';
    const proc = require('child_process').spawn(
      'git', ['worktree', 'list', '--porcelain'],
      { cwd: localPath, env: spawnEnv(), stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.on('close', () => {
      const pipelines = [];
      const blocks = out.trim().split(/\n\n+/);
      for (const block of blocks) {
        const lines  = block.trim().split('\n');
        const wt     = lines.find(l => l.startsWith('worktree '))?.slice('worktree '.length).trim();
        const head   = lines.find(l => l.startsWith('HEAD '))?.slice('HEAD '.length).trim();
        const branch = lines.find(l => l.startsWith('branch '))
                             ?.slice('branch '.length).replace('refs/heads/', '').trim();
        if (!branch || !/^\d+-[a-z0-9][a-z0-9-]*$/.test(branch)) continue;

        // FR-176-015: filter to QUORUMKIT_PIPELINES_DIR when set
        if (pipelinesDir && wt && !wt.startsWith(pipelinesDir)) continue;

        const num = parseInt(branch.split('-')[0], 10);

        // Derive creation date from the worktree HEAD commit timestamp
        let createdAt = null;
        if (wt && head) {
          try {
            const cp   = require('child_process');
            const res  = cp.spawnSync('git', ['log', '-1', '--format=%cI', head],
              { cwd: wt, env: spawnEnv(), encoding: 'utf8', timeout: 2000 });
            if (res.status === 0 && res.stdout) createdAt = res.stdout.trim();
          } catch { /* non-fatal */ }
        }

        // Derive mode: 'shared' if worktree is under the main repo (same git dir),
        // 'isolated' if it lives in a separate directory (the typical parallel case).
        const mode = (wt && localPath && wt.startsWith(localPath)) ? 'shared' : 'isolated';

        // runningAgent: true if any tracked agent process has cwd inside this worktree
        const runningAgent = wt
          ? [...(global._agentProcesses || new Map()).values()]
              .some(p => p.cwd && p.cwd.startsWith(wt))
          : false;

        pipelines.push({ issueNumber: num, branch, path: wt || '', head: head || '',
                         createdAt, mode, runningAgent });
      }
      resolve(pipelines);
    });
    proc.on('error', reject);
  });
}

/**
 * Derive a branch slug from a GitHub Issue title.
 * Lowercases, strips non-alphanumeric, truncates to 40 chars.
 * FR-176-003
 */
async function deriveSlugFromIssue(issueNumber, cfg) {
  const repoUrl   = cfg.repoUrl || process.env.QUORUMKIT_REPO_URL || '';
  const repoMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!repoMatch) return `${issueNumber}-feature`;
  const owner = repoMatch[1];
  const repo  = repoMatch[2].replace(/\.git$/, '');
  try {
    const ghBin = process.env.QUORUMKIT_TEST_GH_BIN || resolveBin('gh');
    const res   = require('child_process').spawnSync(
      ghBin, ['api', `repos/${owner}/${repo}/issues/${issueNumber}`, '--jq', '.title'],
      { env: spawnEnv(), encoding: 'utf8', timeout: 8000 }
    );
    if (res.status === 0 && res.stdout) {
      const title = res.stdout.trim();
      const slug  = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'feature';
      return slug;
    }
  } catch { /* fall through */ }
  return `${issueNumber}-feature`;
}

// ─── Timeline fetch + parse (FR-177) ─────────────────────────────────────────
/** In-memory timeline cache: issueNumber → { data, fetchedAt } */
const _timelineCache = new Map();
const TIMELINE_CACHE_TTL = 25_000; // ms

/**
 * Parse a single GitHub comment body into a structured event (or null).
 * Handles:
 *   1. agent-footprint markers (<!-- agent-footprint: start|complete|fail -->)
 *   2. ```apm-msg JSON blocks
 */
function parseCommentToEvent(comment) {
  const body = comment.body || '';

  // ── 1. apm-msg block (highest priority — check before footprint marker) ──────
  const apmMatch = body.match(/```apm-msg\s*([\s\S]*?)```/);
  if (apmMatch) {
    try {
      const parsed = JSON.parse(apmMatch[1].trim());
      const safeBody = body.replace(/<[^>]+>/g, '').slice(0, 2000);
      return {
        source:    'apm-msg',
        eventType: parsed.event_type || parsed.outcome || 'unknown',
        agent:     parsed.agent || 'unknown',
        outcome:   parsed.outcome,
        summary:   parsed.summary || '',
        timestamp: parsed.timestamp || comment.created_at,
        runId:     parsed.runId,
        step:      parsed.step,
        iteration: parsed.iteration,
        pipelineId: parsed.pipeline_id,
        commentId: comment.id,
        commentUrl: comment.html_url || '',
        body:      safeBody,
      };
    } catch { /* malformed JSON — fall through */ }
  }

  // ── 2. agent-footprint marker ──────────────────────────────────────────────
  const footprintMatch = body.match(/<!--\s*agent-footprint:\s*(start|complete|fail)\s*-->/i);
  if (footprintMatch) {
    const eventType = footprintMatch[1].toLowerCase();
    // Extract agent name from "**Agent ...:** `agent-name`" pattern
    const agentMatch = body.match(/\*\*Agent [^:]+:\*\*\s*`([^`]+)`/i);
    const agent = agentMatch?.[1] || 'unknown';
    // Extract summary if present
    const summaryMatch = body.match(/\*\*Summary:\*\*\s*(.+)/);
    const summary = summaryMatch?.[1]?.trim() || '';
    // Sanitise body (strip HTML)
    const safeBody = body.replace(/<[^>]+>/g, '').slice(0, 2000);
    return {
      source:    'footprint',
      eventType,
      agent,
      summary,
      timestamp: comment.created_at,
      commentId: comment.id,
      commentUrl: comment.html_url || '',
      body:      safeBody,
    };
  }

  return null;
}

/**
 * Derive overall pipeline status from a list of events.
 * Last apm-msg outcome wins; 'awaiting-approval' if any approval gate found.
 */
function derivePipelineStatus(events) {
  // Check for approval gate comments first
  const statusFromEvents = [...events].reverse();
  for (const e of statusFromEvents) {
    if (e.source === 'apm-msg') {
      if (e.outcome === 'success' || e.outcome === 'spec-ready') return 'success';
      if (e.outcome === 'fail' || e.outcome === 'runtime-error') return 'failed';
      if (e.outcome === 'awaiting-approval') return 'awaiting-approval';
      if (e.eventType === 'complete') return 'success';
      if (e.eventType === 'fail') return 'failed';
    }
  }
  // If there are footprint start events but no complete → running
  const hasStart    = events.some(e => e.eventType === 'start');
  const hasComplete = events.some(e => ['complete', 'success'].includes(e.eventType));
  if (hasStart && !hasComplete) return 'running';
  if (hasComplete) return 'success';
  return 'unknown';
}

/**
 * Fetch and parse the timeline for a GitHub issue.
 * Uses `gh api` CLI (already authenticated) and the in-memory cache.
 */
async function fetchTimeline(issueNumber, cfg) {
  const now = Date.now();
  const cached = _timelineCache.get(issueNumber);
  if (cached && (now - cached.fetchedAt) < TIMELINE_CACHE_TTL) {
    return cached.data;
  }

  // Derive owner/repo from configured repoUrl or env var
  const repoUrl = cfg.repoUrl || process.env.QUORUMKIT_REPO_URL || '';
  const repoMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!repoMatch) {
    throw new Error('Repository URL not configured — open Settings and set the GitHub repo URL');
  }
  const owner = repoMatch[1];
  const repo  = repoMatch[2].replace(/\.git$/, '');

  // SEC: issueNumber validated as positive integer by caller; owner/repo derived
  // from config, not user input — no injection risk.
  const apiPath = `repos/${owner}/${repo}/issues/${issueNumber}/comments`;
  const rawJson = await new Promise((resolve, reject) => {
    // QUORUMKIT_TEST_GH_BIN lets tests inject a stub binary (same pattern as
    // QUORUMKIT_TEST_PIPELINE_SH) to avoid hitting the real GitHub API.
    const ghBin = process.env.QUORUMKIT_TEST_GH_BIN || resolveBin('gh');
    const proc  = require('child_process').spawn(
      ghBin, ['api', apiPath, '--paginate'],
      { env: spawnEnv(), stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '', err = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });
    proc.on('close', code => {
      if (code === 0) resolve(out);
      else reject(new Error(`gh api failed (${code}): ${err.trim().slice(0, 200)}`));
    });
    proc.on('error', reject);
  });

  let comments;
  try { comments = JSON.parse(rawJson); }
  catch { throw new Error('Failed to parse GitHub API response'); }

  if (!Array.isArray(comments)) comments = [];

  const events = comments
    .map(c => parseCommentToEvent(c))
    .filter(Boolean);

  const data = {
    events,
    status: derivePipelineStatus(events),
    meta: {
      issueNumber,
      totalComments:    comments.length,
      structuredEvents: events.length,
      fetchedAt:        new Date().toISOString(),
    },
  };

  _timelineCache.set(issueNumber, { data, fetchedAt: now });
  return data;
}

// ─── HTTP routes ─────────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  // ── GET / → index.html ─────────────────────────────────────────
  if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(path.join(DASHBOARD_DIR, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500); res.end('Cannot read index.html');
    }
    return;
  }

  // ── GET /api/config ────────────────────────────────────────────
  if (method === 'GET' && url.pathname === '/api/config') {
    json(res, 200, loadConfig()); return;
  }

  // ── POST /api/config ───────────────────────────────────────────
  if (method === 'POST' && url.pathname === '/api/config') {
    const body = await readBody(req);
    const cfg  = { ...loadConfig(), ...body };
    saveConfig(cfg);
    broadcast('config', { cfg });
    json(res, 200, { ok: true, cfg }); return;
  }

  // ── POST /webhook/pipeline-event (FR-007) ─────────────────────
  // Receives pipeline state transition payloads from the GHA Orchestrator
  // workflow and broadcasts them over the existing WebSocket channel.
  // SEC-HIGH-001: Requires X-QuorumKit-Webhook-Secret header matching QUORUMKIT_WEBHOOK_SECRET
  // env var (constant-time comparison). When QUORUMKIT_WEBHOOK_SECRET is not set the
  // endpoint is disabled entirely — callers receive 403.
  if (method === 'POST' && url.pathname === '/webhook/pipeline-event') {
    const expectedSecret = process.env.QUORUMKIT_WEBHOOK_SECRET || '';
    if (!expectedSecret) {
      json(res, 403, { error: 'Webhook endpoint is disabled: QUORUMKIT_WEBHOOK_SECRET is not configured' });
      return;
    }
    const providedSecret = req.headers['x-quorumkit-webhook-secret'] || '';
    const expected = Buffer.from(expectedSecret);
    const provided = Buffer.from(providedSecret);
    const secretsMatch =
      expected.length === provided.length &&
      crypto.timingSafeEqual(expected, provided);
    if (!secretsMatch) {
      json(res, 403, { error: 'Forbidden: invalid or missing X-QuorumKit-Webhook-Secret' });
      return;
    }
    const body = await readBody(req);
    // Minimal shape validation
    if (!body || typeof body.runId !== 'string' || typeof body.status !== 'string') {
      json(res, 400, { error: 'payload must include runId (string) and status (string)' }); return;
    }
    broadcast('pipeline-event', body);
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  // ── GET /api/pipelines ────────────────────────────────────────────
  // Returns a list of pipeline names loaded from the project's .apm/pipelines/ dir.
  if (method === 'GET' && url.pathname === '/api/pipelines') {
    const cfg = loadConfig();
    const pipelines = [];
    if (cfg.localPath) {
      const pipeDir = path.join(cfg.localPath, '.apm', 'pipelines');
      try {
        const files = fs.readdirSync(pipeDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
        for (const f of files) {
          try {
            const raw = fs.readFileSync(path.join(pipeDir, f), 'utf8');
            // Quick parse: grab `name:` line without a full YAML dependency here
            const nameMatch = raw.match(/^name:\s*(.+)$/m);
            const stepsMatch = [...raw.matchAll(/^\s*-\s*name:\s*(.+)$/gm)];
            pipelines.push({
              name: nameMatch ? nameMatch[1].trim() : f.replace(/\.ya?ml$/, ''),
              file: f,
              steps: stepsMatch.map(m => m[1].trim()),
            });
          } catch { /* skip unreadable file */ }
        }
      } catch { /* dir missing — return empty */ }
    }
    json(res, 200, { pipelines }); return;
  }

  // ── POST /api/pipeline/trigger ───────────────────────────────────
  // Creates a synthetic pipeline-event (status: pending) and broadcasts it.
  // The actual GHA run must be triggered separately (via GitHub webhook).
  // This endpoint is for dashboard-initiated manual runs / local dev testing.
  if (method === 'POST' && url.pathname === '/api/pipeline/trigger') {
    const body = await readBody(req);
    const { pipeline, issueNumber } = body;
    if (!pipeline || typeof pipeline !== 'string') {
      json(res, 400, { error: 'pipeline (string) required' }); return;
    }
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Load step names from disk so the progress bar is accurate
    const cfg = loadConfig();
    let steps = [];
    if (cfg.localPath) {
      const pipeDir = path.join(cfg.localPath, '.apm', 'pipelines');
      try {
        const files = fs.readdirSync(pipeDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
        for (const f of files) {
          const raw = fs.readFileSync(path.join(pipeDir, f), 'utf8');
          const nameMatch = raw.match(/^name:\s*(.+)$/m);
          if (nameMatch && nameMatch[1].trim() === pipeline) {
            const stepsMatch = [...raw.matchAll(/^\s*-\s*name:\s*(.+)$/gm)];
            steps = stepsMatch.map(m => m[1].trim());
            break;
          }
        }
      } catch { /* ignore */ }
    }

    const event = {
      runId,
      pipeline,
      status: 'pending',
      step: steps[0] || '',
      currentStepIndex: 0,
      steps,
      issueNumber: issueNumber || null,
      updatedAt: new Date().toISOString(),
    };
    broadcast('pipeline-event', event);
    json(res, 200, { ok: true, runId, steps }); return;
  }

  // ── POST /api/pipeline/approve ───────────────────────────────────
  // Broadcasts an approval event for a waiting run (dashboard convenience).
  if (method === 'POST' && url.pathname === '/api/pipeline/approve') {
    const body = await readBody(req);
    const { runId } = body;
    if (!runId || typeof runId !== 'string') {
      json(res, 400, { error: 'runId (string) required' }); return;
    }
    broadcast('pipeline-event', { runId, status: 'approved', updatedAt: new Date().toISOString() });
    json(res, 200, { ok: true }); return;
  }

  // ── GET /api/agents ────────────────────────────────────────────
  if (method === 'GET' && url.pathname === '/api/agents') {
    const statuses = {};
    running.forEach((v, k) => {
      statuses[k] = { status: v.status, startedAt: v.startedAt, pid: v.pid };
    });
    json(res, 200, { statuses }); return;
  }

  // ── POST /api/invoke ────────────────────────────────────────────
  if (method === 'POST' && url.pathname === '/api/invoke') {
    const body = await readBody(req);
    const { agentId, agentName, mode = 'background' } = body;
    if (!agentId) { json(res, 400, { error: 'agentId required' }); return; }
    // FR-001: extract pipeline_id; accept only digit strings to prevent path-traversal.
    const pipelineId = (typeof body.pipeline_id === 'string' && /^\d+$/.test(body.pipeline_id))
      ? body.pipeline_id : null;

    const cfg = loadConfig();
    let result;
    try {
      result = await invokeAgent(agentId, agentName || agentId, cfg, mode, pipelineId);
    } catch (err) {
      if (err.code === 'UNKNOWN_AGENT_ID') { json(res, 400, { error: err.message }); return; }
      throw err;
    }
    json(res, 200, result); return;
  }

  // ── POST /api/terminal ─────────────────────────────────────────
  if (method === 'POST' && url.pathname === '/api/terminal') {
    const body = await readBody(req);
    const { agentId, agentName } = body;
    if (!agentId) { json(res, 400, { error: 'agentId required' }); return; }
    // FR-005: extract pipeline_id for worktree resolution
    const termPipelineId = (typeof body.pipeline_id === 'string' && /^\d+$/.test(body.pipeline_id))
      ? body.pipeline_id : null;

    const cfg = loadConfig();
    let cmd;
    try {
      cmd = buildAgentCmd(agentId, cfg, agentName || agentId);
    } catch (err) {
      if (err.code === 'UNKNOWN_AGENT_ID') { json(res, 400, { error: err.message }); return; }
      throw err;
    }

    // Copilot mode: write context file + open VS Code (no terminal needed)
    if (cmd && typeof cmd === 'object' && cmd.__copilot) {
      // FR-004: resolve worktree path and override workDir in sentinel
      const { worktreePath: copilotWorktree } = await resolveWorktreePath(termPipelineId, cfg, agentId);
      const copilotCmd = { ...cmd, workDir: copilotWorktree };
      broadcast('log', { agentId, level: 'info', msg: `Opening VS Code for ${agentName}…` });
      broadcast('agentStatus', { agentId, status: 'running' });
      await handleCopilotInvoke(agentId, agentName || agentId, copilotCmd, termPipelineId);
      json(res, 200, { ok: true, mode: 'copilot' }); return;
    }

    // FR-005: resolve worktree path for non-Copilot terminal launch
    const { worktreePath: termCwd } = await resolveWorktreePath(termPipelineId, cfg, agentId);
    const termCmd = buildTerminalCmd(cfg.terminalApp, termCwd, cmd, `QuorumKit — ${agentName}`);
    exec(termCmd, { env: spawnEnv() }, (err) => {
      if (err) {
        broadcast('log', { agentId, level: 'error', msg: `Failed to open terminal: ${err.message}` });
      } else {
        broadcast('log', { agentId, level: 'success', msg: `Opened terminal for ${agentName}` });
      }
    });

    broadcast('log', { agentId, level: 'info', msg: `Launching native terminal for ${agentName}…` });
    json(res, 200, { ok: true, terminalApp: cfg.terminalApp }); return;
  }

  // ── POST /api/stop ─────────────────────────────────────────────
  if (method === 'POST' && url.pathname === '/api/stop') {
    const body = await readBody(req);
    const { agentId } = body;
    const info = running.get(agentId);
    if (!info) { json(res, 404, { error: 'Not running' }); return; }
    try { info.proc.kill('SIGTERM'); } catch { /* already dead */ }
    running.delete(agentId);
    broadcast('agentStatus', { agentId, status: 'idle' });
    broadcast('log', { agentId, level: 'warn', msg: `${agentId} stopped by user` });
    json(res, 200, { ok: true }); return;
  }

  // ── GET /api/log/:agentId ──────────────────────────────────────
  if (method === 'GET' && url.pathname.startsWith('/api/log/')) {
    const agentId = url.pathname.split('/').pop();
    const info    = running.get(agentId);
    json(res, 200, { log: info ? info.log : [] }); return;
  }

  // ── GET /api/local-pipelines ────────────────────────────────────
  if (method === 'GET' && url.pathname === '/api/local-pipelines') {
    const cfg  = loadConfig();
    const list = await listLocalPipelines(cfg.localPath).catch(() => []);
    json(res, 200, list); return;
  }

  // ── POST /api/local-pipelines/start ────────────────────────────
  if (method === 'POST' && url.pathname === '/api/local-pipelines/start') {
    const body = await readBody(req);
    let { issueNumber, slug, mode = 'isolated' } = body;
    if (!issueNumber || !Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
      json(res, 400, { error: 'issueNumber must be a positive integer' }); return;
    }
    if (slug && !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      json(res, 400, { error: 'slug must match ^[a-z0-9][a-z0-9-]*$' }); return;
    }
    if (!['isolated', 'shared'].includes(mode)) {
      json(res, 400, { error: 'mode must be isolated or shared' }); return;
    }
    const cfg = loadConfig();
    // FR-176-003: auto-derive slug from GitHub Issue title when not supplied
    if (!slug) slug = await deriveSlugFromIssue(Number(issueNumber), cfg);
    const result = await runPipelineSh(cfg.localPath, ['start', String(Number(issueNumber)),
      `${Number(issueNumber)}-${slug}`, `--mode=${mode}`]);
    broadcast('pipelineListChanged', {});
    json(res, 200, { ok: true, slug, ...result }); return;
  }

  // ── POST /api/local-pipelines/stop ─────────────────────────────
  if (method === 'POST' && url.pathname === '/api/local-pipelines/stop') {
    const body = await readBody(req);
    const { issueNumber } = body;
    if (!issueNumber || !Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
      json(res, 400, { error: 'issueNumber must be a positive integer' }); return;
    }
    const cfg = loadConfig();
    const result = await runPipelineSh(cfg.localPath,
      ['stop', String(Number(issueNumber)), '--no-switch']);
    broadcast('pipelineListChanged', {});
    json(res, 200, { ok: true, ...result }); return;
  }

  // ── GET /api/local-pipelines/:n/join ───────────────────────────
  if (method === 'GET' && /^\/api\/local-pipelines\/[^/]+\/join$/.test(url.pathname)) {
    const segment = url.pathname.replace(/^\/api\/local-pipelines\//, '').replace(/\/join$/, '');
    const n = Number(segment);
    if (!Number.isInteger(n) || n <= 0) {
      json(res, 400, { error: 'issueNumber must be a positive integer' }); return;
    }
    const cfg  = loadConfig();
    const list = await listLocalPipelines(cfg.localPath).catch(() => []);
    const found = list.find(p => p.issueNumber === n);
    if (!found) { json(res, 404, { error: `No local pipeline for issue #${n}` }); return; }
    json(res, 200, { branch: found.branch, path: found.path }); return;
  }

  // ── GET /api/timeline/:issueNumber ─────────────────────────────
  // Catches both valid numeric IDs and invalid slugs so we can return 400.
  if (method === 'GET' && url.pathname.startsWith('/api/timeline/')) {
    const segment = url.pathname.slice('/api/timeline/'.length);
    const n = Number(segment);
    if (!Number.isInteger(n) || n <= 0) {
      json(res, 400, { error: 'issueNumber must be a positive integer' }); return;
    }
    const cfg = loadConfig();
    try {
      const result = await fetchTimeline(n, cfg);
      json(res, 200, result);
    } catch (err) {
      json(res, 502, { error: err.message });
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
}

// ─── Copilot invoke (open VS Code + write context file) ──────────────────────
/**
 * Package and install the apm-copilot-bridge extension into the user's normal
 * VS Code, so that on every workspace open it can read .copilot-agent-context.md
 * and submit the prompt to Copilot Chat automatically.
 *
 * Idempotent: a flag file `.installed-version` next to the extension's
 * package.json records the version already installed; subsequent calls are
 * no-ops until the version bumps.
 *
 * The .vsix format is just a zip of the extension folder with an
 * "extension/" prefix, plus a trivial "[Content_Types].xml" — we build it
 * with the system `zip` CLI to avoid any npm dependency.
 */
function ensureBridgeExtensionInstalled(codeBin, agentId) {
  if (!codeBin) throw new Error('no code shim');

  const extDir   = path.join(DASHBOARD_DIR, 'extensions', 'apm-copilot-bridge');
  const pkgPath  = path.join(extDir, 'package.json');
  if (!fs.existsSync(pkgPath)) throw new Error('bridge extension folder missing');

  const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version || '0.0.0';
  const flagFile = path.join(extDir, '.installed-version');

  // Already installed at this version? Skip.
  try {
    if (fs.existsSync(flagFile) &&
        fs.readFileSync(flagFile, 'utf8').trim() === version) {
      return;
    }
  } catch { /* keep going */ }

  // Build the .vsix in a temp dir.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'apm-bridge-'));
  const stage   = path.join(tmpRoot, 'extension');
  fs.mkdirSync(stage, { recursive: true });

  // Copy package.json + extension.js + README (if any) into stage/
  for (const f of ['package.json', 'extension.js', 'README.md']) {
    const src = path.join(extDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(stage, f));
  }

  // Minimal [Content_Types].xml at the root of the .vsix
  const ctXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
</Types>
`;
  fs.writeFileSync(path.join(tmpRoot, '[Content_Types].xml'), ctXml, 'utf8');

  // Minimal extension.vsixmanifest (required by the .vsix installer)
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${pkg.name}" Version="${version}" Publisher="${pkg.publisher || 'apm'}"/>
    <DisplayName>${pkg.displayName || pkg.name}</DisplayName>
    <Description xml:space="preserve">${pkg.description || ''}</Description>
    <Tags>apm,copilot</Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
  </Assets>
</PackageManifest>
`;
  fs.writeFileSync(path.join(tmpRoot, 'extension.vsixmanifest'), manifest, 'utf8');

  // Zip everything into a .vsix
  const vsixPath = path.join(tmpRoot, `${pkg.name}-${version}.vsix`);
  const zipResult = require('child_process').spawnSync(
    'zip', ['-qr', vsixPath, '.'],
    { cwd: tmpRoot, encoding: 'utf8', timeout: 15000 }
  );
  if (zipResult.status !== 0) {
    throw new Error(`zip failed: ${zipResult.stderr || zipResult.status}`);
  }

  // Install into the user's normal VS Code (no --user-data-dir override).
  const installResult = require('child_process').spawnSync(
    codeBin, ['--install-extension', vsixPath, '--force'],
    { encoding: 'utf8', timeout: 30000, env: spawnEnv() }
  );
  if (installResult.status !== 0) {
    throw new Error(`code --install-extension failed: ${installResult.stderr || installResult.stdout}`);
  }

  try { fs.writeFileSync(flagFile, version, 'utf8'); } catch { /* */ }
  broadcast('log', { agentId, level: 'success',
    msg: `Installed apm-copilot-bridge v${version} into VS Code` });
}

/**
 * For GitHub Copilot, we can't pipe output from VS Code.
 * Instead we:
 *  1. Write a temporary .copilot-agent-context.md into the project root
 *     containing the agent's SKILL.md + a ready-to-paste Copilot Chat prompt
 *  2. Open VS Code at the project folder (via `open -a` or the `code` shim)
 *  3. Broadcast instructions to the console telling the user what to do next
 */
async function handleCopilotInvoke(agentId, agentName, sentinel, pipelineId = null) {
  const { workDir, skillFile, agentFile } = sentinel;

  // Relative path inside the consumer project — Copilot reads the locally
  // installed copy rather than receiving the full content inline.
  const agentRelPath = path.join('.github', 'agents', path.basename(agentFile));

  // Full content kept only for the human-readable reference section below.
  const agentDef = fs.existsSync(agentFile) ? fs.readFileSync(agentFile, 'utf8') : '';
  const skillDef = fs.existsSync(skillFile)  ? fs.readFileSync(skillFile, 'utf8')  : '';
  const contextPath = path.join(workDir, '.copilot-agent-context.md');

  // Prompt: tell the agent who it is, point it at its role file,
  // then explicitly ask it to greet and wait — not start autonomous work.
  // NOTE: do NOT prefix with @workspace — that forces Ask mode in VS Code
  // Copilot. The bridge extension opens Agent mode separately before
  // submitting this prompt.
  const pipelineCtxLine = pipelineId
    ? `\n\n**Pipeline context:** You are working on GitHub Issue #${pipelineId}. Your \`pipeline_id\` is \`${pipelineId}\`. Keep all work scoped to this feature.`
    : '';
  const chatPrompt = [
    `You are acting as the **${agentName}**.${pipelineCtxLine}`,
    ``,
    `Read your role definition from \`${agentRelPath}\`.`,
    ``,
    `Say hello: introduce yourself with your name and a one-sentence description of what you do.`,
    `Then **stop and wait for instructions**.`,
    `Do NOT read further files, run commands, or begin any autonomous analysis until the user gives you a specific task.`,
  ].join('\n');

  const contextContent = [
    `# QuorumKit Agent Context — ${agentName}`,
    ...(pipelineId ? [`> Pipeline: Issue #${pipelineId}`] : []),
    `> Auto-generated by QuorumKit Orchestrator. Paste the prompt below into **Agent mode** Copilot Chat (not Ask mode).`,
    '',
    `## Copilot Chat prompt`,
    '```',
    chatPrompt,
    '```',
    '',
    '---',
    '## Full Agent Definition',
    agentDef || '_agent file not found_',
    '',
    '## Instructions',
    skillDef || '_instructions file not found_',
  ].join('\n');

  try { fs.writeFileSync(contextPath, contextContent, 'utf8'); } catch { /* non-fatal */ }

  // ── Find the right VS Code .app ────────────────────────────────────────────
  const cfg2 = loadConfig();
  const platform = os.platform();

  // Resolve the actual .app path (not just the name) so we can call `open` against it.
  // Using the explicit .app path avoids LaunchServices ambiguity when multiple
  // VS Code copies exist (Insiders, numbered duplicates, etc.).
  function resolveVSCodeAppPath(preferredName) {
    const bases = ['/Applications', path.join(os.homedir(), 'Applications')];
    const names = preferredName
      ? [preferredName, 'Visual Studio Code', 'Visual Studio Code - Insiders']
      : ['Visual Studio Code 3', 'Visual Studio Code 2', 'Visual Studio Code', 'Visual Studio Code - Insiders'];
    for (const base of bases) {
      for (const name of names) {
        const p = path.join(base, `${name}.app`);
        if (fs.existsSync(p)) return { appPath: p, appName: name };
      }
    }
    return { appPath: null, appName: preferredName || 'Visual Studio Code' };
  }

  // If a VS Code is already running, *always* prefer THAT .app — otherwise
  // we risk launching a second copy with the same CFBundleIdentifier
  // (com.microsoft.VSCode) which makes the new Electron process exit
  // immediately after appearing in the dock/tray.
  function findRunningVSCodeApp() {
    if (platform !== 'darwin') return null;
    try {
      const r = require('child_process').spawnSync(
        'ps', ['-axo', 'command='], { encoding: 'utf8', timeout: 1500 }
      );
      const lines = (r.stdout || '').split('\n');
      for (const line of lines) {
        const m = line.match(/(\/[^\0]+?Visual Studio Code[^/]*\.app)\/Contents\/MacOS\/(?:Electron|Code)/);
        if (m && fs.existsSync(m[1])) {
          return { appPath: m[1], appName: path.basename(m[1], '.app') };
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  const runningApp = findRunningVSCodeApp();
  const { appPath: vscodeAppPath, appName: vscodeAppName } =
    runningApp || resolveVSCodeAppPath(cfg2.vscodeApp);

  // ── macOS: strip quarantine on the .app once so App Translocation stops ──
  // Translocation moves the .app to a randomised read-only mount, which is the
  // root cause of "VS Code flashes and quits" — the GUI process can't write to
  // its own state dirs and Electron exits. Removing the quarantine xattr is a
  // permanent fix for this.
  if (platform === 'darwin' && vscodeAppPath) {
    try {
      require('child_process').spawnSync('xattr',
        ['-dr', 'com.apple.quarantine', vscodeAppPath],
        { stdio: 'ignore', timeout: 3000 });
    } catch { /* non-fatal */ }
  }

  // ── Launch VS Code: USER'S NORMAL VS CODE, NEW WINDOW PER AGENT ───────────
  //
  // Approach:
  //   • Use the user's already-running, already-signed-in VS Code (no custom
  //     --user-data-dir, so Copilot login is reused automatically).
  //   • Write a UNIQUE per-agent <agentId>-<ts>.code-workspace into
  //     <project>/.apm-workspaces/. VS Code de-duplicates windows by
  //     workspace identity (not by folder), so a unique workspace file
  //     guarantees a brand-new window every click.
  //   • Launch via `open -a <App> <workspace-file>`. LaunchServices routes
  //     it to the running VS Code, which honors the new-workspace request.
  //   • Auto-install the apm-copilot-bridge extension once into the user's
  //     normal VS Code so it can submit the prompt to Copilot Chat
  //     automatically when the new window finishes loading.

  function shimFor(appPath) {
    if (!appPath) return null;
    const shim = path.join(appPath, 'Contents', 'Resources', 'app', 'bin', 'code');
    return fs.existsSync(shim) ? shim : null;
  }

  // 1) Make sure the bridge extension is installed in the user's normal VS Code.
  const codeBin = shimFor(vscodeAppPath) || resolveBin('code');
  try {
    ensureBridgeExtensionInstalled(codeBin, agentId);
  } catch (e) {
    broadcast('log', { agentId, level: 'warn',
      msg: `Bridge extension install skipped: ${e.message}` });
  }

  // 2) Write a unique per-agent .code-workspace so VS Code opens a NEW window.
  const wsDir  = path.join(workDir, '.apm-workspaces');
  try { fs.mkdirSync(wsDir, { recursive: true }); } catch { /* */ }
  const wsFile = path.join(wsDir, `${agentId}-${Date.now()}.code-workspace`);
  const wsJson = {
    folders: [{ path: '..' }],
    settings: { 'workbench.startupEditor': 'none' },
  };
  try { fs.writeFileSync(wsFile, JSON.stringify(wsJson, null, 2), 'utf8'); }
  catch (e) { broadcast('log', { agentId, level: 'warn', msg: `workspace write failed: ${e.message}` }); }

  // 3) Launch the new window via LaunchServices on macOS, or `code` elsewhere.
  let launched = false;
  let launchMethod = '';

  if (platform === 'darwin' && vscodeAppPath) {
    try {
      const child = require('child_process').spawn(
        'open',
        ['-a', vscodeAppPath, wsFile],   // unique workspace ⇒ new window every time
        { detached: true, stdio: 'ignore' }
      );
      child.unref();
      launched = true;
      launchMethod = `open -a "${vscodeAppName}" <workspace>`;
    } catch (e) {
      broadcast('log', { agentId, level: 'warn', msg: `open -a failed: ${e.message}` });
    }
  }

  if (!launched && codeBin) {
    try {
      const child = require('child_process').spawn(
        codeBin,
        ['-n', wsFile],
        { detached: true, stdio: 'ignore', env: spawnEnv() }
      );
      child.unref();
      launched = true;
      launchMethod = `${codeBin} -n <workspace>`;
    } catch (e) {
      broadcast('log', { agentId, level: 'error', msg: `code -n failed: ${e.message}` });
    }
  }

  if (!launched) {
    broadcast('log', { agentId, level: 'error',
      msg: 'Could not launch VS Code. Install the `code` shim: ⇧⌘P → "Shell Command: Install \'code\' command in PATH".' });
  }

  broadcast('log', { agentId, level: 'info', msg: `Launch: ${launchMethod || 'failed'}` });
  broadcast('log', { agentId, level: 'info', msg: `Workspace: ${path.relative(workDir, wsFile)}` });

  const rel = path.relative(workDir, contextPath);
  broadcast('log', { agentId, level: 'system',  msg: `▶ INVOKE  ${agentName}  [Copilot mode]` });
  broadcast('log', { agentId, level: 'success', msg: `✓ Opening VS Code (${vscodeAppName}) → ${path.basename(workDir)}` });
  broadcast('log', { agentId, level: 'info',    msg: `Context file written: ${rel}` });
  broadcast('log', { agentId, level: 'info',    msg: 'Bridge extension will auto-submit the prompt to Copilot Chat.' });
  broadcast('agentStatus', { agentId, status: 'done' });
  // Animate the board: queue → wip → done so the user sees a real transition,
  // matching the Claude/shell flow even though Copilot hands off to VS Code.
  const cardId = ++seq;
  kanbanAdd('todo', { id: cardId, agentId, agent: agentName, title: `${agentName}: queued` });
  setTimeout(() => kanbanMove({ id: cardId }, 'wip'),  150);
  setTimeout(() => kanbanMove({ id: cardId }, 'done'), 1200);
}

// ─── Agent invocation ─────────────────────────────────────────────────────────
/**
 * FR-002, FR-008: Resolve the worktree filesystem path for a given pipeline_id.
 * Returns the worktree path when found, or cfg.localPath as fallback.
 * Broadcasts a warning log when falling back.
 *
 * @returns {Promise<{worktreePath:string, found:boolean}>}
 */
async function resolveWorktreePath(pipelineId, cfg, agentId) {
  if (!pipelineId) return { worktreePath: cfg.localPath, found: false };
  try {
    const pipelines = await listLocalPipelines(cfg.localPath).catch(() => []);
    const pipeline  = pipelines.find(p => String(p.issueNumber) === String(pipelineId));
    if (pipeline && pipeline.path) {
      return { worktreePath: pipeline.path, found: true };
    }
  } catch { /* fall through */ }
  // FR-008: fallback with warning — no silent failure
  broadcast('log', { agentId, level: 'warn',
    msg: `⚠️  No local worktree found for issue #${pipelineId} — falling back to project root` });
  return { worktreePath: cfg.localPath, found: false };
}

async function invokeAgent(agentId, agentName, cfg, mode, pipelineId = null) {
  // If already running, return current status
  if (running.has(agentId)) {
    return { ok: false, error: `${agentName} is already running`, agentId };
  }

  if (!cfg.localPath) {
    broadcast('log', { agentId, level: 'warn', msg: '⚠️  No project path configured — open Settings first' });
    return { ok: false, error: 'No project path configured' };
  }

  // FR-002: resolve the worktree path early so both Copilot and shell paths use it
  const { worktreePath } = await resolveWorktreePath(pipelineId, cfg, agentId);

  const cmd = buildAgentCmd(agentId, cfg, agentName);

  // ── Copilot: no background process — open VS Code + write context file ──
  if (cmd && typeof cmd === 'object' && cmd.__copilot) {
    // FR-004: override workDir in the sentinel so VS Code opens the worktree
    const copilotCmd = { ...cmd, workDir: worktreePath };
    broadcast('agentStatus', { agentId, status: 'running' });
    await handleCopilotInvoke(agentId, agentName, copilotCmd, pipelineId);
    return { ok: true, agentId, mode: 'copilot' };
  }

  const pipelineLabel = pipelineId ? ` [issue #${pipelineId}]` : '';
  broadcast('log', { agentId, level: 'system', msg: `▶ INVOKE  ${agentName}${pipelineLabel}` });
  broadcast('log', { agentId, level: 'info',   msg: `$ ${cmd.slice(0, 80)}${cmd.length > 80 ? '…' : ''}` });
  broadcast('agentStatus', { agentId, status: 'running' });
  const wipCardId = ++seq;
  kanbanAdd('wip', { id: wipCardId, agentId, agent: agentName,
    title: `${agentName}: running${pipelineLabel}` });

  // FR-003: inject pipeline_id so Claude and shell agents can read it
  const procEnv = pipelineId
    ? { ...spawnEnv(), QUORUMKIT_PIPELINE_ID: pipelineId }
    : spawnEnv();

  // FR-002: spawn in the resolved worktree directory (falls back to cfg.localPath)
  const proc = spawn('bash', ['-lc', cmd], {
    cwd: worktreePath,
    env: procEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const info = {
    pid: proc.pid,
    proc,
    agent: agentName,
    startedAt: Date.now(),
    status: 'running',
    log: [],
  };
  running.set(agentId, info);

  // FR-009: populate global._agentProcesses so listLocalPipelines can show
  // the running-agent indicator for the correct worktree row.
  if (!global._agentProcesses) global._agentProcesses = new Map();
  global._agentProcesses.set(agentId, { cwd: worktreePath });

  function onLine(data, level) {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => {
      info.log.push({ ts: Date.now(), level, msg: line });
      broadcast('log', { agentId, level, msg: line });
    });
  }

  proc.stdout.on('data', d => onLine(d, 'info'));
  proc.stderr.on('data', d => onLine(d, 'warn'));

  proc.on('exit', (code) => {
    const status = code === 0 ? 'done' : 'error';
    if (running.has(agentId)) running.get(agentId).status = status;
    broadcast('agentStatus', { agentId, status });
    kanbanMove({ id: wipCardId }, status === 'done' ? 'done' : 'todo');
    broadcast('log', { agentId, level: status === 'done' ? 'success' : 'error',
      msg: status === 'done' ? `✅ ${agentName} finished (exit 0)` : `❌ ${agentName} exited with code ${code}` });
    // FR-009: remove from process registry on exit
    global._agentProcesses && global._agentProcesses.delete(agentId);
    // Remove from running map after a delay so the UI can read final status
    setTimeout(() => running.delete(agentId), 10_000);
  });

  return { ok: true, pid: proc.pid, agentId };
}

// ─── Server bootstrap ─────────────────────────────────────────────────────────
const server = http.createServer(handleRequest);

// Register error handler BEFORE listen so EADDRINUSE is caught cleanly,
// even when WebSocketServer re-emits the error on the same server instance.
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} is already in use.`);
    console.error(`    Kill the existing process or choose a different port:`);
    console.error(`      lsof -ti:${PORT} | xargs kill`);
    console.error(`      dashboard/start.sh --port ${PORT + 1}\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

wss = new WebSocketServer({ server });
// Swallow wss-level errors (the server error handler above covers the real ones)
wss.on('error', () => {});

wss.on('connection', (ws) => {
  // Send current running statuses to new clients
  const statuses = {};
  running.forEach((v, k) => { statuses[k] = { status: v.status, startedAt: v.startedAt }; });
  ws.send(JSON.stringify({
    type: 'hello',
    statuses,
    config: loadConfig(),
    kanban: kanbanCards.slice(),  // replay recent board state to reload-resilient clients
  }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'invoke') {
        const cfg = loadConfig();
        await invokeAgent(msg.agentId, msg.agentName, cfg, 'background');
      }
      if (msg.type === 'stop') {
        const info = running.get(msg.agentId);
        if (info) { try { info.proc.kill(); } catch { /* */ } running.delete(msg.agentId); }
      }
    } catch { /* bad JSON */ }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ████████████████████████████████████████████████');
  console.log('  ██                                            ██');
  console.log('  ██   QuorumKit Dark Factory — Orchestrator Server   ██');
  console.log('  ██                                            ██');
  console.log('  ████████████████████████████████████████████████');
  console.log('');
  console.log(`  ► http://localhost:${PORT}`);
  console.log(`  ► WebSocket: ws://localhost:${PORT}`);
  console.log('');
  console.log('  Open the URL above in your browser, then use');
  console.log('  the ⚙ Settings button to set your project path.');
  console.log('');
});
