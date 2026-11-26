// Run with: node --test scripts/hooks/
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { forbiddenPaths, lintCommitMessage } from './lib.ts';

const GOOD = 'Engine: add thing\n\nWhy it was needed and how it was verified.';

test('accepts a good message, also with a multi-word area', () => {
  assert.deepEqual(lintCommitMessage(GOOD), []);
  assert.deepEqual(lintCommitMessage('Engine tests: add case\n\nBody.'), []);
});

const bad: Array<[string, string]> = [
  ['no area', 'add thing\n\nBody.'],
  ['subject over 72 characters', `Engine: ${'x'.repeat(70)}\n\nBody.`],
  ['missing body', 'Engine: add thing'],
  ['no blank second line', 'Engine: add thing\nBody.'],
  ['attribution trailer', `${GOOD}\n\nCo-Authored-By: Someone <a@b.c>`],
  ['generated-by line', `${GOOD}\n\nGenerated with a tool`],
  ['emoji', 'Engine: add thing \u{1F680}\n\nBody.'],
  ['BOM', `\uFEFF${GOOD}`],
];
for (const [name, message] of bad) {
  test(`flags: ${name}`, () => assert.notDeepEqual(lintCommitMessage(message), []));
}

test('forbiddenPaths flags node_modules, dist and .work only', () => {
  assert.deepEqual(
    forbiddenPaths(['node_modules/a.js', 'kit/engine/node_modules/b.js', 'dist/x.js', '.work/y', 'kit\\engine\\dist\\z.js']),
    ['node_modules/a.js', 'kit/engine/node_modules/b.js', 'dist/x.js', '.work/y', 'kit\\engine\\dist\\z.js'],
  );
  assert.deepEqual(forbiddenPaths(['kit/engine/src/dist.ts', 'docs/node_modules.md', 'distance/a.ts', 'out/a.js']), []);
});

// The runner against a throwaway repository.
const runner = resolve('scripts/hooks/after-task.ts');

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hygiene-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'a.txt'), 'a');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'Docs: add a', '-m', 'Why and how verified.');
  return dir;
}

function runHook(dir: string) {
  return spawnSync('node', [runner], { cwd: dir, encoding: 'utf8' });
}

test('runner exits 0 on a clean repository', () => {
  const dir = makeRepo();
  try {
    const r = runHook(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no problems/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runner exits 1 when a commit message has no body', () => {
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, 'b.txt'), 'b');
    execFileSync('git', ['-C', dir, 'add', 'b.txt']);
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'Docs: add b']);
    const r = runHook(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /body is missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runner exits 1 when a file under node_modules is staged', () => {
  const dir = makeRepo();
  try {
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'x.js'), 'x');
    execFileSync('git', ['-C', dir, 'add', '-f', 'node_modules/x.js']);
    const r = runHook(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /staged: node_modules\/x\.js/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
