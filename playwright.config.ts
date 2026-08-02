import { env } from "node:process";
import { defineConfig } from "playwright/test";
import { responsiveProjects } from "./e2e/fixtures/viewports";

const e2ePort = Number(env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./output/playwright/test-results",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  reporter: "list",
  // Keep local WebKit rendering and the shared Vite fixture server deterministic across the two E2E spec files.
  workers: 4,
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: "retain-on-failure"
  },
  webServer: {
    command: `npm run dev -- --port ${e2ePort}`,
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_BOOKCOURSE_API_BASE_URL: `http://127.0.0.1:${e2ePort}`,
      VITE_BOOKCOURSE_USER_ID: "responsive_fixture_user"
    }
  },
  projects: responsiveProjects.map((project) => ({
    name: project.name,
    use: {
      browserName: "webkit",
      viewport: project.initialViewport
    }
  }))
});
