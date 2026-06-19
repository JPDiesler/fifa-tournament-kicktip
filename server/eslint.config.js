import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";

// Flat config for the Node/ESM backend. Focus: dead imports + unused vars; formatting is
// left untouched. Empty `catch {}` is a deliberate swallow used throughout.
export default [
  { ignores: ["node_modules/**", "public/**", "data/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } },
    plugins: { "unused-imports": unusedImports },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["warn", { vars: "all", varsIgnorePattern: "^_", args: "none" }],
    },
  },
];
