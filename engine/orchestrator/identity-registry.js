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

export const IDENTITIES_PATH = 'src/agent-identities.yml';

/**
 * A login may be listed under several agents (every Actions-posted comment is authored by the
 * shared `github-actions[bot]`), but `byLogin` is single-valued: the last agent listed wins.
 * The full many-to-many view is kept here, keyed by the `byLogin` map it was built with, so
 * `resolveLogin` stays unchanged for existing callers.
 */
const agentsByLoginIndex = new WeakMap();

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
  const allAgents = new Map();
  for (const entry of parsed.identities) {
    for (const login of entry.logins) {
      const key = login.toLowerCase();
      byLogin.set(key, entry.agent);
      if (!allAgents.has(key)) allAgents.set(key, new Set());
      allAgents.get(key).add(entry.agent);
    }
  }
  agentsByLoginIndex.set(byLogin, allAgents);
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
 * Is `login` authorised to speak for `agent`? Unlike `resolveLogin`, this honours logins that are
 * shared by several agents. `agent` may be given with or without the `-agent` suffix.
 * @param {Map<string, string>} byLogin
 * @param {string} login
 * @param {string} agent
 * @returns {boolean}
 */
export function loginMapsToAgent(byLogin, login, agent) {
  if (!byLogin || !login || !agent) return false;
  const bare = a => a.replace(/-agent$/, '');
  const key = login.toLowerCase();
  const candidates = agentsByLoginIndex.get(byLogin)?.get(key)
    ?? (byLogin.has(key) ? new Set([byLogin.get(key)]) : new Set());
  for (const a of candidates) if (bare(a) === bare(agent)) return true;
  return false;
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
  const parsed = yaml.load(await readFile(fullPath, 'utf8'), { schema: yaml.CORE_SCHEMA }) ?? {};
  const lookup = buildLookup(parsed);
  if (!lookup.ok) return { found: true, byLogin: new Map(), errors: lookup.errors };
  return { found: true, byLogin: lookup.byLogin, errors: [] };
}
