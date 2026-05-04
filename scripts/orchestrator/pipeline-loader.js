/**
 * pipeline-loader.js
 * Loads and validates all *.yml pipeline files from a directory.
 * Invalid files are reported but do not prevent valid pipelines from loading (FR-004).
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import yaml from 'js-yaml';
import Ajv from 'ajv';

const parseYaml = yaml.load;

const require = createRequire(import.meta.url);
const schemaPath = new URL('./schemas/pipeline.schema.json', import.meta.url);
const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8').catch(() => '{}'));

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

/**
 * Load all pipeline YAML files from `dir`.
 * @param {string} dir - absolute path to the pipelines directory
 * @returns {{ valid: Pipeline[], errors: ValidationError[] }}
 */
export async function loadPipelines(dir) {
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

      const ok = validate(parsed);
      if (!ok) {
        const message = ajv.errorsText(validate.errors);
        errors.push({ file: fullPath, message });
      } else {
        valid.push(parsed);
      }
    } catch (err) {
      errors.push({ file: fullPath, message: err.message });
    }
  }

  return { valid, errors };
}
