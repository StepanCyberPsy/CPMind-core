# Change Control Protocol

## Approved boundary
A plan identifies `plan_id`, `revision`, baseline commit/worktree state, authorized file areas, expected behaviors, external interfaces, layers/dependencies, checkpoint approvals, tests and recovery strategy. A file list is an impact forecast, not permission to ignore necessary dependencies: if newly discovered dependencies materially alter scope, stop and revise the plan.

## Before editing
Inspect `git status` and relevant diffs; distinguish user changes from agent changes. Do not reset, overwrite or remove unrelated work. Validate plan revision and checkpoint. Never assume a clean worktree.

## Per layer
Implement the smallest coherent diff; maintain compatibility and error handling; inspect actual diff and callers; execute scheduled checks; record results and defects. Do not mark a layer complete on failed mandatory checks. Prefer idempotent operations and safe retries; on partial completion inspect the repository before resuming, do not blindly replay steps.

## Deviation
Stop for material changes in architecture, API/schema/event contracts, security permissions, migrations, risk, dependencies or user-visible scope. Present impact and revised plan; require fresh approval. Small internal corrections within explicitly approved boundaries may proceed if planned tests and invariants still hold; document them.

## Recovery
Rollback must be explicitly scoped and authorized if it would remove user work or alter shared resources. Never claim transactional atomicity for filesystem edits or distributed operations; document partial-state recovery and irreversible effects.

## Session recovery and partial-state reconciliation
1. Identify the session/task and read its latest available state, plan and approval references; inspect `git status`, relevant `git diff`, current `HEAD`, tracked/untracked paths, dependency/config changes and available test artifacts. Do not execute queued changes while reconciling.
2. Compare recorded completed layers with actual diffs, tests and evidence at their recorded revisions. Mark each layer `CONFIRMED`, `PARTIAL`, `STALE`, or `UNKNOWN` with evidence. Do not infer completion from session text or commit existence alone.
3. If source, test inputs, dependencies, or relevant configuration changed after a check, mark its prior result `STALE` for the affected scope. Determine the smallest safe re-run set plus dependent integration/regression checks; never relabel historical results as current passes.
4. For a `PARTIAL` layer, identify already-applied edits, unapplied steps and conflicting user edits; resume from the first demonstrably incomplete safe action, never blindly replay commands. If attribution or recovery safety is uncertain, stop and ask.
5. If multiple session records exist, prefer the record explicitly tied to the active task and user-approved plan; reconcile all relevant revisions chronologically against actual repository evidence. On conflicting records, do not choose by timestamp alone: report conflicts and request a decision.
6. Revalidate plan approval under `APPROVAL_PROTOCOL.md`. Material repository drift, newly discovered dependencies, invalidated acceptance criteria or changed risk must return to the earliest affected workflow stage; obtain required re-approvals. Unchanged prerequisites remain valid and need not be repeated.
7. Record reconciled status, evidence, stale checks, open defects, pending gate and **one exact next safe action** in `SESSION_STATE.md` only if journaling is authorized. Never mutate `PROJECT_CONTEXT.md` during recovery.

## Recovery failure conditions
Stop without product edits when approval provenance is missing, the baseline cannot be reconciled, required files or evidence are inaccessible, unrelated edits would be overwritten, or recovery requires an unapproved destructive action. State the smallest information or permission needed to continue.
