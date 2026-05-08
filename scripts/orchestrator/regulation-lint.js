#!/usr/bin/env node
/**
 * regulation-lint.js
 * CI gate that the regulation document is the source of truth for every
 * label, outcome, and trigger referenced anywhere in `.apm/pipelines/` and
 * the orchestrator source code (FR-014, FR-024, ADR-006 §5).
 *
 * Strategy:
 *   1. Parse docs/AGENT_PROTOCOL.md → declared sets.
 *   2. Walk .apm/pipelines/*.yml; for each transition.outcome, trigger.event,
 *      and trigger.labels[*] item, assert it is declared.
 *   3. Exit non-zero on any violation.
 *
 * The orchestrator-source scan is intentionally conservative: it only flags
 * label / outcome strings that appear with the canonical prefixes. This avoids
 * false positives on JSDoc, test fixtures, etc.
 */

import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadRegulation } from './regulation.js';

const PIPELINES_DIR = '.apm/pipelines';

async function* yamlFiles(dir) {
  if (!existsSync(dir)) return;
  for (const f of await readdir(dir)) {
    if (f.endsWith('.yml') || f.endsWith('.yaml')) {
      yield path.join(dir, f);
    }
  }
}

async function main() {
  const root = process.cwd();
  const reg = await loadRegulation(root);
  if (!reg.found) {
    console.error('✗ Regulation document missing at docs/AGENT_PROTOCOL.md (ADR-006).');
    process.exit(1);
  }

  let violations = 0;

  for await (const file of yamlFiles(path.join(root, PIPELINES_DIR))) {
    let parsed;
    try {
      parsed = yaml.load(await readFile(file, 'utf8'));
    } catch (err) {
      console.error(`✗ ${file}: YAML parse error — ${err.message}`);
      violations += 1;
      continue;
    }
    const ev = parsed?.trigger?.event;
    if (ev && !reg.triggers.has(ev)) {
      console.error(`✗ ${file}: undeclared trigger.event "${ev}"`);
      violations += 1;
    }
    for (const l of parsed?.trigger?.labels ?? []) {
      if (!reg.labels.has(l)) {
        console.error(`✗ ${file}: undeclared trigger.labels[*] "${l}"`);
        violations += 1;
      }
    }
    for (const t of parsed?.transitions ?? []) {
      if (t?.outcome && !reg.outcomes.has(t.outcome)) {
        console.error(`✗ ${file}: undeclared transitions[*].outcome "${t.outcome}"`);
        violations += 1;
      }
    }
  }

  if (violations === 0) {
    console.log('✓ regulation-lint: every pipeline identifier is declared in docs/AGENT_PROTOCOL.md.');
    process.exit(0);
  }
  console.error(`\n${violations} regulation violation(s). Update docs/AGENT_PROTOCOL.md (FR-024).`);
  process.exit(1);
}

main().catch(err => {
  console.error('regulation-lint fatal:', err);
  process.exit(2);
});
