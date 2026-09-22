import { defineConfig } from "vitest/config";

const updatesBaselines =
  process.argv.includes("--update") ||
  process.argv.includes("-u") ||
  process.env["MD2_UPDATE_VISUAL_BASELINES"] === "1";

export default defineConfig({
  test: {
    environment: "node",
    env: { MD2_UPDATE_VISUAL_BASELINES: updatesBaselines ? "1" : "0" },
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/types/**", "src/index.ts"],
      thresholds: {
        lines: 85,
        branches: 85,
        functions: 85,
        statements: 85,
        "src/units.ts": {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95,
        },
        "src/errors.ts": {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95,
        },
        "src/theme/schema.ts": {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95,
        },
      },
    },
  },
});
