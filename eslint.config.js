import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [
    "dist",
    ".cache",
    ".venv-mineru",
    "node_modules",
    "coverage",
    "playwright-report",
    "test-results",
    "tmp",
    "android/app/build",
    "android/app/src/main/assets/public",
    "public/rag/runtime"
  ] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: { tsconfigRootDir: import.meta.dirname },
      globals: globals.browser
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  }
);
