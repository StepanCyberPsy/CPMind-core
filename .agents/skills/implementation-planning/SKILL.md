---
name: implementation-planning
description: Create a revision-bound, testable layered implementation plan at workflow Stage 5 and obtain explicit user approval before any code edits.
---

# Implementation Planning

## Preconditions
Read `AGENTS.md`, `docs/engineering/DEVELOPMENT_WORKFLOW.md`, and the applicable protocol(s) in `docs/engineering/references/`. Confirm this is the active stage and prior gates are satisfied. If prerequisites are missing, stop and ask.

## Procedure
1. Confirm approved Stage 4 proposal and repository baseline; inspect verification and change-control protocols.
2. Create `plan_id` and revision with scope, exact expected paths (mark forecasts), interfaces, invariants, dependencies and risk mitigations.
3. Decompose into ordered layers with prerequisites, expected diffs, acceptance criteria, intermediate test commands or procedures, and user checkpoints.
4. Specify final AC → TEST → expected evidence → potential BUG traceability matrix including regression, security/performance checks where risk warrants; list unavailable environments, test fixtures and rollback/recovery strategy.
5. Establish failure handling, open decisions and context/journaling rules; no fabricated commands or guarantees.
6. Present complete plan and request **explicit approval of this revision**. Do not modify source, tests or infrastructure before approval.

## Output and exit
Provide the stage deliverable, evidence labels and paths, uncertainties, status, and exact next approval or action. Apply the workflow's stage transition; never infer approval.
