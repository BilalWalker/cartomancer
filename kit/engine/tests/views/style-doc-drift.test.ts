import { describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE,
  STYLE_COLOR_FIELDS,
  STYLE_COLOR_KEYS,
  STYLE_LINE_FIELDS,
  STYLE_LINE_KEYS,
  type LineStyle,
} from "../../src/views/style.js";

// The format document is read as raw text through Vite's glob import.
const docs = import.meta.glob("../../docs/map-file-format.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const docText = docs["../../docs/map-file-format.md"] as string;

/** Cuts out the Style section: from `## Style` to the next `## ` heading or the end. */
function styleSection(text: string): string {
  const start = text.indexOf("\n## Style");
  if (start < 0) return "";
  const rest = text.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Rows of the table under the heading, as cells without backticks. */
function tableRows(section: string, heading: string): string[][] {
  const at = section.indexOf(heading);
  if (at < 0) return [];
  const lines = section.slice(at + heading.length).split("\n");
  const rows: string[][] = [];
  let started = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("|")) {
      if (started) break;
      continue;
    }
    started = true;
    const cells = t
      .slice(1, t.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim().replace(/`/g, ""));
    rows.push(cells);
  }
  return rows.slice(2); // header and separator
}

function readPath(style: unknown, path: string): unknown {
  let node = style as Record<string, unknown>;
  for (const part of path.split(".")) node = node[part] as Record<string, unknown>;
  return node;
}

function parseDash(text: string): number[] | undefined {
  return text === "none" ? undefined : text.split(",").map((s) => Number(s.trim()));
}

/** Returns a list of differences between the document text and DEFAULT_STYLE. */
function drift(text: string): string[] {
  const problems: string[] = [];
  const section = styleSection(text);
  const colours = tableRows(section, "### Colour keys");
  const lines = tableRows(section, "### Line style keys");

  const colourKeys = colours.map((r) => r[0]);
  if (JSON.stringify(colourKeys) !== JSON.stringify([...STYLE_COLOR_KEYS])) {
    problems.push("colour keys differ");
  }
  for (const [key, value] of colours) {
    const path = STYLE_COLOR_FIELDS[key!];
    if (path === undefined || readPath(DEFAULT_STYLE, path) !== value) {
      problems.push(`colour default differs for ${key}`);
    }
  }

  const lineKeys = lines.map((r) => r[0]);
  if (JSON.stringify(lineKeys) !== JSON.stringify([...STYLE_LINE_KEYS])) {
    problems.push("line style keys differ");
  }
  for (const [key, width, dash] of lines) {
    const path = STYLE_LINE_FIELDS[key!];
    if (path === undefined) {
      problems.push(`unknown line style key ${key}`);
      continue;
    }
    const style = readPath(DEFAULT_STYLE, path) as LineStyle;
    if (Number(width) !== style.widthPx) problems.push(`width differs for ${key}`);
    if (JSON.stringify(parseDash(dash!)) !== JSON.stringify(style.dash)) {
      problems.push(`dash differs for ${key}`);
    }
  }
  return problems;
}

describe("style tables in the format document", () => {
  it("has 21 colour rows and 11 line style rows", () => {
    const section = styleSection(docText);
    expect(tableRows(section, "### Colour keys")).toHaveLength(21);
    expect(tableRows(section, "### Line style keys")).toHaveLength(11);
  });

  it("matches DEFAULT_STYLE, STYLE_COLOR_KEYS and STYLE_LINE_KEYS", () => {
    expect(drift(docText)).toEqual([]);
  });

  it("fails when a documented default is changed (stand-in copy)", () => {
    const changed = docText.replace("`#f0ecdf`", "`#f0ecde`");
    expect(changed).not.toBe(docText);
    expect(drift(changed)).toContain("colour default differs for ground");
  });
});
