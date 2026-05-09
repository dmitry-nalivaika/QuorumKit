/**
 * pipeline-loader.js
 * Loads pipeline YAML files and normalises both v1 and v2 forms into a single
 * internal Pipeline graph (FR-002, FR-003, US-7).
 *
 * Internal Pipeline shape (post-normalisation):
 * {
 *   name, schemaVersion, trigger, entry,
 *   steps:        [ { name, agent, runtime?, condition?, approval?,
 *                     approval_timeout_hours?, timeout_minutes? } ],
 *   transitions:  [ { from, outcome, to } ],
 *   loopBudget:   { max_iterations_per_edge, max_total_steps, max_wallclock_minutes } | null,
 *   raw:          original parsed YAML (preserved for back-compat — tests inspect
 *                 the legacy `version`/`steps` shape)
 * }
 *
 * Backward compatibility:
 *   - v1 pipelines are accepted as-is and normalised into a degenerate
 *     forward-only graph with implicit `success → next-step` transitions.
 *   - The returned objects ALSO retain their original v1 properties
 *     (`version`, `steps` array unchanged in shape) so existing v1 callers
 *     keep working unchanged.
 *
 * Invalid files are reported in `errors` but do not prevent valid pipelines
 * from loading (FR-006).
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import yaml from 'js-yaml';
import { validatePipeline } from './pipeline-validator.js';
import { assertApiVersionSupported } from './api-version.js';

// FR-013: tag-aware loading is forbidden. js-yaml v4's default schema is
// already safe (no !!js/function), but we pin CORE_SCHEMA explicitly so any
// future default-schema change cannot silently weaken our guarantee.
const SAFE_LOAD_OPTS = { schema: yaml.CORE_SCHEMA };
const parseYaml = (raw) => yaml.load(raw, SAFE_LOAD_OPTS);

/**
 * Load all pipeline YAML files from `dir`, normalise into the internal form,
 * and run semantic validation.
 *
 * @param {string} dir
 * @param {object} [context] - { regulation?, runtimes?, workflowTimeouts? }
 * @returns {Promise<{ valid: Pipeline[], errors: ValidationError[] }>}
 */
export async function loadPipelines(dir, context = {}) {
  if (!existsSync(dir)) return { valid: [], errors: [] };

  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return { valid: [], errors: [] };
  }

  const ymlFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  if (ymlFiles.length === 0) return { valid: [], errors: [] };

  const valid = [];
  const errors = [];

  for (const file of ymlFiles) {
    const fullPath = path.join(dir, file);
    try {
      const raw = await fs.readFile(fullPath, 'utf8');
      const parsed = parseYaml(raw);

      // FR-013: apiVersion compatibility gate (engine refuses too-new pipelines).
      assertApiVersionSupported(parsed);

      const semanticErrors = validatePipeline(parsed, context);
      if (semanticErrors.length > 0) {
        errors.push({ file: fullPath, message: semanticErrors.map(e => `${e.code}: ${e.message}`).join('; ') });
        continue;
      }

      valid.push(normalise(parsed));
    } catch (err) {
      errors.push({ file: fullPath, message: err.message });
    }
  }

  return { valid, errors };
}

/**
 * Normalise a parsed YAML pipeline into the internal Pipeline graph shape.
 * Preserves original fields for v1 back-compat with existing callers.
 *
 * @param {object} parsed
 * @returns {object}
 */
export function normalise(parsed) {
  const schemaVersion = parsed.schema_version ?? parsed.version ?? '1';

  if (schemaVersion === '2') {
    return {
      ...parsed,
      schemaVersion: '2',
      entry: parsed.entry,
      transitions: parsed.transitions,
      loopBudget: parsed.loop_budget ?? null,
    };
  }

  // v1 → degenerate forward-only graph
  const steps = parsed.steps ?? [];
  const transitions = [];
  for (let i = 0; i < steps.length - 1; i++) {
    transitions.push({ from: steps[i].name, outcome: 'success', to: steps[i + 1].name });
  }
  return {
    ...parsed,
    schemaVersion: '1',
    entry: steps[0]?.name ?? null,
    transitions,
    loopBudget: null,
  };
}
