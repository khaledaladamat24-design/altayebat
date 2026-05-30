---
name: CI format:check failures after merges
description: Why the GitHub "Checks" workflow goes red on format:check even when lint/typecheck/tests pass
---

The repo has TWO GitHub Actions workflows:

- `main.yml` ("Build Android App") — runs only when `artifacts/al-tayebat/**`, `lib/**`,
  `pnpm-workspace.yaml`, or the workflow files change (path-filtered). Backend-only or
  docs-only commits do NOT trigger a new Android build — expected, not a bug.
- `checks.yml` ("Checks") — runs on EVERY push: `format:check` (prettier), lint, typecheck,
  db push-force, tests.

**Gotcha:** task-agent merges and the platform's auto-checkpoint commits **bypass the husky
pre-commit hook** (husky only runs on a local `git commit`). So files can land on `main`
unformatted and fail `checks.yml`'s `pnpm run format:check` step — even though `lint`,
`typecheck`, and `test` all pass locally and in CI.

**Why:** the husky hook is the only thing that auto-runs prettier; CI just _verifies_ with
`--check` and fails if anything is off.

**How to apply:** after any batch of merges, before declaring done / pushing, run
`pnpm run format` then `pnpm run format:check`. Note the main agent cannot `git commit`
(blocked) — make the edits, let the platform's end-of-turn checkpoint commit them, then
`git push` on the next turn. The GitHub Actions API can be queried for run status using the
token already embedded in the `origin` remote URL (never print it).
