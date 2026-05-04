const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const CONTEXT_FILE = '.copilot-agent-context.md';
const MARKER_DIR   = '.apm-workspaces';

/**
 * Extract the prompt block from .copilot-agent-context.md.
 * The orchestrator wraps the prompt in the first triple-backtick fence
 * under the "## Copilot Chat prompt" heading.
 */
function extractPrompt(md) {
  const headerIdx = md.indexOf('## Copilot Chat prompt');
  if (headerIdx === -1) return null;
  const after = md.slice(headerIdx);
  const m = after.match(/```[^\n]*\n([\s\S]*?)\n```/);
  return m ? m[1].trim() : null;
}

/** Find the most-recent agent-id marker the orchestrator wrote. */
function readAgentMarker(rootPath) {
  try {
    const dir = path.join(rootPath, MARKER_DIR);
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.code-workspace'));
    if (!files.length) return null;
    files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs -
                         fs.statSync(path.join(dir, a)).mtimeMs);
    return path.basename(files[0], '.code-workspace');
  } catch { return null; }
}

async function submitPrompt(prompt) {
  // Strategy:
  //   1. Wait until Copilot Chat has actually finished registering its
  //      commands AND its language model is online. Firing too early causes
  //      "Language model unavailable".
  //   2. Switch to Agent mode FIRST, in its own command call. Trying to do it
  //      in the same chat.open call as the query sometimes lands in Ask mode.
  //   3. Submit the query as a separate call, after Agent mode has applied.
  //   4. On failure, retry once after a longer wait.

  async function tryCmd(id, ...args) {
    try {
      await vscode.commands.executeCommand(id, ...args);
      console.log(`[APM] cmd ok: ${id}`);
      return true;
    } catch (e) {
      console.log(`[APM] cmd fail: ${id} → ${e && e.message}`);
      return false;
    }
  }

  // Wait until a known Copilot/chat command is available (max 6s).
  async function waitForChatReady() {
    const known = [
      'workbench.action.chat.openAgent',
      'workbench.action.chat.open',
    ];
    for (let i = 0; i < 30; i++) {
      const all = await vscode.commands.getCommands(true);
      if (known.some(k => all.includes(k))) {
        // Plus give the language model itself a moment to wake up.
        await new Promise(r => setTimeout(r, 1500));
        return;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  await waitForChatReady();

  // Step 1 — Force Agent mode. First command that succeeds wins.
  const modeSwitched =
    await tryCmd('workbench.action.chat.openAgent') ||
    await tryCmd('workbench.action.chat.setMode', 'agent') ||
    await tryCmd('github.copilot.chat.setMode', 'agent') ||
    await tryCmd('workbench.action.chat.toggleAgentMode');
  console.log(`[APM] agent mode switched: ${modeSwitched}`);

  // Tiny wait so the mode flip lands before the query reaches the panel.
  await new Promise(r => setTimeout(r, 500));

  // Step 2 — Submit the query. Retry once on failure (handles the
  // "Language model unavailable" race on cold start).
  async function submitOnce() {
    return tryCmd('workbench.action.chat.open', { query: prompt, mode: 'agent' });
  }

  let ok = await submitOnce();
  if (!ok) {
    await new Promise(r => setTimeout(r, 2500));
    ok = await submitOnce();
  }

  if (ok) return true;

  // Final fallback — clipboard + notification.
  try {
    await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'APM: prompt copied to clipboard — paste into Copilot Chat (⌘V, Enter).'
    );
    return true;
  } catch (e) {
    vscode.window.showErrorMessage(`APM Copilot Bridge: ${e.message || e}`);
    return false;
  }
}

async function tryInjectOnce() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) return;
  const root = folders[0].uri.fsPath;

  const ctxPath = path.join(root, CONTEXT_FILE);
  if (!fs.existsSync(ctxPath)) return;

  // Per-window dedup: only inject once per .code-workspace marker.
  const agentId = readAgentMarker(root) || 'default';
  const flagDir = path.join(root, MARKER_DIR, '.injected');
  const flag    = path.join(flagDir, agentId);
  try { fs.mkdirSync(flagDir, { recursive: true }); } catch { /* */ }
  if (fs.existsSync(flag)) return;

  const md = fs.readFileSync(ctxPath, 'utf8');
  const prompt = extractPrompt(md);
  if (!prompt) return;

  // submitPrompt() waits for chat readiness internally.
  const ok = await submitPrompt(prompt);
  if (ok) {
    try { fs.writeFileSync(flag, new Date().toISOString()); } catch { /* */ }
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('apm.submitAgentPrompt', () => tryInjectOnce())
  );
  // Fire and forget on startup
  tryInjectOnce().catch(err => console.error('[APM] inject failed:', err));
}

function deactivate() {}

module.exports = { activate, deactivate };
