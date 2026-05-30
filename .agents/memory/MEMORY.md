# Memory Index

- [Git push vs merge-pipeline lock](git-push-merge-pipeline.md) — the "update_ref failed / Another git process" error after `git push` is harmless; remote still updates, verify with ls-remote, never delete the lock.
- [Task cascade control](task-cascade-control.md) — auto follow-up tasks never self-terminate; main agent has no cancel tool; only PENDING/IN_PROGRESS run, PROPOSED stay dormant.
- [Post-merge port crash](post-merge-port-crash.md) — web + api-server dev workflows crash EADDRINUSE after each task merge; fix is restart_workflow on both.
- [CI format:check failures](ci-format-check.md) — merges/auto-commits bypass husky prettier hook; "Checks" CI fails on format:check though lint/typecheck/tests pass. Run `pnpm run format` before pushing.
