import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The "Ensure main ref exists for Changesets" step of the Changeset Validation and RC
 * Validation workflows.
 *
 * Changesets diffs against the local `main` branch, which a CI checkout does not always
 * carry. The step used to run `git branch --force main origin/main` unconditionally. That
 * works on pull_request events (HEAD is a detached merge commit) but fails on every push to
 * main, where actions/checkout has `main` itself checked out and git refuses to
 * force-update a checked-out branch. Both workflows then went red before any validation ran.
 *
 * These tests execute the step's script exactly as written in each workflow file, against
 * throwaway repositories shaped like each checkout.
 */

const WORKFLOW_DIR = join(__dirname, '..', '..', '.github', 'workflows');
const WORKFLOWS = ['changeset-validation.yml', 'rc-validation.yml'];
const STEP_NAME = 'Ensure main ref exists for Changesets';
const DEFECTIVE_STEP = 'git fetch origin main:refs/remotes/origin/main\ngit branch --force main origin/main\n';

function extractStepScript(workflow: string): string {
  const workflowPath = join(WORKFLOW_DIR, workflow);
  const lines = readFileSync(workflowPath, 'utf8').split('\n');
  const nameAt = lines.findIndex((line) => line.trim() === `- name: ${STEP_NAME}`);
  if (nameAt < 0) throw new Error(`${workflowPath}: step "${STEP_NAME}" not found`);
  const runAt = lines.findIndex((line, index) => index > nameAt && line.trim() === 'run: |');
  if (runAt < 0) throw new Error(`${workflowPath}: step "${STEP_NAME}" has no run block`);
  const runIndent = lines[runAt].search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== '' && line.search(/\S/) <= runIndent) break;
    body.push(line);
  }
  const bodyIndent = Math.min(...body.filter((line) => line.trim()).map((line) => line.search(/\S/)));
  return `${body.map((line) => line.slice(bodyIndent)).join('\n').trimEnd()}\n`;
}

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'ci-test',
  GIT_AUTHOR_EMAIL: 'ci-test@example.invalid',
  GIT_COMMITTER_NAME: 'ci-test',
  GIT_COMMITTER_EMAIL: 'ci-test@example.invalid',
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function runStep(cwd: string, script: string): void {
  execFileSync('bash', ['-e', '-c', script], { cwd, env: GIT_ENV, stdio: 'pipe' });
}

describe('CI: Changesets main ref step', () => {
  let root: string;
  let origin: string;
  let first: string;
  let second: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ci-main-ref-'));
    origin = join(root, 'origin.git');
    const seed = join(root, 'seed');
    git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
    git(root, 'init', '--quiet', '--initial-branch=main', seed);
    writeFileSync(join(seed, 'file.txt'), 'one\n');
    git(seed, 'add', 'file.txt');
    git(seed, 'commit', '--quiet', '-m', 'one');
    first = git(seed, 'rev-parse', 'HEAD');
    git(seed, 'push', '--quiet', origin, 'main');
    writeFileSync(join(seed, 'file.txt'), 'two\n');
    git(seed, 'commit', '--quiet', '-am', 'two');
    second = git(seed, 'rev-parse', 'HEAD');
    git(seed, 'push', '--quiet', origin, 'main');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** A push to main: `main` is the checked-out branch at the pushed commit. */
  function pushCheckout(): string {
    const work = join(root, 'push');
    git(root, 'clone', '--quiet', origin, work);
    return work;
  }

  /** A pull_request: detached HEAD, and either no local `main` or a stale one. */
  function pullRequestCheckout(localMain: 'absent' | 'stale'): string {
    const work = join(root, 'pr');
    git(root, 'clone', '--quiet', origin, work);
    git(work, 'checkout', '--quiet', '--detach', second);
    if (localMain === 'absent') git(work, 'branch', '--quiet', '-D', 'main');
    else git(work, 'branch', '--quiet', '--force', 'main', first);
    return work;
  }

  it('both workflows run the same step script, and neither still runs the defective one', () => {
    const scripts = WORKFLOWS.map(extractStepScript);
    expect(scripts[1]).toBe(scripts[0]);
    for (const script of scripts) expect(script).not.toBe(DEFECTIVE_STEP);
  });

  it('the defective script fails on a push checkout (the regression this guards)', () => {
    expect(() => runStep(pushCheckout(), DEFECTIVE_STEP)).toThrow();
  });

  it.each(WORKFLOWS)('%s: succeeds on a push to main and leaves the checked-out main at the pushed commit', (workflow) => {
    const work = pushCheckout();
    runStep(work, extractStepScript(workflow));
    expect(git(work, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
    expect(git(work, 'rev-parse', 'main')).toBe(second);
    expect(git(work, 'rev-parse', 'refs/remotes/origin/main')).toBe(second);
  });

  it.each(WORKFLOWS)('%s: creates main from origin/main on a pull request without a local main', (workflow) => {
    const work = pullRequestCheckout('absent');
    runStep(work, extractStepScript(workflow));
    expect(git(work, 'rev-parse', 'main')).toBe(second);
    expect(git(work, 'rev-parse', 'HEAD')).toBe(second);
  });

  it.each(WORKFLOWS)('%s: refreshes a stale local main on a pull request', (workflow) => {
    const work = pullRequestCheckout('stale');
    runStep(work, extractStepScript(workflow));
    expect(git(work, 'rev-parse', 'main')).toBe(second);
  });
});
