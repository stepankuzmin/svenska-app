import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**", "scripts/*.ts"],
      exclude: ["src/generated/**", "src/vite-env.d.ts"],
      reporter: ["text-summary", "lcov"],
      // Ratchet: today's values less 0.5 points of drift. See CONSTRAINTS.md.
      thresholds: {
        lines: 44.9,
        statements: 44.4,
        branches: 41.7,
        functions: 37.6,
      },
    },
  },
});
