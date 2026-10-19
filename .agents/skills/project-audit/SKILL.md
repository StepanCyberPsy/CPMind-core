---
name: project-audit
description: Audit actual repository state and documentation freshness at workflow Stage 2 before engineering modifications.
---

# Project Audit

## Preconditions
Read `AGENTS.md`, `docs/engineering/DEVELOPMENT_WORKFLOW.md`, and the applicable protocol(s) in `docs/engineering/references/`. Confirm this is the active stage and prior gates are satisfied. If prerequisites are missing, stop and ask.

## Procedure
1. Verify the approved Stage 1 task and identify affected subsystem boundaries.
2. Inspect Git status, manifests, README, architecture docs, package layout, entrypoints, tests, CI and infrastructure selectively. Expand only when dependencies require it.
3. Map deployed/runtime assumptions separately from source code. Check installed versions and authoritative documentation where material and accessible.
4. Record contradictions between README, context, source, tests and observed behavior using evidence labels; do not silently resolve by guess.
5. Report baseline revision, worktree state, architecture sketch, technical risks, missing access and confidence limits.
6. Request explicit Stage 2 approval. Do not modify product files or automatically populate project context.

## Output and exit
Provide the stage deliverable, evidence labels and paths, uncertainties, status, and exact next approval or action. Apply the workflow's stage transition; never infer approval.
