---
inclusion: always
---

# Commit rules

- One logical change per commit.
- Subject format: `Area: what changed`, at most 72 characters.
- Body says why the change was made and how it was verified.
- No attribution lines of any kind (no co-author or generated-by trailers).
- Stage by path (`git add <path>`), never `git add -A` or `git add .`.
- Never push.
- Report at each checkpoint: real `git status` output, the commit list, test results with time, measured speeds, and anything not done or not verified, said plainly. Do not report credit figures.
