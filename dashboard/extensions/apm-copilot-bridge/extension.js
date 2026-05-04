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
  // Public command: opens Copilot Chat (or any registered chat view) with a query.
  // Available since VS Code 1.90.
  try {
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: prompt,
      mode: 'agent',   // open in Copilot Agent mode, not Ask mode
    });
    return true;
  } catch (e1) {
    try {
      // Older fallback — focus the panel and stash the prompt on the clipboard.
      await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showInformationMessage(
        'APM: prompt copied to clipboard — paste into Copilot Chat (⌘V, Enter).'
      );
      return true;
    } catch (e2) {
      vscode.window.showErrorMessage(`APM Copilot Bridge: ${e2.message || e2}`);
      return false;
    }
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

  // Small delay so the chat extension has time to register its commands.
  await new Promise(r => setTimeout(r, 1500));
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
