// Run with: node --test scripts/hooks/
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { gitViolations } from './lib.ts';

const blocked = [
  'git push',
  'git push origin main',
  'git add -A',
  'git add .',
  'git add -u',
  'git -C kit add --all',
  'git commit -a -m "x"',
  'git commit --amend',
  'git commit --no-verify -m "x"',
  'git rebase main',
  'git clean -fd',
  'git reset',
  'git reset --soft HEAD~1',
  'git reset --mixed HEAD~1',
  'git reset --hard HEAD~1',
  'git reset HEAD docs/brief.md',
  'git reset -- docs/brief.md',
  'git -C kit reset',
  'git -c core.x=y reset --soft HEAD~1',
  'git status && git reset HEAD x',
  'git status; git reset --hard',
  '& git reset',
  'git status; git push',
  '& git push',
];

const allowed = [
  'git status --short',
  'git add docs/brief.md',
  'git add scripts/hooks/lib.ts scripts/hooks/git-guard.ts',
  'git commit -m "Hooks: add thing" -m "Body mentions git push and git add . as words."',
  'git log --format=%h_%s',
  'git restore --staged docs/brief.md',
  'git status',
  'git log --grep reset',
  'git commit -m "Hooks: x" -m "Body says git reset is blocked."',
  'echo git reset',
  'git diff --cached --name-only',
  'echo git push',
  'npm run test',
];

for (const command of blocked) {
  test(`blocks: ${command}`, () => assert.notDeepEqual(gitViolations(command), []));
}
for (const command of allowed) {
  test(`allows: ${command}`, () => assert.deepEqual(gitViolations(command), []));
}

function runHook(command: string) {
  return spawnSync('node', ['scripts/hooks/git-guard.ts'], {
    input: JSON.stringify({ tool_name: 'shell', tool_input: { command } }),
    encoding: 'utf8',
  });
}

test('runner exits 2 and explains on stderr for git push', () => {
  const r = runHook('git push');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /git push is not allowed/);
});

test('runner exits 0 for a commit on main with a plain command', () => {
  assert.equal(runHook('git commit -m "Docs: x" -m "why"').status, 0);
});

test('runner exits 0 on empty input', () => {
  const r = spawnSync('node', ['scripts/hooks/git-guard.ts'], { input: '', encoding: 'utf8' });
  assert.equal(r.status, 0);
});
