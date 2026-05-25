/**
 * Unit tests for bridge extension submitPrompt logic.
 *
 * FR-006: submitPrompt MUST NOT call workbench.action.chat.open when no
 *         agent-mode command succeeds — it must use clipboard + notification.
 * FR-007: submitPrompt MUST poll for Agent mode readiness instead of using
 *         a fixed 1200 ms delay.
 *
 * Strategy: the extension exports `_submitPromptCore(prompt, api)` which
 * accepts a mock vscode-like API object, enabling pure unit testing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO_ROOT    = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRIDGE_FILE  = resolve(REPO_ROOT, 'engine', 'dashboard', 'extensions',
                             'quorumkit-copilot-bridge', 'extension.js');

// Dynamically require the extension (it's CommonJS, not ESM)
const require_ = createRequire(import.meta.url);

// ─── Minimal vscode mock factory ─────────────────────────────────────────────
function makeMockVscode(availableCommands = [], cmdBehavior = {}) {
  const calledWith = [];

  return {
    calledWith,
    commands: {
      getCommands: vi.fn(async () => availableCommands),
      executeCommand: vi.fn(async (id, ...args) => {
        calledWith.push({ id, args });
        if (cmdBehavior[id]) {
          return cmdBehavior[id]({ id, args });
        }
        // Default: throw (command not available / fails)
        throw new Error(`command not available: ${id}`);
      }),
    },
    env: {
      clipboard: {
        readText: vi.fn(async () => ''),
        writeText: vi.fn(async () => {}),
      },
    },
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
    },
    workspace: {
      workspaceFolders: [],
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function wasCommandCalled(mock, commandId) {
  return mock.calledWith.some(c => c.id === commandId);
}

// ─── Load extension ───────────────────────────────────────────────────────────
let _submitPromptCore;

try {
  // The extension must export _submitPromptCore for unit testing.
  const ext = require_(BRIDGE_FILE);
  _submitPromptCore = ext._submitPromptCore;
} catch (e) {
  // If the extension can't be loaded (e.g., before implementation), skip.
  _submitPromptCore = null;
}

// ─── Test options: skip production warm-up delays ────────────────────────────
// chatReadyDelay: 0 — skip the 2 s Copilot LM warm-up delay
// agentModeMaxMs: 500 — short polling window is sufficient in unit tests
const TEST_OPTS = { chatReadyDelay: 0, agentModeMaxMs: 500 };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FR-006: no workbench.action.chat.open fallback when no agent-mode command succeeds', () => {
  it('exports _submitPromptCore for unit testing', () => {
    // This test fails before implementation when the export does not exist.
    expect(typeof _submitPromptCore).toBe('function');
  });

  it('does NOT call workbench.action.chat.open when no agent-mode commands succeed', async () => {
    if (!_submitPromptCore) return; // skip if export missing

    // Available commands: chat.open (must NOT be used as fallback), focusInput,
    // and a copilot command to satisfy waitForChatReady quickly.
    const mock = makeMockVscode(
      [
        'workbench.action.chat.open',       // present but MUST NOT be called as fallback
        'workbench.action.chat.focusInput',
        'workbench.action.chat.submit',
        'github.copilot.someOtherCmd',
      ],
      {
        'workbench.action.chat.focusInput': () => undefined,
        'workbench.action.chat.submit':     () => undefined,
      }
    );

    await _submitPromptCore('hello world', mock, TEST_OPTS);

    expect(wasCommandCalled(mock, 'workbench.action.chat.open')).toBe(false);
  });

  it('writes prompt to clipboard and shows informationMessage when no mode command succeeds', async () => {
    if (!_submitPromptCore) return;

    // No openAgent/setMode commands available — only chat.open (must be ignored)
    const mock = makeMockVscode(
      [
        'workbench.action.chat.open',
        'workbench.action.chat.focusInput',
        'github.copilot.someOtherCmd',
      ],
      {
        'workbench.action.chat.focusInput': () => undefined,
      }
    );

    await _submitPromptCore('test prompt', mock, TEST_OPTS);

    expect(mock.env.clipboard.writeText).toHaveBeenCalled();
    const writes = mock.env.clipboard.writeText.mock.calls.map(c => c[0]);
    expect(writes.some(w => w === 'test prompt')).toBe(true);
  });

  it('shows informationMessage (not errorMessage) when no mode command and submit fails', async () => {
    if (!_submitPromptCore) return;

    // Nothing works except clipboard — no focusInput, no submit
    const mock = makeMockVscode(
      ['workbench.action.chat.open', 'github.copilot.someOtherCmd'],
      {}
    );

    await _submitPromptCore('fallback prompt', mock, TEST_OPTS);

    expect(mock.window.showInformationMessage).toHaveBeenCalled();
    expect(mock.window.showErrorMessage).not.toHaveBeenCalled();
  });
});

describe('FR-007: polling replaces fixed 1200 ms delay', () => {
  it('calls workbench.action.chat.focusInput to poll for Agent mode readiness', async () => {
    if (!_submitPromptCore) return;

    const mock = makeMockVscode(
      [
        'workbench.action.chat.open',        // needed for waitForChatReady
        'workbench.action.chat.openAgent',
        'workbench.action.chat.focusInput',
        'workbench.action.chat.submit',
        'github.copilot.someOtherCmd',
      ],
      {
        'workbench.action.chat.openAgent':  () => undefined,
        'workbench.action.chat.focusInput': () => undefined,
        'workbench.action.chat.submit':     () => undefined,
      }
    );

    await _submitPromptCore('polling test', mock, TEST_OPTS);

    expect(wasCommandCalled(mock, 'workbench.action.chat.focusInput')).toBe(true);
  });

  it('proceeds to submit after polling resolves even if focusInput takes multiple attempts', async () => {
    if (!_submitPromptCore) return;

    let focusCallCount = 0;
    const mock = makeMockVscode(
      [
        'workbench.action.chat.open',        // needed for waitForChatReady
        'workbench.action.chat.openAgent',
        'workbench.action.chat.focusInput',
        'workbench.action.chat.submit',
        'github.copilot.someOtherCmd',
      ],
      {
        'workbench.action.chat.openAgent': () => undefined,
        'workbench.action.chat.focusInput': () => {
          focusCallCount++;
          if (focusCallCount < 3) throw new Error('not ready yet');
          return undefined; // ready on 3rd attempt
        },
        'workbench.action.chat.submit': () => undefined,
      }
    );

    const result = await _submitPromptCore('retry test', mock, TEST_OPTS);

    expect(focusCallCount).toBeGreaterThanOrEqual(3);
    expect(result).toBe(true);
  }, 10_000);
});
