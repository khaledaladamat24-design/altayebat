---
name: Replit checkpoint commits bypass the husky format hook
description: Why CI format:check keeps failing on commits that pass everything locally, and the one-step fix.
---

# CI `format:check` fails on checkpoint commits even when local tests pass

The repo's husky `pre-commit` hook runs `lint-staged` (prettier --write on
staged files) so normal `git commit`s are auto-formatted. **But the Replit
checkpoint/auto-commit path does NOT run the husky hook** — so any edit that
isn't already prettier-clean is committed as-is and then fails the CI
`format:check` step (`prettier --check .`), showing a red ❌ on the GitHub
"Checks" run.

**Why this is sneaky:** typecheck, lint, and the test suites can all pass
locally and in the Replit workflows, so the failure looks "transient." It is
not — it's a formatting drift that only the CI `format:check` gate catches.

**How to apply:** After ANY file edit (especially hand-written TS/MD), run
`pnpm run format:check` and, if it warns, `pnpm prettier --write <file>` (or the
whole repo) before considering the task done. Do this even when every test
passes — `format:check` is the first CI step and a single unformatted file fails
the entire run. Do not dismiss a red CI run as a flake until format:check has
been reproduced locally.
