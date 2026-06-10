---
name: Post-merge port crash
description: Dev workflows crash on EADDRINUSE after each task merge; the fix
---

After almost every task-agent merge, the `artifacts/al-tayebat: web` and
`artifacts/api-server: API Server` dev workflows crash with a stale-port conflict
(EADDRINUSE) — the old process hasn't released the port when the merge restarts them.

**Fix:** `restart_workflow` on both. They come back healthy (splash screen renders, API
serves). This is routine after merges, not a real regression.

**How to apply:** when system_log_status shows either workflow FAILED right after a merge,
restart both rather than debugging — it's the stale-port race, not a code bug.
