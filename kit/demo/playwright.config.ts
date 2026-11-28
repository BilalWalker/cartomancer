import { defineConfig } from "@playwright/test";

// Separate from the default suite: `npm run bench` and `npm run gate`.
export default defineConfig({
  testDir: "bench",
  testMatch: "*.spec.ts",
  // The benchmark measures four series on two maps in real time; allow it.
  timeout: 600_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
