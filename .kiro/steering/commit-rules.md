---
inclusion: always
---

# Commit rules

- One logical change per commit.
- Subject format: `Area: what changed`, at most 72 characters.
- Body says why the change was made and how it was verified.
- Wrap commit bodies at 72 characters.
- No attribution lines of any kind (no co-author or generated-by trailers).
- Stage by path (`git add <path>`), never `git add -A` or `git add .`.
- Never push.
- All commits go on branch `wip/build` only. Never switch branches and never touch `main` (no checkout, switch, merge, rebase or branch changes); the reviewer lands commits on `main`.
- Never use `git reset` in any form. Fix staging mistakes with `git restore --staged <path>`.
- Report at each checkpoint: real `git status` output, the commit list, test results with time, measured speeds, and anything not done or not verified, said plainly. Do not report credit figures.

## Small tasks, frequent commits
- Keep tasks small. A task that would touch more than a few files or take more than one sitting must be split into smaller tasks.
- Every task ends with its own commit as soon as its tests pass.
- A task that still grows is committed in several working steps, not in one commit.
- Never put several tasks in one commit.
- Every commit must build and pass the default suite.
