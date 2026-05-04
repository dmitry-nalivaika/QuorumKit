/**
 * APM Dark Factory — Orchestrator Backend
 *
 * Provides:
 *  • HTTP server  → serves index.html
 *  • WebSocket    → real-time log streaming + agent state
 *  • /api/config  → GET / POST project config
 *  • /api/agents  → GET live agent status
 *  • /api/invoke  → POST invoke an agent in a real shell
 *  • /api/terminal→ POST open a native terminal for an agent
 *  • /api/stop    → POST stop a running agent
 *
 * Usage:
 *   node server.js [--port 3131]
 */

'use strict';

const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const { exec, spawn }  = require('child_process');
const { WebSocketServer } = require('ws');
const os         = require('os');

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const PORT = parseInt(args[args.indexOf('--port') + 1] || process.env.APM_PORT || '3131', 10);
const DASHBOARD_DIR = __dirname;
const CONFIG_FILE   = path.join(DASHBOARD_DIR, '.apm-project.json');

// ─── In-memory state ─────────────────────────────────────────────────────────
/** @type {Map<string, {pid:number, proc:import('child_process').ChildProcess, agent:string, startedAt:number, status:'running'|'done'|'error', log:string[]}>} */
const running = new Map(); // agentId → process info
let   seq     = 0;         // kanban card id sequence

/**
 * Default project config — user fills this in via the UI or .apm-project.json
 */
function defaultConfig() {
  return {
    repoUrl:     '',
    localPath:   '',
    branch:      'main',
    aiTool:      'claude',   // 'claude' | 'copilot' | 'custom'
    customCmd:   '',         // used when aiTool === 'custom'
    terminalApp: autoDetectTerminal(),
  };
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch { /* ignore */ }
  return defaultConfig();
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
  const safeTitle = (title || 'APM Agent').replace(/'/g, "\\'");
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
 * agentId is the APM short id; localPath is the project root.
 */
function buildAgentCmd(agentId, cfg, agentName) {
  const skillPath = path.join(
    DASHBOARD_DIR, '..', '.apm', 'skills',
    agentId + '-agent', 'SKILL.md'
  );
  // Normalise some IDs to skill folder names
  const idToSkill = {
    ba: 'ba', developer: 'dev', qa: 'qa', reviewer: 'reviewer',
    architect: 'architect', devops: 'devops', security: 'security',
    triage: 'triage', release: 'release', docs: 'docs',
    techdebt: 'tech-debt', ot: 'ot-integration', twin: 'digital-twin',
    compliance: 'compliance', incident: 'incident',
  };
  const skill = idToSkill[agentId] || agentId;
  const skillFile = path.join(DASHBOARD_DIR, '..', '.apm', 'skills', `${skill}-agent`, 'SKILL.md');
  const agentFile = path.join(DASHBOARD_DIR, '..', '.apm', 'agents',
    skill === 'ba'         ? 'ba-product-agent.md'      :
    skill === 'dev'        ? 'developer-agent.md'       :
    skill === 'qa'         ? 'qa-test-agent.md'         :
    skill === 'tech-debt'  ? 'tech-debt-agent.md'       :
    skill === 'ot-integration'  ? 'ot-integration-agent.md'  :
    skill === 'digital-twin'    ? 'digital-twin-agent.md'    :
                             `${skill}-agent.md`
  );

  const workDir = cfg.localPath || '.';

  switch (cfg.aiTool) {
    case 'claude':
      // Claude Code: load the skill as a system prompt file
      return fs.existsSync(skillFile)
        ? `claude --system-prompt "${skillFile.replace(/"/g,'\\"')}" --cwd "${workDir.replace(/"/g,'\\"')}"`
        : `claude --cwd "${workDir.replace(/"/g,'\\"')}"`;

    case 'copilot':
      // VS Code with Copilot — open the project folder (best we can do without deep extension API)
      return `code "${workDir.replace(/"/g,'\\"')}"`;

    case 'custom':
      return cfg.customCmd
        .replace('{agent}', agentId)
        .replace('{agentName}', agentName)
        .replace('{skill}', skillFile)
        .replace('{cwd}', workDir);

    default:
      // Fallback: drop into a shell at the project root with the agent definition printed
      return fs.existsSync(agentFile)
        ? `cat "${agentFile.replace(/"/g,'\\"')}" && echo "" && echo "═══ Agent console ready — type your instructions ═══" && bash`
        : `echo "Agent: ${agentName}" && bash`;
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

    const cfg = loadConfig();
    const result = await invokeAgent(agentId, agentName || agentId, cfg, mode);
    json(res, 200, result); return;
  }

  // ── POST /api/terminal ─────────────────────────────────────────
  if (method === 'POST' && url.pathname === '/api/terminal') {
    const body = await readBody(req);
    const { agentId, agentName } = body;
    if (!agentId) { json(res, 400, { error: 'agentId required' }); return; }

    const cfg    = loadConfig();
    const cmd    = buildAgentCmd(agentId, cfg, agentName || agentId);
    const termCmd = buildTerminalCmd(cfg.terminalApp, cfg.localPath || os.homedir(), cmd, `APM — ${agentName}`);

    exec(termCmd, (err) => {
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

  res.writeHead(404); res.end('Not found');
}

// ─── Agent invocation ─────────────────────────────────────────────────────────
async function invokeAgent(agentId, agentName, cfg, mode) {
  // If already running, return current status
  if (running.has(agentId)) {
    return { ok: false, error: `${agentName} is already running`, agentId };
  }

  if (!cfg.localPath) {
    broadcast('log', { agentId, level: 'warn', msg: '⚠️  No project path configured — open Settings first' });
    return { ok: false, error: 'No project path configured' };
  }

  const cmd = buildAgentCmd(agentId, cfg, agentName);
  broadcast('log', { agentId, level: 'system', msg: `▶ INVOKE  ${agentName}` });
  broadcast('log', { agentId, level: 'info',   msg: `$ ${cmd.slice(0, 80)}${cmd.length > 80 ? '…' : ''}` });
  broadcast('agentStatus', { agentId, status: 'running' });
  broadcast('kanban', { action: 'add', col: 'wip', card: { id: ++seq, agentId, title: `${agentName}: running`, agent: agentName } });

  // Spawn in the project directory
  const proc = spawn('bash', ['-c', cmd], {
    cwd: cfg.localPath,
    env: { ...process.env, FORCE_COLOR: '0' },
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
    broadcast('kanban', { action: 'move', agentId, col: status === 'done' ? 'done' : 'todo' });
    broadcast('log', { agentId, level: status === 'done' ? 'success' : 'error',
      msg: status === 'done' ? `✅ ${agentName} finished (exit 0)` : `❌ ${agentName} exited with code ${code}` });
    // Remove from running map after a delay so the UI can read final status
    setTimeout(() => running.delete(agentId), 10_000);
  });

  return { ok: true, pid: proc.pid, agentId };
}

// ─── Server bootstrap ─────────────────────────────────────────────────────────
const server = http.createServer(handleRequest);
wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  // Send current running statuses to new clients
  const statuses = {};
  running.forEach((v, k) => { statuses[k] = { status: v.status, startedAt: v.startedAt }; });
  ws.send(JSON.stringify({ type: 'hello', statuses, config: loadConfig() }));

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
  console.log('  ██   APM Dark Factory — Orchestrator Server   ██');
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

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} is already in use.`);
    console.error(`    Try:  node server.js --port 3132\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
