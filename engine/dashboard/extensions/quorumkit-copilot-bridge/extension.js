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
  //   1. Wait for Copilot Chat to register its commands AND the LM to wake up.
  //   2. Log every chat-related command available (helps diagnose mode IDs).
  //   3. Open the chat in Agent mode WITHOUT a query.
  //   4. Try every known "switch to agent mode" command — first that wins, wins.
  //   5. Wait for the mode to actually apply.
  //   6. Submit the query via a SEPARATE call (not bundled with chat.open),
  //      which avoids the race where the prompt is sent before the mode
  //      switch lands.

  async function tryCmd(id, ...args) {
    try {
      await vscode.commands.executeCommand(id, ...args);
      console.log(`[QuorumKit] cmd ok: ${id}`);
      return true;
    } catch (e) {
      console.log(`[QuorumKit] cmd fail: ${id} → ${e && e.message}`);
      return false;
    }
  }

  // Wait until Copilot Chat has registered its commands (max 8s), then a bit
  // more for the language model to come online.
  async function waitForChatReady() {
    for (let i = 0; i < 40; i++) {
      const all = await vscode.commands.getCommands(true);
      if (all.includes('workbench.action.chat.open')) {
        // Also wait for any github.copilot.* command (means Copilot Chat ext
        // has finished activating, not just the built-in chat shell).
        if (all.some(c => c.startsWith('github.copilot.'))) {
          await new Promise(r => setTimeout(r, 2000));
          return true;
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  }

  const ready = await waitForChatReady();
  console.log(`[QuorumKit] chat ready: ${ready}`);

  // Diagnostic: dump all chat / copilot commands so we can see what's there.
  const all = await vscode.commands.getCommands(true);
  const interesting = all.filter(c =>
    /chat|copilot|agent/i.test(c) && !c.startsWith('_')
  ).sort();
  console.log(`[QuorumKit] chat-related commands (${interesting.length}):`);
  for (const c of interesting) console.log(`  ${c}`);

  // Step 1 — Open the chat panel directly in Agent mode.
  // CRITICAL: do NOT call chat.open afterwards — it resets the mode to Ask
  // and submits the query there. Once openAgent succeeds, we keep that
  // chat session and submit into IT.
  let modeSwitched = false;
  const modeAttempts = [
    ['workbench.action.chat.openAgent'],
    ['github.copilot.chat.openAgent'],
    ['github.copilot.openAgent'],
    ['workbench.action.chat.setMode', 'agent'],
    ['github.copilot.chat.setMode', 'agent'],
    ['workbench.action.chat.toggleAgentMode'],
  ];
  for (const [id, ...args] of modeAttempts) {
    if (all.includes(id)) {
      modeSwitched = await tryCmd(id, ...args);
      if (modeSwitched) break;
    }
  }
  console.log(`[QuorumKit] agent mode switched: ${modeSwitched}`);

  // If no Agent mode command exists at all, fall back to chat.open with mode.
  if (!modeSwitched) {
    await tryCmd('workbench.action.chat.open', { mode: 'agent' });
  }

  // Wait so the Agent-mode chat finishes opening and the input is focused.
  await new Promise(r => setTimeout(r, 1200));

  // Step 2 — Submit the prompt INTO the already-open Agent chat.
  // We deliberately avoid `workbench.action.chat.open` here — that command
  // creates/reopens a chat session and silently reverts the mode.
  async function submitOnce() {
    // A) Most reliable cross-version path: focus chat input → paste → submit.
    const savedClip = await vscode.env.clipboard.readText().catch(() => '');
    await vscode.env.clipboard.writeText(prompt);
    const focused =
      await tryCmd('workbench.action.chat.focusInput') ||
      await tryCmd('workbench.action.chatEditor.focusInput') ||
      await tryCmd('workbench.panel.chat.view.copilot.focus');
    if (focused) {
      await new Promise(r => setTimeout(r, 200));
      await tryCmd('editor.action.clipboardPasteAction');
      await new Promise(r => setTimeout(r, 150));
      // Restore the user's clipboard before submitting.
      try { await vscode.env.clipboard.writeText(savedClip); } catch { /* */ }
      // Submit
      const submitted =
        await tryCmd('workbench.action.chat.submit') ||
        await tryCmd('workbench.action.chat.acceptInput');
      if (submitted) return true;
    } else {
      // restore clipboard if we couldn't focus
      try { await vscode.env.clipboard.writeText(savedClip); } catch { /* */ }
    }

    // B) Fallback: pass the prompt as input value to acceptInput.
    if (await tryCmd('workbench.action.chat.acceptInput', prompt)) return true;
    if (await tryCmd('workbench.action.chat.acceptInput', { inputValue: prompt })) return true;

    return false;
  }

  let ok = await submitOnce();
  if (!ok) {
    // Cold-start retry: LM might not be ready yet.
    await new Promise(r => setTimeout(r, 3000));
    ok = await submitOnce();
  }

  if (ok) return true;

  // Final fallback — clipboard + notification.
  try {
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
    vscode.commands.registerCommand('quorumkit.submitAgentPrompt', () => tryInjectOnce())
  );
  // Fire and forget on startup
  tryInjectOnce().catch(err => console.error('[QuorumKit] inject failed:', err));
}

function deactivate() {}

module.exports = { activate, deactivate };
