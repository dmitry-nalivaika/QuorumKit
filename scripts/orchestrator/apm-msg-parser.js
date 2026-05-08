/**
 * apm-msg-parser.js
 * Extracts and validates the single fenced ```apm-msg ``` JSON block at the
 * end of an agent comment (FR-011, FR-012, FR-013).
 *
 * The parser is pure: it never reads the network, never resolves identities,
 * and never logs secrets. Identity verification happens in the caller via
 * identity-registry.js (FR-013).
 *
 * Reasons returned on failure (string constants for the audit comment):
 *   - 'no-block'           : zero apm-msg fences found
 *   - 'multiple-blocks'    : more than one apm-msg fence found
 *   - 'malformed-json'     : block contents are not valid JSON
 *   - 'schema-invalid'     : JSON does not validate against apm-msg.schema.json
 *
 * Public surface:
 *   parseApmMsg(commentBody)              → { ok, message?, reason?, ajvErrors?, redacted? }
 *   redactBlock(rawBlock, max=200)        → string (defensive trimmer for audit comments)
 */

import fs from 'fs/promises';
import { createRequire } from 'module';
import Ajv from 'ajv';

const require = createRequire(import.meta.url);
const schemaUrl = new URL('./schemas/apm-msg.schema.json', import.meta.url);
const schema = JSON.parse(await fs.readFile(schemaUrl, 'utf8'));
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const FENCE_RE = /```apm-msg\s*\n([\s\S]*?)```/g;
const REDACT_DEFAULT = 200;

/**
 * Extract the (single) apm-msg block from a comment body and validate it.
 *
 * @param {string} commentBody
 * @returns {{ ok: true, message: object } | { ok: false, reason: string, redacted: string, ajvErrors?: object[] }}
 */
export function parseApmMsg(commentBody) {
  if (typeof commentBody !== 'string' || commentBody.length === 0) {
    return { ok: false, reason: 'no-block', redacted: '' };
  }

  const matches = [...commentBody.matchAll(FENCE_RE)];

  if (matches.length === 0) {
    return { ok: false, reason: 'no-block', redacted: '' };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: 'multiple-blocks',
      redacted: redactBlock(matches.map(m => m[1]).join('\n---\n')),
    };
  }

  const raw = matches[0][1];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed-json', redacted: redactBlock(raw) };
  }

  const ok = validate(parsed);
  if (!ok) {
    return {
      ok: false,
      reason: 'schema-invalid',
      ajvErrors: validate.errors,
      redacted: redactBlock(raw),
    };
  }

  return { ok: true, message: parsed };
}

/**
 * Trim a block to its first N characters so the orchestrator can quote a
 * defective message in an audit comment without leaking long bodies.
 *
 * @param {string} raw
 * @param {number} [max=200]
 * @returns {string}
 */
export function redactBlock(raw, max = REDACT_DEFAULT) {
  if (typeof raw !== 'string') return '';
  if (raw.length <= max) return raw;
  return raw.slice(0, max) + '…';
}

/**
 * Verify a parsed apm-msg matches the active step / run / iteration / agent.
 * Returns null on success, or a string reason on failure.
 *
 * @param {object} message - validated apm-msg
 * @param {{runId, expectedStep, expectedAgent, expectedIteration}} expected
 * @returns {string | null}
 */
export function validateContext(message, expected) {
  if (message.runId !== expected.runId) return 'context-runid-mismatch';
  if (message.step !== expected.expectedStep) return 'context-step-mismatch';
  if (message.agent !== expected.expectedAgent) return 'context-agent-mismatch';
  if (typeof expected.expectedIteration === 'number' &&
      message.iteration !== expected.expectedIteration) {
    return 'context-iteration-mismatch';
  }
  return null;
}
