---
name: ESLint no-undef is off for TS files
description: Why per-environment globals blocks don't produce no-undef errors on .ts/.tsx, and how to test them.
---

`no-undef` is disabled for `.ts`/`.tsx` files in this repo because `tseslint.configs.recommended` (typescript-eslint's eslint-recommended) turns it off — TypeScript itself reports undefined identifiers.

**Consequence:** the per-environment `globals` blocks in `eslint.config.mjs` (browser globals for `artifacts/al-tayebat/src/**`, Node globals for `artifacts/api-server/src/**`) do NOT emit `no-undef` errors on product code, even though the global sets are correctly separated. The globals are resolved per file path, but the rule that would flag a wrong-place global is off.

**Do not** re-enable `no-undef` globally for TS to "make it work": it produces ~46 false positives across the codebase (`React` under the automatic JSX runtime, DOM type globals like `RequestInit`/`RequestInfo`/`HeadersInit`), breaking the `pnpm lint` gate.

**How to test the globals separation:** construct `new ESLint({ cwd: repoRoot, overrideConfig: { rules: { "no-undef": "error" } } })` and `lintText` with a `filePath` matching each environment. The globals still come from the repo config's file-path-matched blocks, so this verifies separation without touching the lint gate. See `artifacts/api-server/src/lib/__tests__/eslint-env-globals.test.ts`.
