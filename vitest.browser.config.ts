import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/mobile-suggestion.browser.spec.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ contextOptions: { hasTouch: true, isMobile: true } }),
      viewport: { width: 390, height: 844 },
      instances: [{ browser: "chromium" }, { browser: "webkit" }],
      commands: {
        tapSuggestion: async (context, name: string) => {
          if (context.provider.name !== "playwright") {
            throw new Error("Touch test requires Playwright.");
          }
          await context.iframe.getByRole("option", { name, exact: true }).tap();
        },
      },
    },
  },
});
