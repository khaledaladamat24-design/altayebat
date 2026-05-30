---
name: Task cascade control
description: How the auto follow-up task chain behaves and what the main agent can/can't do about it
---

This project ran a long auto follow-up cascade: each merged task agent proposes 1-2 new
follow-up tasks, so the queue **never self-terminates**.

Key behavior observed:
- Only **accepted** tasks (state PENDING or IN_PROGRESS) actually run. A PENDING task is
  already committed to run (often "BLOCKED BY CONCURRENCY_LIMIT" until a slot frees).
- **PROPOSED** tasks stay dormant and do NOT run unless activated (old proposals can sit
  PROPOSED indefinitely).
- The main agent has **no tool to cancel/decline a queued task**. `project_tasks` skill only
  exposes `updateProjectTask` (edit content) and `markFollowUpTaskObsolete` (only for
  follow-ups *you* proposed). So you cannot stop already-accepted PENDING/IN_PROGRESS tasks.

**How to apply:**
- To truly stop the chain, the user must dismiss/cancel pending+proposed tasks in the UI.
  Set this expectation honestly rather than implying you can halt it.
- "Are we done?" → check states via `listProjectTasks()`; done only when no IN_PROGRESS/
  PENDING remain. Don't promise a clean empty queue you can't deliver.
