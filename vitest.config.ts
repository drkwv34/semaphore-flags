import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "contract",
          include: ["test/contract/**/*.test.ts"],
        },
      },
    ],
  },
});
