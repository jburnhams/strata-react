import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two projects. `unit`: components in jsdom with Testing Library, the network served by MSW
// (tests/utils/server.ts), never module mocks. `integration`: the built package in Node: its
// exports, its CSS compiled by Tailwind as an app would, and the namespace reset.
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/utils/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.{ts,tsx}"],
          testTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**"],
    },
  },
});
