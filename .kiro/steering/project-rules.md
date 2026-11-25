---
inclusion: always
---

# Project rules

Full context is in #[[file:docs/brief.md]]. Where the brief and a Kiroween hackathon rule disagree, the rule wins.

## Stack and layout
- TypeScript (strict), Vite, Canvas 2D, Vitest with fast-check, Playwright for browser checks.
- `kit/engine/` has no runtime dependency. Its logic (everything except drawing) runs in Node and is tested without a browser.
- Everything is static files. MIT licence, `LICENSE` at the repository root.
- `.kiro/` in this repository is never git-ignored.

## Quality
- Never weaken tests to make them pass: no skipped tests, no raised time limits, no loosened thresholds. If something cannot be made to pass, report it.
- No silent wrong output. No route is better than a wrong route, and the player is told in plain words.
- Loading a map file that does not fit the format is an error with a plain message naming the problem, never a half-loaded map.
- Keep the default test suite under 60 seconds. Browser checks may be a separate command.
- Measure and report speed (route time and view frame time on a generated 5,000-road map), do not guess.

## Applications and content
- The engine knows nothing about cars, missions, hospitals or rooms. Applications do not change the engine. What an application needs and the engine lacks goes into the engine for both.
- Both applications are built from the kit's spec template.
- Everything is original. Do not copy or name any existing game or product (maps, names, characters, look) in the UI, docs or write-up. No real-world map data.
- Plain shapes and one palette file per application, so art can be swapped in later.
- Keyboard works everywhere. Works at 375 px width. Room Finder reaches WCAG AA contrast.

## Order of work
Blocks A (engine core), B (views, with a gate on the 5,000-road map), C (kit `.kiro/`), D (City Run), E (Room Finder), F (maker), G (landing page and docs). Stop after each checkpoint and report; the reviewer reruns the checks before the next block.

## Shell use
- Run one command per call. No multi-line scripts, no chains with `;` or `&&`, no pipes.
- Create and edit files with file tools, never with shell commands.
