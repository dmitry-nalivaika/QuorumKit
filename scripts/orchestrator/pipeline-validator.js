/**
 * pipeline-validator.js
 * Pure offline semantic validator for v2 pipelines (FR-006, FR-020, FR-028).
 *
 * Defects detected (one error per defect, all reported, never throws):
 *   - SCHEMA_INVALID            : Ajv schema violation
 *   - UNKNOWN_SCHEMA_VERSION    : neither v1 nor v2
 *   - ENTRY_NOT_IN_STEPS        : entry step name doesn't match a declared step
 *   - DUPLICATE_STEP_NAME       : two steps share a name
 *   - UNREACHABLE_STEP          : step has no incoming transition (and isn't entry)
 *   - TRANSITION_FROM_UNKNOWN   : transition.from doesn't match a step
 *   - TRANSITION_TO_UNKNOWN     : transition.to doesn't match a step
 *   - UNDECLARED_OUTCOME        : transition.outcome not in regulation
 *   - UNDECLARED_LABEL          : trigger.labels references an undeclared label
 *   - UNDECLARED_TRIGGER        : trigger.event not in regulation
 *   - UNKNOWN_RUNTIME           : step.runtime not in registry
 *   - BACKWARD_EDGE_NO_BUDGET   : graph has backward edges but no loop_budget
 *   - STEP_TIMEOUT_EXCEEDS_JOB  : step.timeout_minutes > workflow timeout-minutes (FR-028)
 *
 * Inputs:
 *   pipeline   — parsed YAML object
 *   context    — { regulation: {labels, outcomes, triggers},
 *                  runtimes: Set<string>,
 *                  workflowTimeouts?: Map<string, number> }   // workflow file → cap
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { createRequire } from 'module';
import Ajv from 'ajv';

const require = createRequire(import.meta.url);
const schemaUrl = new URL('./schemas/pipeline.schema.json', import.meta.url);
const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(schema);

/**
 * Run all semantic checks. Returns an array of error objects (empty = valid).
 *
 * @param {object} pipeline
 * @param {object} [context]
 * @returns {Array<{code: string, message: string, location?: string}>}
 */
