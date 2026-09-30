import { env } from "node:process";
import { defineConfig } from "playwright/test";
import { responsiveProjects } from "./e2e/fixtures/viewports";

const e2ePort = Number(env.E2E_PORT ?? 4173);
const coreProjects = responsiveProjects.filter((project) => !project.name.startsWith("small-phone"));
const smallProjects = responsiveProjects.filter((project) => project.name.startsWith("small-phone"));
const existingDemoState = JSON.stringify({
  version: 1,
  preferences: { displayName: "小明同学", primaryGoal: null, dailyTime: null, completedAt: 1 },
  onboardingDraft: { displayName: "", primaryGoal: null, dailyTime: null, step: 0 },
  sets: [],
  resources: [],
  draft: null,
  activeSetId: null
});

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
    storageState: {
      cookies: [],
      origins: [{
        origin: `http://127.0.0.1:${e2ePort}`,
        localStorage: [{ name: "bookcourse.learning-sets.v1", value: existingDemoState }]
      }]
    },
    trace: "retain-on-failure"
  },
  webServer: {
    command: `npm run dev -- --port ${e2ePort}`,
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_BOOKCOURSE_API_BASE_URL: `http://127.0.0.1:${e2ePort}`,
      VITE_BOOKCOURSE_USER_ID: "responsive_fixture_user",
      // Keep E2E on the deterministic offline path even when a developer has
      // a personal BYOK value in the gitignored .env.local file.
      VITE_DEEPSEEK_API_KEY: " "
    }
  },
  projects: [
    ...coreProjects.map((project) => ({
      name: project.name,
      testIgnore: /device-preview\.spec\.ts/,
      use: {
        browserName: "webkit" as const,
        viewport: project.initialViewport
      }
    })),
    ...smallProjects.map((project) => ({
      name: project.name,
      testMatch: /responsive\.spec\.ts/,
      use: {
        browserName: "webkit" as const,
        viewport: project.initialViewport
      }
    })),
    {
      name: "device-preview-studio",
      testMatch: /device-preview\.spec\.ts/,
      use: {
        browserName: "webkit" as const,
        viewport: { width: 1440, height: 1200 }
      }
    }
  ]
});
