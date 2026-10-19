# Session Records

Session records are optional until the user grants one-time journaling permission. Once authorized, the agent may maintain `TASK.md`, `IMPLEMENTATION_PLAN.md`, and `SESSION_STATE.md` inside a session-specific directory. Session files are records, not approval authority on their own; reconcile them with conversation evidence and Git before resuming. Do not store secrets. Never update `PROJECT_CONTEXT.md` without a separate explicit request.

Use `templates/` as examples, not as automatic permission to write files. A session ID must be unique and stable for the task; avoid treating calendar date as sufficient uniqueness.

## Session index

- [2026-10-19 — Frontend and banner measurement](2026-10-19-frontend-banner-ux/HANDOFF.md): local implementation, changed-file inventory, verification evidence, acceptance limitations, and release boundaries.
- [Historical handoffs](archive/): prior-session context; not an automatically authorized backlog.
