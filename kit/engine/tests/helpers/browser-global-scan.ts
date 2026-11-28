// The browser-global scan of the smoke test, as a pure function so it can be
// tested with a stand-in file list. Three Views files may name browser
// globals; every other source file is scanned.

/** The only paths allowed to name a browser global. Exact paths: no directory, pattern or prefix. */
export const BROWSER_GLOBAL_ALLOWLIST: readonly string[] = [
  "src/views/canvas-adapter.ts",
  "src/views/input-binding.ts",
  "src/views/mount.ts",
];

export const BROWSER_GLOBAL_PATTERN = /\b(window|document|HTMLCanvasElement)\b/;

/**
 * `files` maps a path as the glob gives it (for example
 * "../src/views/mount.ts") to its text. Returns plain-worded problems: first
 * one for each allowlisted path that has no file, then one for each
 * non-allowlisted file that names a browser global. An empty list means the
 * scan passed.
 */
export function checkBrowserGlobals(
  files: Record<string, string>,
  allowlist: readonly string[],
): string[] {
  const cleaned = new Map<string, string>();
  for (const [path, text] of Object.entries(files)) {
    cleaned.set(path.replace(/^(\.\.\/)+/, ""), text);
  }
  const problems: string[] = [];
  for (const allowed of allowlist) {
    if (!cleaned.has(allowed)) {
      problems.push(
        `The allowlisted path "${allowed}" does not exist under kit/engine/src, so the allowlist is out of date.`,
      );
    }
  }
  for (const [path, text] of cleaned) {
    if (allowlist.includes(path)) continue;
    if (BROWSER_GLOBAL_PATTERN.test(text)) problems.push(`${path} mentions a browser global`);
  }
  return problems;
}
