---
name: Git push vs merge-pipeline lock
description: Why post-push git lock errors are harmless in this repo and how to verify a push really landed
---

After `git push origin main` succeeds, you often see:
`update_ref failed for ref 'refs/remotes/origin/main': cannot lock ref ... main.lock`
and/or "Another git process seems to be running".

**This is harmless.** The platform's task-merge pipeline runs its own concurrent git
process (committing merged task checkpoints), which holds `.git` locks. The push to the
**remote** still completes — only the local tracking-ref update is skipped.

**How to apply:**
- Never manually delete `.git/refs/.../*.lock` — a live pipeline process owns it.
- Verify the push actually landed by comparing HEADs:
  `git --no-optional-locks rev-parse HEAD` vs
  `git --no-optional-locks ls-remote origin -h refs/heads/main`. Equal = in sync.
- The GitHub remote URL contains the user's PAT in plaintext — always mask output with
  `sed -E 's#//[^@]*@#//***@#g'` and never print it.
- Read-only git commands need `--no-optional-locks` (plain `git status` is sandbox-blocked).
