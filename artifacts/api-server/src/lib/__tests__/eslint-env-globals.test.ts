import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ESLint } from "eslint";

// Repo root, five levels up from this file's __tests__ directory:
// __tests__ -> lib -> src -> api-server -> artifacts -> <root>
const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../..",
);

// `no-undef` is disabled for .ts/.tsx files by typescript-eslint's recommended
// config (TypeScript itself reports undefined identifiers). To assert that the
// per-environment `globals` blocks in eslint.config.mjs keep the browser and
// Node global sets separate, we layer `no-undef: error` on top of the real repo
// config via overrideConfig. The globals still come from the repo config's
// file-path-matched blocks, so this exercises the actual separation: if a future
// change re-merges the global sets, these assertions fail before release.
async function lint(filePath: string, code: string) {
  const eslint = new ESLint({
    cwd: repoRoot,
    overrideConfig: { rules: { "no-undef": "error" } },
  });
  const [result] = await eslint.lintText(code, {
    filePath: resolve(repoRoot, filePath),
  });
  return result.messages;
}

function hasNoUndef(
  messages: Awaited<ReturnType<typeof lint>>,
  global: string,
): boolean {
  return messages.some(
    (m) => m.ruleId === "no-undef" && m.message.includes(global),
  );
}

// These probe paths are never written to disk; they only steer ESLint config
// matching so we hit the frontend (browser globals) vs backend (Node globals)
// blocks in eslint.config.mjs.
const FRONTEND_PROBE = "artifacts/al-tayebat/src/__env_globals_probe__.ts";
const BACKEND_PROBE = "artifacts/api-server/src/__env_globals_probe__.ts";

describe("eslint per-environment globals", () => {
  it("flags a Node-only global (process) used in frontend code", async () => {
    const messages = await lint(
      FRONTEND_PROBE,
      "export const env = process.env.NODE_ENV;\n",
    );
    expect(hasNoUndef(messages, "process")).toBe(true);
  });

  it("flags a browser-only global (window) used in backend code", async () => {
    const messages = await lint(
      BACKEND_PROBE,
      "export const href = window.location.href;\n",
    );
    expect(hasNoUndef(messages, "window")).toBe(true);
  });

  it("does not flag the correct global in each environment", async () => {
    const frontend = await lint(
      FRONTEND_PROBE,
      "export const href = window.location.href;\n",
    );
    expect(hasNoUndef(frontend, "window")).toBe(false);

    const backend = await lint(
      BACKEND_PROBE,
      "export const env = process.env.NODE_ENV;\n",
    );
    expect(hasNoUndef(backend, "process")).toBe(false);
  });
});
