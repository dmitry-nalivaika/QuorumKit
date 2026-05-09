/**
 * runtime-registry.js
 * Load and validate `.apm/runtimes.yml` (FR-007, FR-008, ADR-005).
 *
 * Enforces the kind allowlist: only `claude` and `copilot` are enabled in v2.
 * Reserved kinds (`azure-openai`, `bedrock`, `ollama`, `custom`) are rejected
 * with the canonical error code `RUNTIME_KIND_NOT_ENABLED` (ADR-005).
 *
 * Resolution precedence (FR-008):
 *   step.runtime → agent_defaults[agent] → default_runtime → null
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createRequire } from 'module';
import Ajv from 'ajv';

const require = createRequire(import.meta.url);
const schemaUrl = new URL('./schemas/runtimes.schema.json', import.meta.url);
const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(schema);

export const ENABLED_KINDS = Object.freeze(['claude', 'copilot']);
export const RESERVED_KINDS = Object.freeze(['azure-openai', 'bedrock', 'ollama', 'custom']);
export const REGISTRY_PATH = '.apm/runtimes.yml';

/**
 * Validate a parsed registry object. Returns array of error objects (empty = ok).
 * Codes:
 *   SCHEMA_INVALID
 *   RUNTIME_KIND_NOT_ENABLED
 *   AGENT_DEFAULT_UNKNOWN_RUNTIME
 *   PROJECT_DEFAULT_UNKNOWN_RUNTIME
 *
 * @param {object} parsed
 * @returns {Array<{code, message, location?}>}
 */
export function validateRegistry(parsed) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object') {
    return [{ code: 'SCHEMA_INVALID', message: 'Runtime registry must be a YAML object.' }];
  }
  if (!validateSchema(parsed)) {
    for (const err of validateSchema.errors ?? []) {
      errors.push({ code: 'SCHEMA_INVALID', message: `${err.instancePath || '/'} ${err.message}` });
    }
    return errors;
  }

  const allKinds = new Set([...ENABLED_KINDS, ...RESERVED_KINDS]);
  for (const [name, rt] of Object.entries(parsed.runtimes)) {
    if (RESERVED_KINDS.includes(rt.kind)) {
      errors.push({
        code: 'RUNTIME_KIND_NOT_ENABLED',
        message: `Runtime "${name}" uses reserved kind "${rt.kind}"; enabling requires a per-kind ADR (see ADR-005).`,
        location: `/runtimes/${name}/kind`,
      });
    } else if (!ENABLED_KINDS.includes(rt.kind)) {
      errors.push({
        code: 'RUNTIME_KIND_NOT_ENABLED',
        message: `Runtime "${name}" uses unknown kind "${rt.kind}"; allowlist is: ${ENABLED_KINDS.join(', ')}.`,
        location: `/runtimes/${name}/kind`,
      });
    }
  }

  const names = new Set(Object.keys(parsed.runtimes));
  if (parsed.default_runtime && !names.has(parsed.default_runtime)) {
    errors.push({
      code: 'PROJECT_DEFAULT_UNKNOWN_RUNTIME',
      message: `default_runtime "${parsed.default_runtime}" is not declared.`,
      location: '/default_runtime',
    });
  }
  for (const [agent, rtName] of Object.entries(parsed.agent_defaults ?? {})) {
    if (!names.has(rtName)) {
      errors.push({
        code: 'AGENT_DEFAULT_UNKNOWN_RUNTIME',
        message: `agent_defaults.${agent} → "${rtName}" is not declared.`,
        location: `/agent_defaults/${agent}`,
      });
    }
  }

  return errors;
}

/**
 * Load and validate the registry from disk.
 *
 * @param {string} [rootDir]
 * @returns {Promise<{found: boolean, runtimes: object, default_runtime?: string, agent_defaults?: object, errors: Array}>}
 */
export async function loadRuntimeRegistry(rootDir = process.cwd()) {
  const fullPath = path.join(rootDir, REGISTRY_PATH);
  if (!existsSync(fullPath)) {
    return { found: false, runtimes: {}, errors: [] };
  }
  const raw = await readFile(fullPath, 'utf8');
  const parsed = yaml.load(raw, { schema: yaml.CORE_SCHEMA }) ?? {};
  const errors = validateRegistry(parsed);
  return {
    found: true,
    runtimes: parsed.runtimes ?? {},
    default_runtime: parsed.default_runtime,
    agent_defaults: parsed.agent_defaults ?? {},
    errors,
  };
}

/**
 * Resolve the runtime to use for a step (FR-008).
 *
 * @param {object} args
 * @param {object} args.registry  - parsed registry object
 * @param {string} args.agent
 * @param {string} [args.stepRuntime]
 * @returns {{ name: string, runtime: object } | { error: 'runtime-unresolved', detail: object }}
 */
export function resolveRuntime({ registry, agent, stepRuntime }) {
  const sources = [
    { level: 'step', name: stepRuntime },
    { level: 'agent', name: registry.agent_defaults?.[agent] },
    { level: 'project', name: registry.default_runtime },
  ];

  for (const s of sources) {
    if (s.name && registry.runtimes?.[s.name]) {
      return { name: s.name, runtime: registry.runtimes[s.name], source: s.level };
    }
  }

  return {
    error: 'runtime-unresolved',
    detail: {
      agent,
      tried: {
        step: stepRuntime ?? null,
        agent: registry.agent_defaults?.[agent] ?? null,
        project: registry.default_runtime ?? null,
      },
    },
  };
}
