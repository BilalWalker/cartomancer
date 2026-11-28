import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJson(name: string): Record<string, unknown> {
  const url = new URL(`../${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

function readText(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

describe("demo page layout", () => {
  const html = readText("index.html");
  const css = readText("src/demo.css");

  it("states that the page is a demonstration and not an application", () => {
    expect(html).toContain("demonstration of the map views and not an");
    expect(html).toContain("application");
  });

  it("has three canvases, a map choice, a speed control and a status area", () => {
    expect(html.match(/<canvas /g)?.length).toBe(3);
    expect(html).toContain('id="map-choice"');
    expect(html).toContain('id="speed-input"');
    expect(html).toContain('id="status-guidance"');
  });

  it("gives every control a text label", () => {
    expect(html).toContain('<label for="map-choice">');
    expect(html).toContain('<label for="speed-input">');
    expect(html.match(/<canvas [^>]*aria-label="[^"]+"/g)?.length).toBe(3);
  });

  it("sets a 44 px minimum size for controls and a visible focus rule", () => {
    expect(css).toMatch(/min-width:\s*44px/);
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/:focus-visible[\s\S]*outline:\s*3px solid/);
  });

  it("keeps canvases 300 to 375 px wide in one column and avoids horizontal scroll", () => {
    expect(css).toMatch(/min-width:\s*300px/);
    expect(css).toMatch(/max-width:\s*375px/);
    expect(css).toMatch(/grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/overflow-x:\s*hidden/);
  });

  it("has a labelled tilt slider from 20 to 70, step 1, default 35", () => {
    expect(html).toContain('<label for="tilt-input">Tilt angle</label>');
    expect(html).toMatch(/<input id="tilt-input" type="range" min="20" max="70" step="1" value="35"/);
    expect(html).toContain('id="tilt-value"');
    expect(html).toContain("35 degrees");
  });

  it("gives the tilt slider a 44 px height and keeps it inside the page width", () => {
    expect(css).toMatch(/input\[type="range"\][^}]*min-height:\s*44px/);
    expect(css).toMatch(/input\[type="range"\][^}]*min-width:\s*0/);
    expect(css).toMatch(/input\[type="range"\][^}]*max-width:\s*100%/);
  });

  it("shows three columns from 1200 px", () => {
    expect(css).toMatch(/@media \(min-width:\s*1200px\)/);
    expect(css).toMatch(/repeat\(3,/);
  });
});

describe("demo start instructions", () => {
  const readme = readText("README.md");
  const config = readText("vite.config.ts");

  it("README states the start command and the address", () => {
    expect(readme).toContain("npm run dev");
    expect(readme).toContain("kit/demo");
    expect(readme).toContain("http://localhost:5173/");
  });

  it("vite config fixes port 5173 with strictPort", () => {
    expect(config).toMatch(/port:\s*5173/);
    expect(config).toMatch(/strictPort:\s*true/);
  });
});

describe("demo package scaffold", () => {
  it("has no dependencies field", () => {
    const pkg = readJson("package.json");
    expect("dependencies" in pkg).toBe(false);
  });

  it("has strict mode on", () => {
    const tsconfig = readJson("tsconfig.json") as {
      compilerOptions: { strict?: boolean };
    };
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });
});
