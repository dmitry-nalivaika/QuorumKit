/**
 * regulation.js
 * Parses docs/AGENT_PROTOCOL.md into the canonical sets of declared
 * identifiers (FR-014, ADR-006 §5).
 *
 * The regulation document is human-authored markdown. We extract:
 *   - labels       (Set<string>)   — every label name in `agent:* / status:* /
 *                                    loop:* / gate:* / triaged / type:*` namespaces
 *   - outcomes     (Set<string>)   — apm-msg outcome enum
 *   - triggers     (Set<string>)   — event names (issues.opened, etc.)
 *
 * The parser is deliberately conservative: it scans the labels table for
 * backtick-quoted identifiers, a single Outcomes table for outcome names,
 * and the Triggers table for event names. If the document is missing or
 * malformed the loader returns empty sets, which causes regulation-lint to
 * fail closed (never silently pass).
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export const REGULATION_PATH = 'docs/AGENT_PROTOCOL.md';

/**
 * Parse the regulation markdown content into declared identifier sets.
 *
 * @param {string} markdown
 * @returns {{ labels: Set<string>, outcomes: Set<string>, triggers: Set<string> }}
 */
export function parseRegulation(markdown) {
  const labels = new Set();
  const outcomes = new Set();
  const triggers = new Set();

  if (typeof markdown !== 'string' || markdown.length === 0) {
    return { labels, outcomes, triggers };
  }

  // Section: ## 1. Labels — collect every backticked token starting with
  // a known prefix from the namespaces declared in the doc.
  const labelsSection = extractSection(markdown, /^##\s+1\..*Labels/m, /^##\s+2\./m);
  if (labelsSection) {
    const re = /`([a-z][a-z0-9:_\-/]+)`/g;
    let m;
    while ((m = re.exec(labelsSection)) !== null) {
      const t = m[1];
      if (/^(agent|status|loop|gate|type):/i.test(t) || t === 'triaged') {
        labels.add(t);
      }
    }
  }

  // Section: ## 2. apm-msg Outcomes — first column of the outcomes table is
  // a backticked outcome name.
  const outcomesSection = extractSection(markdown, /^##\s+2\..*Outcomes/m, /^##\s+3\./m);
  if (outcomesSection) {
    // Match table rows: | `outcome-name` | …
    const re = /^\|\s*`([a-z][a-z0-9_\-]*)`\s*\|/gm;
    let m;
    while ((m = re.exec(outcomesSection)) !== null) {
      outcomes.add(m[1]);
    }
  }

  // Section: ## 4. Transition Triggers — backticked event names.
  const triggersSection = extractSection(markdown, /^##\s+4\./m, /^##\s+5\./m);
  if (triggersSection) {
    const re = /`([a-z_]+\.[a-z_]+|workflow_dispatch|repository_dispatch)`/g;
    let m;
    while ((m = re.exec(triggersSection)) !== null) {
      triggers.add(m[1]);
    }
  }

  return { labels, outcomes, triggers };
}

/**
 * Load the regulation document from disk.
 * @param {string} [rootDir]
 * @returns {Promise<{ labels: Set<string>, outcomes: Set<string>, triggers: Set<string>, found: boolean }>}
 */
export async function loadRegulation(rootDir = process.cwd()) {
  const path = `${rootDir.replace(/\/$/, '')}/${REGULATION_PATH}`;
  if (!existsSync(path)) {
    return { labels: new Set(), outcomes: new Set(), triggers: new Set(), found: false };
  }
  const raw = await readFile(path, 'utf8');
  return { ...parseRegulation(raw), found: true };
}

function extractSection(markdown, startRe, endRe) {
  const startMatch = startRe.exec(markdown);
  if (!startMatch) return null;
  const tail = markdown.slice(startMatch.index);
  const endMatch = endRe.exec(tail.slice(startMatch[0].length));
  return endMatch
    ? tail.slice(0, startMatch[0].length + endMatch.index)
    : tail;
}
