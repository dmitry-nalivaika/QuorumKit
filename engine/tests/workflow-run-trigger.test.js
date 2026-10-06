/**
 * #378 regression guard. orchestrator.yml's `on.workflow_run.workflows` list is matched against the
 * RUN name. Agent workflows that set `run-name: "<name> #<issue>"` produce run names the plain
 * workflow name no longer matches, so the orchestrator silently stopped reacting when they finished.
 * This asserts every listed copilot agent workflow is still matched by its real run name.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const root = new URL('../../', import.meta.url).pathname;

// GitHub filter-pattern subset used here: `*` = any chars except `/`.
const globToRegExp = g =>
  new RegExp('^' + g.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');

function load(rel) {
  return yaml.load(fs.readFileSync(path.join(root, rel), 'utf8'));
}

for (const base of ['.github/workflows', 'src/.github/workflows']) {
  describe(`${base}: orchestrator workflow_run trigger matches agent run names`, () => {
    const orch = load(`${base}/orchestrator.yml`);
    const patterns = (orch.on ?? orch[true]).workflow_run.workflows;
    const matchers = patterns.map(globToRegExp);
    const matched = name => matchers.some(re => re.test(name));

    const agents = fs.readdirSync(path.join(root, base))
      .filter(f => /^copilot-agent-.*\.yml$/.test(f))
      .map(f => ({ file: f, wf: load(`${base}/${f}`) }))
      .filter(({ wf }) => patterns.some(p => globToRegExp(p).test(wf.name)));

    it('finds the agent workflows the trigger lists', () => {
      expect(agents.length).toBeGreaterThanOrEqual(8);
    });

    for (const { file, wf } of agents) {
      it(`${file}: its real run name triggers the orchestrator`, () => {
        // Render `run-name` the way GitHub would for an orchestrator dispatch of issue 383.
        const runName = wf['run-name']
          ? String(wf['run-name']).replace(/\$\{\{[^}]*\}\}/g, '383')
          : wf.name;
        expect(matched(runName), `run name "${runName}" is not matched by any workflow_run pattern`).toBe(true);
      });
    }
  });
}
