#!/usr/bin/env node
/**
 * pipeline-validator-cli.js
 * Offline CLI for the pipeline validator (FR-020).
 *
 * Usage:
 *   node scripts/orchestrator/pipeline-validator-cli.js [path …]
 *
 * Each argument may be a YAML file or a directory; directories are scanned
 * for *.yml / *.yaml. Exits 0 if all pipelines are valid, 1 otherwise.
 *
 * The runtime registry and regulation document are loaded relative to the
 * current working directory if present; otherwise the corresponding cross-
 * reference checks are SKIPPED (so users can lint a single file in isolation
 * without `--regulation-fake`).
 */

import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { validatePipeline } from './pipeline-validator.js';
import { loadRegulation } from './regulation.js';
import { loadRuntimeRegistry } from './runtime-registry.js';

async function gatherFiles(arg) {
  const out = [];
  if (!existsSync(arg)) return out;
  const s = await stat(arg);
  if (s.isFile()) {
    if (arg.endsWith('.yml') || arg.endsWith('.yaml')) out.push(arg);
    return out;
  }
  if (s.isDirectory()) {
    for (const f of await readdir(arg)) {
      if (f.endsWith('.yml') || f.endsWith('.yaml')) out.push(path.join(arg, f));
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) args.push(path.join(process.cwd(), '.apm', 'pipelines'));

  const root = process.cwd();
  const reg = await loadRegulation(root);
  const regulation = reg.found ? reg : null;

  let runtimeNames = null;
  try {
    const runtimes = await loadRuntimeRegistry(root);
    if (runtimes.found) runtimeNames = new Set(Object.keys(runtimes.runtimes));
  } catch { /* missing registry → skip runtime cross-check */ }

  let totalErrors = 0;
  let filesChecked = 0;

  for (const arg of args) {
    const files = await gatherFiles(arg);
    for (const file of files) {
      filesChecked += 1;
      let parsed;
      try {
        parsed = yaml.load(await readFile(file, 'utf8'));
      } catch (err) {
        console.error(`✗ ${file}: YAML parse error — ${err.message}`);
        totalErrors += 1;
        continue;
      }

      const errs = validatePipeline(parsed, {
        regulation: regulation,
        runtimes: runtimeNames,
      });

      if (errs.length === 0) {
        console.log(`✓ ${file}`);
      } else {
        console.error(`✗ ${file}:`);
        for (const e of errs) {
          console.error(`    [${e.code}] ${e.message}`);
        }
        totalErrors += errs.length;
      }
    }
  }

  if (filesChecked === 0) {
    console.error('No pipeline files found.');
    process.exit(1);
  }
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('pipeline-validator-cli fatal:', err);
  process.exit(2);
});
