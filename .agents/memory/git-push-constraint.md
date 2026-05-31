---
name: Git push constraint (main agent)
description: Main agent cannot push/fetch/commit; user pushes manually
---

# Main agent cannot git push/fetch/commit

In this environment the bash sandbox blocks `git commit`, `git push`, and even `git fetch` as "destructive git operations" (error mentions `.git/objects/tmp_obj_...`). Read-only git (`git --no-optional-locks status/log`) works.

**Why:** platform safety — commits are made automatically as checkpoints at loop end; destructive git must go through a Project Task.

**How to apply:** to get local commits onto GitHub (e.g. to trigger the Android CI workflow), the **user must push via the Replit Git pane**. Do not promise to push yourself. After the user pushes, the `Build Android App` workflow runs (it triggers on push to main touching `artifacts/al-tayebat/**`, `lib/**`, or `.github/workflows/main.yml`, and on manual `workflow_dispatch`).
