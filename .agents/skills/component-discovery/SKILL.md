---
name: component-discovery
description: Locate concrete source components, call sites, interfaces and dependency impacts at workflow Stage 3; request missing components when necessary.
---

# Component Discovery

## Preconditions
Read `AGENTS.md`, `docs/engineering/DEVELOPMENT_WORKFLOW.md`, and the applicable protocol(s) in `docs/engineering/references/`. Confirm this is the active stage and prior gates are satisfied. If prerequisites are missing, stop and ask.

## Procedure
1. Begin from task acceptance criteria and Stage 2 evidence; search real paths and symbols rather than hypothesizing names.
2. Inspect definitions, imports, callers, schemas, contracts, error handling, permissions, configuration, tests and relevant integration edges.
3. Produce a path-specific impact map separating confirmed files, possible dependencies and missing/unavailable components.
4. For absent or inaccessible components, state search coverage and request the minimum missing input; never invent implementation details.
5. Identify compatibility, migration, performance and security touchpoints and candidate test surfaces.
6. Request explicit Stage 3 scope approval. Do not edit code.

## Output and exit
Provide the stage deliverable, evidence labels and paths, uncertainties, status, and exact next approval or action. Apply the workflow's stage transition; never infer approval.
