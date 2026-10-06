import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const FIXTURES = join(HERE, 'fixtures');

const REGULATION = `
## 1. Labels

| Label | Applied by |
|---|---|
| \`type:feature\` | Triage |

## 2. apm-msg Outcomes

| Outcome | Semantics |
|---|---|
| \`success\` | ok |

## 3. Examples

none

## 4. Transition Triggers

| Event |
|---|
| \`issues.opened\` |
`;

/** Import a CLI module fresh and resolve with the first process.exit code it requests. */
async function runCli(modulePath, { cwd, args = [] }) {
  vi.resetModules();
  const codes = [];
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', modulePath, ...args]);
  vi.spyOn(process, 'exit').mockImplementation(code => { codes.push(code); });
  await import(`${modulePath}?run=${Math.random()}`);
  await vi.waitFor(() => expect(codes.length).toBeGreaterThan(0));
  return codes[0];
}

describe('CLI entry points', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'qk-cli-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('pipeline-validator-cli', () => {
    const cli = join(HERE, '..', 'orchestrator', 'pipeline-validator-cli.js');

    it('exits 0 for a directory of valid pipelines', async () => {
      const code = await runCli(cli, { cwd: tmp, args: [join(FIXTURES, 'pipelines-valid')] });
      expect(code).toBe(0);
    });

    it('exits 0 for a single valid file', async () => {
      const code = await runCli(cli, { cwd: tmp, args: [join(FIXTURES, 'valid-pipeline.yml')] });
      expect(code).toBe(0);
    });

    it('exits 1 when any pipeline is invalid', async () => {
      const code = await runCli(cli, { cwd: tmp, args: [join(FIXTURES, 'pipelines-mixed')] });
      expect(code).toBe(1);
    });

    it('exits 1 and reports YAML parse errors', async () => {
      const bad = join(tmp, 'bad.yml');
      writeFileSync(bad, 'a: [unclosed\n');
      const code = await runCli(cli, { cwd: tmp, args: [bad] });
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('YAML parse error'));
    });

    it('exits 1 when no pipeline files are found', async () => {
      const code = await runCli(cli, { cwd: tmp, args: [join(tmp, 'missing'), tmp] });
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith('No pipeline files found.');
    });

    it('defaults to src/pipelines under the cwd and cross-checks the regulation and runtimes', async () => {
      const code = await runCli(cli, { cwd: REPO_ROOT });
      expect(code).toBe(0);
    });

    it('ignores an unreadable runtime registry', async () => {
      mkdirSync(join(tmp, 'src'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'runtimes.yml'), 'runtimes: [not-a-map\n');
      const code = await runCli(cli, { cwd: tmp, args: [join(FIXTURES, 'pipelines-valid')] });
      expect(code).toBe(0);
    });
  });

  describe('regulation-lint', () => {
    const cli = join(HERE, '..', 'orchestrator', 'regulation-lint.js');

    function seed(pipelineYaml, regulation = REGULATION) {
      mkdirSync(join(tmp, 'docs'), { recursive: true });
      mkdirSync(join(tmp, 'src', 'pipelines'), { recursive: true });
      writeFileSync(join(tmp, 'docs', 'AGENT_PROTOCOL.md'), regulation);
      if (pipelineYaml !== null) writeFileSync(join(tmp, 'src', 'pipelines', 'p.yml'), pipelineYaml);
    }

    it('exits 1 when the regulation document is missing', async () => {
      const code = await runCli(cli, { cwd: tmp });
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Regulation document missing'));
    });

    it('exits 0 when every identifier is declared', async () => {
      seed([
        'trigger:', '  event: issues.opened', '  labels: [type:feature]',
        'transitions:', '  - outcome: success',
      ].join('\n'));
      expect(await runCli(cli, { cwd: tmp })).toBe(0);
    });

    it('exits 0 when there are no pipelines', async () => {
      seed(null);
      expect(await runCli(cli, { cwd: tmp })).toBe(0);
    });

    it('exits 1 and names each undeclared trigger, label and outcome', async () => {
      seed([
        'trigger:', '  event: issues.closed', '  labels: [type:bogus]',
        'transitions:', '  - outcome: exploded',
      ].join('\n'));
      expect(await runCli(cli, { cwd: tmp })).toBe(1);
      const messages = console.error.mock.calls.map(c => c[0]).join('\n');
      expect(messages).toContain('undeclared trigger.event "issues.closed"');
      expect(messages).toContain('undeclared trigger.labels[*] "type:bogus"');
      expect(messages).toContain('undeclared transitions[*].outcome "exploded"');
      expect(messages).toContain('3 regulation violation(s)');
    });

    it('exits 1 on YAML parse errors', async () => {
      seed('a: [unclosed\n');
      expect(await runCli(cli, { cwd: tmp })).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('YAML parse error'));
    });

    it('passes against the repository pipelines and regulation', async () => {
      expect(await runCli(cli, { cwd: REPO_ROOT })).toBe(0);
    });
  });
});
