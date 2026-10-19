---
name: bugfix
description: Investigate and correct validated defects at conditional Stage 9, then rerun testing and validation without uncontrolled scope expansion.
---

# Bugfix

## Preconditions
Read `AGENTS.md`, `docs/engineering/DEVELOPMENT_WORKFLOW.md`, and the applicable protocol(s) in `docs/engineering/references/`. Confirm this is the active stage and prior gates are satisfied. If prerequisites are missing, stop and ask.

## Procedure
1. Confirm failure evidence, `BUG-*` ID and lifecycle status, linked `AC-*`/`TEST-*`, current approved plan and whether the fix fits existing authorization; revalidate approval and request approval for new scope or risk.
2. Reproduce where possible; distinguish root cause from hypothesis; identify minimal affected components and regression exposure.
3. Implement a bounded fix only with appropriate authorization; preserve unrelated changes and record actual diffs.
4. Add or update a regression test for the defect when feasible and authorized; otherwise explain the gap.
5. Mark implemented fixes `FIXED` (not `VERIFIED`); rerun affected checks plus required broader regression, then transition to Stage 7 and Stage 8 for evidence-based `RETESTING → VERIFIED → CLOSED`. Do not self-certify completion.
6. If failures persist, keep the defect open and present evidence and next decision rather than repeating speculative edits.

## Output and exit
Provide the stage deliverable, evidence labels and paths, uncertainties, status, and exact next approval or action. Apply the workflow's stage transition; never infer approval.
