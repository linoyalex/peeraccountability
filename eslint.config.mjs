import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // docs/BUILD.md §4: "ESLint strict flat config, no-explicit-any: error"
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // `vercel build` output — generated bundles, not source. Without this, debugging a
    // deployment locally leaves artifacts that fail the lint gate in CLAUDE.md.
    ".vercel/**",
    // Local state from the "remember" Claude Code plugin — not part of this project.
    ".remember/**",
  ]),
]);

export default eslintConfig;
