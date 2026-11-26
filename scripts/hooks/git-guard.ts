// Kiro hook runner (Pre Tool Use, shell): blocks git commands that break
// .kiro/steering/commit-rules.md. Exit 0 lets the command run; exit 2 blocks it and the
// reasons on stderr go back to the agent. Runs on plain Node: `node scripts/hooks/git-guard.ts`.
import { readFileSync } from 'node:fs';
import { gitViolations, parseHookInput, shellCommandsOf } from './lib.ts';

let stdin = '';
try {
  stdin = readFileSync(0, 'utf8');
} catch {
  // No stdin: nothing to check.
}
const commands = shellCommandsOf(parseHookInput(stdin));
const problems = [...new Set(commands.flatMap((c) => gitViolations(c)))];
if (problems.length > 0) {
  process.stderr.write(`Blocked by .kiro/hooks/git-guard.json:\n${problems.map((p) => `- ${p}`).join('\n')}\n`);
  process.exit(2);
}