export function validatePipeline(pipeline, context = {}) {
  const errors = [];

  if (!pipeline || typeof pipeline !== 'object') {
    return [{ code: 'SCHEMA_INVALID', message: 'Pipeline must be a YAML object.' }];
  }

  if (!validateSchema(pipeline)) {
    for (const err of validateSchema.errors ?? []) {
      errors.push({
        code: 'SCHEMA_INVALID',
        message: `${err.instancePath || '/'} ${err.message}`,
        location: err.instancePath || '/',
      });
    }
    return errors; // schema-invalid pipeline can't have meaningful semantic checks
  }

  const schemaVersion = pipeline.schema_version ?? pipeline.version ?? '1';

  if (schemaVersion === '1') {
    // v1 has no transitions or runtimes; only label/trigger declaration checks apply.
    checkRegulation(pipeline, context, errors);
    return errors;
  }

  if (schemaVersion !== '2') {
    errors.push({
      code: 'UNKNOWN_SCHEMA_VERSION',
      message: `schema_version "${schemaVersion}" is not supported; expected "1" or "2".`,
    });
    return errors;
  }

  // ─── v2 semantic checks ────────────────────────────────────────────────
  const stepNames = new Set();
  const dupes = new Set();
  for (const s of pipeline.steps) {
    if (stepNames.has(s.name)) dupes.add(s.name);
    stepNames.add(s.name);
  }
  for (const d of dupes) {
    errors.push({ code: 'DUPLICATE_STEP_NAME', message: `Step name "${d}" is declared more than once.`, location: `/steps` });
  }

  if (!stepNames.has(pipeline.entry)) {
    errors.push({
      code: 'ENTRY_NOT_IN_STEPS',
      message: `entry "${pipeline.entry}" does not match any declared step.`,
      location: '/entry',
    });
  }

  // Build the graph
  const incoming = new Map();
  for (const t of pipeline.transitions) {
    if (!stepNames.has(t.from)) {
      errors.push({
        code: 'TRANSITION_FROM_UNKNOWN',
        message: `Transition references unknown source step "${t.from}".`,
        location: `/transitions`,
      });
    }
    if (!stepNames.has(t.to)) {
      errors.push({
        code: 'TRANSITION_TO_UNKNOWN',
        message: `Transition references unknown target step "${t.to}".`,
        location: `/transitions`,
      });
    }
    if (!incoming.has(t.to)) incoming.set(t.to, []);
    incoming.get(t.to).push(t);
  }

  // Unreachable: step has no incoming and isn't the entry
  for (const s of pipeline.steps) {
    if (s.name !== pipeline.entry && !incoming.has(s.name)) {
      errors.push({
        code: 'UNREACHABLE_STEP',
        message: `Step "${s.name}" has no incoming transition and is not the entry step.`,
        location: `/steps`,
      });
    }
  }

  // Outcome / label / trigger declarations vs regulation
  checkRegulation(pipeline, context, errors);

  // Runtime references (step-level)
  if (context.runtimes instanceof Set) {
    for (const s of pipeline.steps) {
      if (s.runtime && !context.runtimes.has(s.runtime)) {
        errors.push({
          code: 'UNKNOWN_RUNTIME',
          message: `Step "${s.name}" references runtime "${s.runtime}" which is not declared in the runtime registry.`,
          location: `/steps/${s.name}`,
        });
      }
    }
  }

  // Backward-edge → loop_budget required
  const stepIndex = new Map(pipeline.steps.map((s, i) => [s.name, i]));
  let hasBackward = false;
  for (const t of pipeline.transitions) {
    const fi = stepIndex.get(t.from);
    const ti = stepIndex.get(t.to);
    if (fi != null && ti != null && ti <= fi) hasBackward = true;
  }
  if (hasBackward && !pipeline.loop_budget) {
    errors.push({
      code: 'BACKWARD_EDGE_NO_BUDGET',
      message: 'Pipeline declares one or more backward edges but is missing required `loop_budget`.',
      location: '/loop_budget',
    });
  }

  // Per-step timeout vs dispatched workflow cap (FR-028)
  if (context.workflowTimeouts instanceof Map) {
    for (const s of pipeline.steps) {
      if (typeof s.timeout_minutes !== 'number') continue;
      // Workflow file convention: agent-<slug>.yml or copilot-agent-<slug>.yml
      const candidates = [`agent-${s.agent}.yml`, `copilot-agent-${s.agent}.yml`];
      for (const c of candidates) {
        const cap = context.workflowTimeouts.get(c);
        if (typeof cap === 'number' && s.timeout_minutes > cap) {
          errors.push({
            code: 'STEP_TIMEOUT_EXCEEDS_JOB',
            message: `Step "${s.name}" timeout_minutes=${s.timeout_minutes} exceeds workflow ${c} timeout-minutes=${cap}.`,
            location: `/steps/${s.name}`,
          });
        }
      }
    }
  }

  return errors;
}

function checkRegulation(pipeline, context, errors) {
  const reg = context.regulation;
  if (!reg) return;

  // Trigger event must be declared
  if (reg.triggers && pipeline.trigger?.event && !reg.triggers.has(pipeline.trigger.event)) {
    errors.push({
      code: 'UNDECLARED_TRIGGER',
      message: `trigger.event "${pipeline.trigger.event}" is not declared in the regulation document.`,
      location: '/trigger/event',
    });
  }

  // Trigger labels must be declared
  if (reg.labels && Array.isArray(pipeline.trigger?.labels)) {
    for (const l of pipeline.trigger.labels) {
      if (!reg.labels.has(l)) {
        errors.push({
          code: 'UNDECLARED_LABEL',
          message: `trigger.labels references undeclared label "${l}".`,
          location: '/trigger/labels',
        });
      }
    }
  }

  // Transition outcomes must be declared (v2 only)
  if (reg.outcomes && Array.isArray(pipeline.transitions)) {
    for (const t of pipeline.transitions) {
      if (!reg.outcomes.has(t.outcome)) {
        errors.push({
          code: 'UNDECLARED_OUTCOME',
          message: `Transition ${t.from} → ${t.to} references undeclared outcome "${t.outcome}".`,
          location: '/transitions',
        });
      }
    }
  }
}
