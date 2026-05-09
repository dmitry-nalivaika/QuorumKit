/**
 * api-version.js
 * Pipeline `apiVersion` declaration + compatibility gate (FR-013, ADR-047).
 *
 * The engine binary declares the highest pipeline apiVersion it understands
 * via `ENGINE_API_VERSION`. Pipelines may pin to a specific apiVersion via
 * `apiVersion: 'X.Y'` at the top level of the YAML. If a pipeline declares
 * an apiVersion newer than the engine's, loading MUST fail with an
 * actionable message naming both versions and the remediation (bump the
 * Action ref).
 *
 * Versioning is `<major>.<minor>`, integer parts. Pipeline minor ≤ engine
 * minor (within same major) is accepted. Major mismatches are rejected in
 * either direction (a v3 engine refuses v2 pipelines AND v4 pipelines).
 */

export const ENGINE_API_VERSION = '1.0';

/**
 * @param {unknown} v
 * @returns {{ major: number, minor: number } | null}
 */
export function parseApiVersion(v) {
  if (typeof v !== 'string') return null;
  const m = /^(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * @param {string|null|undefined} pipelineVersion
 * @param {string} engineVersion
 * @returns {boolean}
 */
export function isApiVersionSupported(pipelineVersion, engineVersion) {
  // Missing apiVersion → treat as compatible (v3.0.0 introduces the field;
  // older pipelines without it still load).
  if (pipelineVersion == null) return true;
  const p = parseApiVersion(pipelineVersion);
  const e = parseApiVersion(engineVersion);
  if (!p || !e) return false;
  if (p.major !== e.major) return false;
  return p.minor <= e.minor;
}

/**
 * Throws a user-actionable Error if the parsed pipeline declares an
 * incompatible apiVersion. No-op if compatible or if apiVersion is absent.
 *
 * @param {object} parsed - YAML-parsed pipeline document
 * @param {string} [engineVersion=ENGINE_API_VERSION]
 */
export function assertApiVersionSupported(parsed, engineVersion = ENGINE_API_VERSION) {
  const declared = parsed?.apiVersion;
  if (declared == null) return;
  const p = parseApiVersion(declared);
  if (!p) {
    throw new Error(
      `apiVersion '${declared}' is not a valid '<major>.<minor>' string. ` +
      `Engine apiVersion is '${engineVersion}'. Remediation: set 'apiVersion: ${engineVersion}'.`
    );
  }
  if (!isApiVersionSupported(declared, engineVersion)) {
    throw new Error(
      `Pipeline declares apiVersion '${declared}', but this engine only supports up to '${engineVersion}'. ` +
      `Remediation: bump the APM engine Action ref (uses: dmitry-nalivaika/APM/engine@<newer-sha>) ` +
      `or lower the pipeline's apiVersion.`
    );
  }
}
