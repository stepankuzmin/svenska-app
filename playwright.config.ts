import { defineConfig, devices } from "@playwright/test";

// Touch behaviour needs a coarse pointer, so it runs on the phone profiles only
// and the desktop profiles skip it.
const chromiumLaunch = { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH };
const touchSpec = "**/mobile-touch.spec.ts";
const deployedURL = process.env.SYNC_TEST_BASE_URL;

export default defineConfig({
  testDir: "./tests/browser",
  projects: [
    { name: "chromium", testIgnore: touchSpec, use: { ...devices["Desktop Chrome"], launchOptions: chromiumLaunch } },
    { name: "webkit", testIgnore: touchSpec, use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", testMatch: [touchSpec, "**/library-sync.spec.ts"], use: { ...devices["Pixel 7"], launchOptions: chromiumLaunch } },
    { name: "mobile-safari", testMatch: [touchSpec, "**/library-sync.spec.ts"], use: { ...devices["iPhone 13"] } },
  ],
  use: {
    baseURL: deployedURL ?? "http://127.0.0.1:4173/",
  },
  webServer: deployedURL ? undefined : {
    command: "npm run worker:dev",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
