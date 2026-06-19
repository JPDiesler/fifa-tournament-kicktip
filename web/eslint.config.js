import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";

// Flat config for the React app. Focus: catch real bugs (hook rules), dead imports and
// unused vars. Formatting is left to Prettier. React 19 automatic JSX runtime → no React
// import needed. exhaustive-deps stays a warning (some effect deps are intentional).
export default [
  { ignores: ["dist/**", "public/**", "src/assets/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, "unused-imports": unusedImports },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }], // `try { … } catch {}` = deliberate swallow
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["warn", { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}", "*.config.js", "vite.config.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.node } },
  },
];
