# Approval Protocol

## Authority
Only an explicit user decision in the current conversation or a verifiable prior session record can approve a stage deliverable. Tool availability, inferred intent, silence, generic acknowledgments and model-written records are not approvals. For resumed sessions, verify provenance; if uncertain, re-request approval.

## Binding
Identify approvals by `stage`, `artifact_id`, `revision`, `scope_summary`, `user_decision`, and `evidence_reference` (conversation reference or user-confirmed record). A revision changes whenever materially relevant scope, interfaces, acceptance criteria, architecture, tests, migration or risks change. Approval of revision N does not approve N+1. Explicit user approval of a stage does not automatically approve subsequent stages.

## Gates
Stages 1–5 each require the decision described in `DEVELOPMENT_WORKFLOW.md`. Stage 5 requires affirmative approval of the exact plan revision before code changes. Stage 6 follows user-approved layer checkpoints. Stage 8 requires user acceptance to close; remediation follows Stage 9. Any destructive, deployment, secret or production action requires separate specific permission regardless of plan approval.

## On uncertainty
State what is approved, what is not, what changed, and the smallest decision needed. Stop at the gate. User instructions can explicitly revise the workflow for a task, but never bypass platform/tool controls or imply ungranted side-effect permissions.

## Approval revalidation — before each write or approved checkpoint
1. Resolve the latest user-approved `artifact_id` and `revision` from a conversation reference or a user-confirmed record; a model-written status alone cannot prove consent. Match the intended action, layer and checkpoint against that approval.
2. Compare the plan's recorded baseline with current `HEAD`, relevant worktree diffs, dependency manifests/lockfiles, interfaces, test definitions, risk assumptions and changed user requirements. A different `HEAD` **triggers impact analysis**, not automatic revocation. An unchanged `HEAD` does **not** prove the plan remains valid.
3. Classify each difference: `IRRELEVANT` (evidence and reason recorded), `WITHIN_APPROVED_SCOPE` (same approved invariants, risks and tests), `MATERIAL_CHANGE` (changes authorized scope, interfaces, dependencies/behavior, acceptance criteria, tests or risk), or `UNKNOWN` (insufficient evidence). Do not guess classifications.
4. Continue only when approval provenance is verified, the current action is within the approved revision, and all differences are demonstrably irrelevant or within approved scope. Record baseline comparison and rationale in the session state when journaling is authorized.
5. For `MATERIAL_CHANGE` or `UNKNOWN`, stop the affected work, explain the delta and propose a revised artifact/revision or ask for missing evidence. Require explicit user approval of the revised artifact before proceeding; preserve unaffected user work. A revision must not inherit approval from an earlier revision.
6. On resume, verify the approval source again; session notes may point to it but never replace it. If provenance is inaccessible, request renewed approval.

## Partial decisions
If the user approves only a subset of a proposal, treat only that subset as approved for its stage; do not assume the original plan is approved. Reconcile the artifact's scope and revision, and obtain the next required stage approval before editing.
