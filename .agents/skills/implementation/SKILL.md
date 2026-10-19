---
name: implementation
description: Implement an explicitly approved Stage 5 plan in controlled layers at Stage 6, with checkpoint verification and stop conditions.
---

# Implementation

## Preconditions
Read `AGENTS.md`, `docs/engineering/DEVELOPMENT_WORKFLOW.md`, and the applicable protocol(s) in `docs/engineering/references/`. Confirm this is the active stage and prior gates are satisfied. If prerequisites are missing, stop and ask.

## Procedure
1. Apply the approval revalidation procedure to plan ID/revision, provenance, baseline drift, authorized scope, layer dependencies and current worktree before editing and at checkpoints; on resume reconcile actual diffs, stale tests and session state under Change Control.
2. Implement only the current layer's smallest coherent changes, preserving unrelated work and established code conventions.
3. Trace modified callers, data contracts, error paths, security boundaries and observability as applicable; add planned tests with behavior changes.
4. Inspect diffs and run every scheduled intermediate check. Record exact commands, results and `TEST-*`/`BUG-*` references.
5. For checkpoint testing use the workflow's bounded Stage 7/8 loop; failed checks block the next layer and route to authorized Stage 9 fixes.
6. Stop for scope, architecture, compatibility or risk deviations; propose a plan revision rather than improvising.
7. At each layer report changed paths, verification and next checkpoint; obey its approval policy. After all layers, proceed to final Stage 7, never skip it.

## Output and exit
Provide the stage deliverable, evidence labels and paths, uncertainties, status, and exact next approval or action. Apply the workflow's stage transition; never infer approval.
