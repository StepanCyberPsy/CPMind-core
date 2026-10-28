# Session Records

Session records are optional until the user grants one-time journaling permission. Once authorized, the agent may maintain `TASK.md`, `IMPLEMENTATION_PLAN.md`, and `SESSION_STATE.md` inside a session-specific directory. Session files are records, not approval authority on their own; reconcile them with conversation evidence and Git before resuming. Do not store secrets. Never update `PROJECT_CONTEXT.md` without a separate explicit request.

Use `templates/` as examples, not as automatic permission to write files. A session ID must be unique and stable for the task; avoid treating calendar date as sufficient uniqueness.

## Session index

- [2026-10-28 — VAST delivery with OMID verification](2026-10-28-vast-omid-measurement/HANDOFF.md): measurement of video impressions without publisher-side code, both client VAST scenarios, the new `@cpmind/omid` package, two unapplied migrations, 247 passing tests, and the limits of the delivered capability — full S1–S7 depends on the access level the publisher's player grants, and nothing was verified against a real player.
- [2026-10-19 — Frontend, banner measurement, and signal calibration](2026-10-19-frontend-banner-ux/HANDOFF.md): current S2 restoration and S3 banner grouping/training, 91 passing tests, pending-change inventory, and earlier phases preserved with their verification and release limitations.
- [Historical handoffs](archive/): prior-session context; not an automatically authorized backlog.
