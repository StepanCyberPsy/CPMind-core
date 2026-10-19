# Verification Protocol

## Design before implementation
For each acceptance criterion identify verification method, environment, expected result, negative/edge cases, regression surface, and evidence location. Use risk-based test selection: unit, integration, contract, e2e, static checks, migration, concurrency, load, security, accessibility, resilience, observability or AI evaluation as applicable. Do not mandate irrelevant checks.

## Execution
Intermediate checks are mandatory where the approved plan schedules them. Final verification is mandatory. For each check capture `test_id`, purpose, exact command/procedure, environment/revision, expected vs actual, exit code where applicable, evidence and status `PASS|FAIL|BLOCKED|NOT_RUN`. Do not invent successful runs or treat blocked as passed. Distinguish product defects, flaky tests, tooling errors and environment failures with evidence; uncertain classifications remain uncertain.

## Defect records
Each `BUG-*` includes severity, affected component, reproducible steps or missing reproduction, expected/actual, evidence, suspected vs verified root cause, owner/status, fix reference and retest outcome. Test cases use stable `TEST-*` IDs; local Markdown records are not external issue-tracker tickets unless created there with permission.

## Engineering review
Stage 8 reviews acceptance, architecture, maintainability, data contracts, authorization, error paths, performance/scaling assumptions, observability, backward compatibility, rollout/rollback and regression. Explicitly distinguish tested guarantees from untested risks. Load and security claims require relevant evidence; no universal 'enterprise-ready' claim from static checks alone.

## Failure loop
Failures must be reported, triaged and routed to Stage 9 for approved fixes, followed by Stage 7 and Stage 8. Checkpoint failures block the next implementation layer unless user approves a revised plan. Stop if required environments or permissions are missing.

## Acceptance-to-evidence traceability
Maintain a traceability matrix for every applicable `AC-*`: criterion and revision → `TEST-*` (or explicitly justified non-test evidence) → executed result/evidence → `BUG-*` if failed → retest/revalidation result. Include negative and regression cases where risk warrants. A criterion without sufficient verification is `BLOCKED` or `NOT_RUN`, never `PASS`. A test passing on an obsolete revision is `STALE` and cannot support current acceptance until revalidated. Preserve links between defect, regression test and original criterion across the Stage 9 → 7 → 8 loop.

## Defect lifecycle and closure
Use `OPEN → TRIAGED → IN_PROGRESS → FIXED → RETESTING → VERIFIED → CLOSED` for confirmed product defects. `BLOCKED`, `REOPENED`, and `DEFERRED` are additional explicit states with rationale. `FIXED` means a change was made, **not** that it works. `VERIFIED` requires successful reproduction-specific retest plus applicable regression evidence on the relevant revision; `CLOSED` requires validation of the linked acceptance criterion and an authorized closure decision under the workflow. A failing retest moves the defect to `REOPENED` and blocks acceptance when severity or acceptance criteria demand it. `DEFERRED` requires explicit user acceptance of residual risk; never silently close a failing or untested defect. Record transitions, evidence, owner/decision and revision. Do not claim a real issue-tracker ticket exists unless actually created with permission.

## Risk-based engineering review procedure (Stage 8)
Review the actual diff, architecture and design invariants, business logic/error paths, security/authz and secrets, data integrity, API/schema/event compatibility, concurrency/idempotency/recovery, performance/scaling, observability, maintainability/duplication, rollout/rollback and regression exposure. For each domain classify `APPLICABLE`, `NOT_APPLICABLE` (with rationale), or `UNDETERMINED`; do not force irrelevant checks. For each applicable domain record a concrete review question/invariant, evidence (file/line, test, command or measured artifact), result `PASS|FAIL|BLOCKED|NOT_RUN`, severity/residual risk and any `BUG-*`.
- Security-sensitive changes require relevant negative authorization/boundary checks; without them, do not claim security verified.
- Public contracts require consumer/producer compatibility evidence and versioning/migration impact where relevant.
- Concurrent/distributed paths require analysis of races, idempotency, partial failure and recovery; test where risk justifies.
- Performance-sensitive paths require a workload/target and measurement or an explicit unverified risk; do not infer scalability from static checks.
- Changes affecting operations require appropriate logging/metrics/traces and failure diagnosis evidence, with sensitive-data exposure considered.
- Architecture drift, new unnecessary dependencies/duplication and unplanned technical debt must be reported; material drift returns to change control.

## Standard Stage 8 validation report
Report: artifact ID/revision and checked Git/worktree state; checkpoint vs final scope; AC → TEST → result → BUG matrix; engineering-review domain → applicability → evidence → result → risk matrix; unresolved `FAIL|BLOCKED|NOT_RUN|STALE` items; defect status and residual-risk decisions; final `PASS|FAIL|BLOCKED` recommendation with reasons; explicit user acceptance request for final completion. `PASS` is allowed only for sufficiently evidenced applicable criteria and review domains; unknown risk cannot be converted into a pass. Final acceptance cannot be inferred from a green test suite.
