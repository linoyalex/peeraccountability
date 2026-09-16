import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No test files exist yet — that starts at Part 6 with streak.ts. Without this, `vitest run`
    // exits 1 on "no test files found," which would read as a false failure until then.
    passWithNoTests: true,
  },
});
