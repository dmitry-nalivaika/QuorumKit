/**
 * identity-registry.js
 * Maps GitHub logins → agent slugs (FR-013).
 *
 * Comments authored by identities not declared here are ignored for
 * routing, regardless of `apm-msg` content. The registry is a many-to-one
 * map (multiple logins can resolve to the same agent slug).
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import Ajv from 'ajv';

const schemaUrl = new URL('./schemas/agent-identities.schema.json', import.meta.url);
const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(schema);

export const IDENTITIES_PATH = '.apm/agent-identities.yml';

/**
 * Build a login → agent map from a parsed identities object.
 *
 * @param {object} parsed
 * @returns {{ ok: true, byLogin: Map<string, string> } | { ok: false, errors: object[] }}
 */
export function buildLookup(parsed) {
  if (!validateSchema(parsed)) {
    return {
      ok: false,
      errors: (validateSchema.errors ?? []).map(e => ({
        code: 'SCHEMA_INVALID',
        message: `${e.instancePath || '/'} ${e.message}`,
      })),
    };
  }
  const byLogin = new Map();
  for (const entry of parsed.identities) {
    for (const login of entry.logins) {
      byLogin.set(login.toLowerCase(), entry.agent);
    }
  }
  return { ok: true, byLogin };
}

/**
 * Resolve a GitHub login to the configured agent slug, case-insensitive.
 * @param {Map<string, string>} byLogin
 * @param {string} login
 * @returns {string | null}
 */
export function resolveLogin(byLogin, login) {
  if (!byLogin || !login) return null;
  return byLogin.get(login.toLowerCase()) ?? null;
}

/**
 * Load and validate the identity registry from disk.
 *
 * @param {string} [rootDir]
 * @returns {Promise<{found: boolean, byLogin: Map<string, string>, errors: object[]}>}
 */
export async function loadIdentities(rootDir = process.cwd()) {
  const fullPath = path.join(rootDir, IDENTITIES_PATH);
  if (!existsSync(fullPath)) {
    return { found: false, byLogin: new Map(), errors: [] };
  }
  const parsed = yaml.load(await readFile(fullPath, 'utf8')) ?? {};
  const lookup = buildLookup(parsed);
  if (!lookup.ok) return { found: true, byLogin: new Map(), errors: lookup.errors };
  return { found: true, byLogin: lookup.byLogin, errors: [] };
}
