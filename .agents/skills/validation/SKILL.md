---
name: validation
description: Evaluate evidence, engineering quality, acceptance criteria and remaining risk at Stage 8 after tests, including layer checkpoints.
---

# Validation

## Preconditions
Read `AGENTS.md`, `docs/engineering/DEVELOPMENT_WORKFLOW.md`, and the applicable protocol(s) in `docs/engineering/references/`. Confirm this is the active stage and prior gates are satisfied. If prerequisites are missing, stop and ask.

## Procedure
1. Determine validation scope: intermediate layer or final implementation. Inspect approved criteria, actual diffs, test matrix and defect records.
2. Execute the risk-based Engineering Review in `VERIFICATION_PROTOCOL.md`: assess each applicable domain with an invariant, evidence, result and residual risk, including architecture, business logic/error paths, security, data contracts, concurrency/recovery, compatibility, observability, performance and maintainability.
3. Identify missing tests, unsupported quality claims, regressions and unauthorized changes; distinguish verified findings from inference.
4. Produce the standard Stage 8 validation report with AC → TEST → result → BUG traceability, domain-by-domain engineering review, `PASS|FAIL|BLOCKED|NOT_RUN|STALE` gaps, defect lifecycle state, residual risks and a justified recommendation; never pass unsupported criteria.
5. For checkpoint PASS, return to Stage 6 only under the approved checkpoint policy. For failure, request authorized Stage 9 remediation; for final PASS, request user acceptance before `COMPLETED`.
6. Do not update project context automatically; at session closure remind user that synchronization requires an explicit request.

## Output and exit
Provide the stage deliverable, evidence labels and paths, uncertainties, status, and exact next approval or action. Apply the workflow's stage transition; never infer approval.
