# Development Workflow Contract — v2.0

## Scope and ownership
This document is the sole authority for stage ordering, state transitions and entry/resume rules. `AGENTS.md` provides routing and universal boundaries; each `SKILL.md` owns its stage procedure. Shared protocols own evidence, approvals, change control and verification. The user-approved `ENGINEERING_CONTRACT.md` defines universal engineering standards, with project-specific constraints supplied by verified project instructions and approved decisions. It does not control stage transitions, approvals, evidence classification, or verification status. Project context and session records are factual records, never independent authorizations. Higher-priority platform/tool controls always apply. On irreconcilable conflicts, stop and ask.

## Stage 0 — session initialization (not an approval stage)
Determine `NEW_DEVELOPMENT`, `EXISTING_MODIFICATION`, or `RESUME`. For new development establish idea, constraints and available repository. For existing work identify task and repository. For resume inspect available session records, approval evidence, Git/worktree, changed files and verification artifacts. Apply `references/CHANGE_CONTROL.md` session recovery and `references/APPROVAL_PROTOCOL.md` approval revalidation, including stale-test detection and conflicting records. A recorded status is not proof. Resume the earliest incomplete or invalidated stage; never reuse an approval for a materially different plan. If reliable approval evidence is unavailable, request re-approval. Stage 0 does not grant write permission or skip required gates.

## Nine stages
| Stage | Skill | Required deliverable | Transition |
|---|---|---|---|
| 1 Task analysis | `task-analysis` | Goals, constraints, acceptance criteria, unknowns and risk tier | User approves task definition |
| 2 Project audit | `project-audit` | Scoped current-state evidence, discrepancies and freshness | User approves audit |
| 3 Component discovery | `component-discovery` | Exact files, interfaces, callers, dependencies and missing inputs | User approves discovered scope |
| 4 Modification approval | `modification-approval` | Alternatives, proposed changes, risks and decision record | User explicitly approves modification proposal |
| 5 Implementation planning | `implementation-planning` | Versioned, file-scoped, layered plan, test matrix and recovery strategy | User explicitly approves **this plan revision** |
| 6 Implementation | `implementation` | Approved diffs, layer outcomes and checkpoint evidence | Approved checkpoint policy; final implementation goes to 7 |
| 7 Testing | `testing` | Executed test cases and defect records, including blocked checks | Go to 8; failures remain visible |
| 8 Validation | `validation` | Acceptance assessment, engineering review and residual risks | User accepts completion or authorizes 9 |
| 9 Bugfix (conditional) | `bugfix` | Root-cause-based bounded fixes and regression cases | Repeat 7 then 8; re-approve if scope expands |

## State machine
`NOT_STARTED → 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → COMPLETED`.
`8 → 9 → 7 → 8` is conditional; approved intermediate layer checks use a bounded `6 → (7 → 8 → 6)` loop only when the plan explicitly schedules them. In that loop, Stage 8 validates the **layer**, not final product acceptance; failures route through Stage 9 when fixes are authorized. Stage 6 may continue to the next layer only after the planned checkpoint's acceptance condition is met. Stages can be `ACTIVE`, `AWAITING_APPROVAL`, `PAUSED`, `BLOCKED`, or `FAILED`; these statuses do not constitute extra stages. No silent transitions past human approval gates. At stage 8, final completion requires user acceptance; a passing test suite alone is insufficient.

## Mandatory control rules
1. Stages 1–5 do not modify product files. Session artifact writes require separately granted journaling permission; otherwise record in chat.
2. Approval is explicit and bound to the described deliverable/revision; never infer from silence or prior approval. Revalidate approval and baseline impact before writes, on resume and at checkpoints; a changed HEAD alone does not revoke approval, but material drift does. See `references/APPROVAL_PROTOCOL.md`.
3. Every important claim must identify provenance and confidence; no fabricated APIs, commands, versions, outcomes or permissions. See `references/EVIDENCE_PROTOCOL.md`.
4. The approved plan defines implementation boundaries, ordered layers, checkpoints, tests, acceptance criteria and rollback/recovery. See `references/CHANGE_CONTROL.md`.
5. Plan-specific intermediate tests are mandatory. Final verification and engineering review are mandatory even if the plan omitted intermediate tests. See `references/VERIFICATION_PROTOCOL.md`.
6. For defects: maintain the lifecycle and AC-to-test-to-defect traceability in `references/VERIFICATION_PROTOCOL.md`; seek authorization for fixes where needed; implement the smallest justified change; rerun affected tests and validation. Never silently refactor.
7. At pause or session end, summarize achieved state, incomplete work, test results, open defects, next exact action and approvals. With authorized journaling, update session state; **do not** update `PROJECT_CONTEXT.md`.
8. On session completion, remind the user that project context synchronization is available by explicit request; do not perform it automatically.
9. Never treat Markdown instructions as hard enforcement. For hard gates configure Codex permissions, Git protections, CI and deployment approvals outside this framework.

## Handoff format
- Session/mode, stage/status, approved artifact ID/revision (if any)
- Evidence: file paths, commands, timestamps or commit IDs
- Findings, changed files and test outcomes
- Unknowns, defects, blockers, risks
- Next action, exact user decision required

## Context synchronization — explicit request only
Reconcile repository reality, decisions and verification against `PROJECT_CONTEXT.md`; maintain it as a concise index to detailed session documents. Cite paths, commit identifiers, dates and unresolved risks. Do not overwrite user-authored content or `ENGINEERING_CONTRACT.md` without permission. Context sync is independent of session journaling.
