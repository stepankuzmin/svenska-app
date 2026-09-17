import { defineConfig, devices } from "@playwright/test";

// Touch behaviour needs a coarse pointer, so it runs on the phone profiles only
// and the desktop profiles skip it.
const touchSpec = "**/mobile-touch.spec.ts";

export default defineConfig({
  testDir: "./tests/browser",
  projects: [
    { name: "chromium", testIgnore: touchSpec, use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testIgnore: touchSpec, use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", testMatch: touchSpec, use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", testMatch: touchSpec, use: { ...devices["iPhone 13"] } },
  ],
  use: {
    baseURL: "http://127.0.0.1:4173/",
  },
  webServer: {
    command: "vite preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
