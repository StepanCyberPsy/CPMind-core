---
name: testing
description: Design or execute planned intermediate and final verification at Stage 7, recording real test outcomes and defects.
---

# Testing

## Preconditions
Read `AGENTS.md`, `docs/engineering/DEVELOPMENT_WORKFLOW.md`, and the applicable protocol(s) in `docs/engineering/references/`. Confirm this is the active stage and prior gates are satisfied. If prerequisites are missing, stop and ask.

## Procedure
1. Read approved plan and verification protocol; determine whether this is an intermediate layer checkpoint or final test cycle.
2. Build or update the mandatory AC → TEST → executed result/evidence → BUG → retest traceability matrix for each applicable criterion, including relevant negative/regression scenarios; mark stale results explicitly.
3. Create or modify test components only when authorized by the approved plan or bugfix scope; otherwise propose missing tests and request approval.
4. Run available checks in the proper environment, capturing commands, exit codes, revisions and artifacts; never invent pass results.
5. Classify `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` (and `STALE` for outdated evidence); create `BUG-*` records for confirmed defects, triage severity and advance the documented defect lifecycle without prematurely marking fixes verified; distinguish test/env/tool problems.
6. Present a traceable test matrix and unresolved gaps; hand off to Stage 8 for assessment. Do not silently fix code during testing.

## Output and exit
Provide the stage deliverable, evidence labels and paths, uncertainties, status, and exact next approval or action. Apply the workflow's stage transition; never infer approval.
