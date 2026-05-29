import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    // Mirrors .prettierignore plus vendored/generated code we do not lint.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out-tsc/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      // Orval-generated API client + Zod schemas
      "lib/api-client-react/src/generated/**",
      "lib/api-zod/src/generated/**",
      // Android native shell
      "artifacts/al-tayebat/android/**",
      // Design-only sandbox: vendored shadcn/ui components, not product code
      "artifacts/mockup-sandbox/**",
      // Vendored Replit AI integration blueprint code (not hand-authored)
      "lib/integrations-openai-ai-react/**",
      "lib/integrations-openai-ai-server/**",
      "lib/integrations/**",
      // Replit-local dirs
      ".local/**",
      ".cache/**",
      ".config/**",
      "attached_assets/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Intentional best-effort error swallowing is allowed (empty catch only).
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Advisory, not blocking: existing app code uses `any` in places. Surfaced
      // as a warning so new uses are visible without failing the gate.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // React hooks rules for the frontend.
  {
    files: ["artifacts/al-tayebat/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // API server runtime: no stray console.log (warn/error allowed). Use the
  // request logger / singleton logger instead. CLI scripts may use console.
  {
    files: ["artifacts/api-server/src/**/*.ts"],
    ignores: ["artifacts/api-server/src/**/__tests__/**"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  // Tests can be looser.
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
