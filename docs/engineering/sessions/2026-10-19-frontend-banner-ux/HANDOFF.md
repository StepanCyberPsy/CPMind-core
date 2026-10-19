# CPMind Session Handoff — Frontend, Banner Measurement, and Signal Calibration

## Current snapshot — S2 restoration and S3 banner calibration

### State, authority, and baseline

- Updated on 2026-10-19, Europe/Moscow, following the explicit user request to update this session snapshot and provide a commit message. Authorization covers this handoff/index update, not broader future journaling or product changes.
- Session ID remains `2026-10-19-frontend-banner-ux`; this is the latest separately approved backend follow-up.
- Current HEAD: `3a194bc8b8e43af4531aa38db162c5f8ad86e20e`. The worktree was clean before this follow-up.
- The previous S2 grouping change is committed at this HEAD. The current pending change restores the earlier S2 policy and applies the common-banner policy to S3 instead.
- Current pending inventory: three modified backend source files, one modified backend test, one new backend test, and these two documentation updates; seven files total.
- Local implementation and planned verification are delivered. Stage 8 reported a local `PASS` recommendation and requested acceptance; the subsequent user message requested this snapshot and a commit message. No separate explicit final-acceptance decision or production acceptance evidence is recorded.
- No staging, commit, push, history modification, deployment, production-data operation, real calibration run, model activation, migration, or bulk historical recalculation was performed by the agent. The user will commit manually.

The sections headed "Historical snapshot — S2 banner calibration follow-up" and "Earlier snapshot and authority" preserve earlier phases at their original baselines. Their policies, pending-file lists, fingerprints, and test counts are historical, not the current implementation specification. The earlier common-static S2 policy is explicitly superseded by this section.

### Correction of the reported signal

- The user clarified that the constant reported score of 50 concerned S3, not S2, and requested two simultaneous tasks: restore the prior S2 implementation and use common static banner grouping for S3 selection/training.
- No S2 normalization-formula defect had been established. The prior S2 grouping change was a requirement change based on the initially misidentified signal; restoring it does not alter the quantile formula or remove the earlier S2 UI.
- Source inspection and an in-memory Node 22 probe reproduced the S3 path: without an active animated model, a GIF can reach a neutral global v0 model even when a trained static model exists. All-zero coefficients yield sigmoid(0) × 100 = 50.
- The v0 badge itself is not an exclusion condition. The resolver prefers a matching constants version, then permits the latest active version at that segment before descending to parent/global segments.
- Production root cause remains `UNVERIFIED`: no problematic production impression/model row was supplied. The implemented policy corrects the confirmed segment-selection mismatch; it does not prove that every production score of 50 came from fallback or prohibit legitimate scores of 50.

### Implemented policy

| Creative type | S1 group retained | S2 group restored | S3 group selected/trained |
|---|---|---|---|
| `banner_static` | `static` | `static` | `static` |
| `banner_gif` | `animated` | `animated` | `static` |
| `banner_html5` | `animated` | `animated` | `static` |
| `video_creative` | `video` | `video` | `video` |

- `routes/impressions.ts` restores S2 use of the existing device/creative-group key and introduces an independent S3 key. The server delivery-context type still takes precedence over the validated client type.
- `jobs/s2_calibration.ts` is restored byte-for-byte to commit `52490b4daa0c8bfcdb5452895cb267244ac9b258`, including original EOF formatting. Its static, animated, and video device/group training is reinstated.
- `jobs/s3_logistic_recalibration.ts` maps all three banner types into static and retains video. Future S3 runs produce static/video device/group drafts, without new animated drafts.
- S3 fallback remains `{device}|group` → `group` → `global` → `DEFAULT_LOGISTIC_PARAMS`; matching-version preference and latest-active-version fallback at each level remain unchanged.
- Existing formulas, coefficients, feature normalization, dominant-version selection, quality filters, sample thresholds, deterministic split, fitting safeguards, cron schedules, logging, and inactive-draft/manual-activation policy remain unchanged.
- Both cron and existing manual signal-calibration callers inherit the runner changes. Neither was executed against a real database.
- Existing models and impressions remain stored as before. Restoring code does not undo earlier saved S2 results or previously fitted/activated configurations.
- No frontend, shared, SDK, runtime, player, embed, media, schema/API, dependency, or deployment changes were made in this follow-up. The S2 UI and model-version display are retained.

### Current file inventory

| Path | State | Purpose |
|---|---|---|
| `packages/backend/src/routes/impressions.ts` | Modified | Restore S2 key; isolate common-banner S3 key |
| `packages/backend/src/jobs/s2_calibration.ts` | Modified | Restore original static/animated/video grouping |
| `packages/backend/src/jobs/s3_logistic_recalibration.ts` | Modified | Pool S3 banners into static; retain video |
| `packages/backend/tests/s2_segmentation.test.ts` | Modified | 31 tests covering restored S2 and signal isolation |
| `packages/backend/tests/s3_segmentation.test.ts` | New | 28 tests covering real S3 resolution, route/scoring, and training |
| `docs/engineering/sessions/2026-10-19-frontend-banner-ux/HANDOFF.md` | Modified | Latest outcome with earlier phases preserved |
| `docs/engineering/sessions/README.md` | Modified | Current session index description |

### Verification and acceptance traceability

All planned commands exited 0 on Node `v22.23.2` after `nvm use 22`:

```sh
source "$HOME/.nvm/nvm.sh"
nvm use 22
node packages/backend/node_modules/vitest/vitest.mjs run --root packages/backend tests/s2_segmentation.test.ts tests/s3_segmentation.test.ts --maxWorkers=1 --minWorkers=1
node node_modules/typescript/bin/tsc --project packages/backend/tsconfig.json --noEmit --incremental false
node packages/backend/node_modules/vitest/vitest.mjs run --root packages/backend tests/domain_policy.test.ts tests/impression_context_rules.test.ts tests/sample_split.test.ts --maxWorkers=1 --minWorkers=1
git diff --check
```

| Criterion | Evidence | Result |
|---|---|---|
| `AC-1`: S2 restored | `TEST-1`: separate static/animated/video selection, fallback and training; source-byte comparison with 52490b4 | PASS |
| `AC-2`: all banners use static S3 | `TEST-2`: three types × three devices, selected model ID and actual normalized result saved by the route | PASS |
| `AC-3`: version fallback retained | `TEST-3`: matching-version priority, calibrated v0 acceptance, latest active version, group/global/default, cache/invalidation | PASS |
| `AC-4`: common S3 training | `TEST-4`: pooled banner fixtures, separate video, real MLE fitting, expected keys and train sample sizes, inactive drafts | PASS |
| `AC-5`: training guards retained | `TEST-5`: emitted quality/window/version predicates, insufficient samples, one-class targets, absent dominant version | PASS |
| `AC-6`: signal isolation | `TEST-6`: S1/S2 keys, video, server-type precedence, null S3, neutral global score of 50 | PASS |

- S2 suite: 31/31 passed; S3 suite: 28/28 passed; combined target suites: 59/59.
- Existing pure regressions: context 18/18, domain policy 10/10, sample split 4/4; 32/32.
- Total for this follow-up: 91/91 passed. Earlier frontend/runtime suites were not rerun and are not included.
- Backend source typecheck, scoped diff, and whitespace checks passed. The backend tsconfig includes src, not tests; test execution is separate evidence.
- Original source EOF formatting was restored before testing. Product/test files were not edited after successful checks; subsequent changes are documentation only.
- No failed checks occurred. Detailed execution evidence is in conversation tool results, not a separately saved CI log.

The suites execute actual Fastify route/scoring code and signal resolvers. Training uses actual S2 quantile code and the actual S3 fitting runner, deterministic split, quality helpers, and logistic MLE. The DB module is substituted before production imports; ownership/context/other-model lookups use fixtures. Drizzle PostgreSQL query conditions are inspected, while fixture selection supplies rows. Synthetic AUC assertions are regression checks, not production model-quality measurements.

### Engineering review and limits

| Domain | Assessment |
|---|---|
| Architecture/maintainability | PASS within scope: independent S3 key, three localized source files, no dependency or unrelated refactor |
| Business logic/data contracts | PASS: AC-1–AC-6; formulas, API/schema, saved model-version semantics retained |
| Security/attribution | PASS for changed boundary: server type precedence and existing ownership-field propagation retained; full authorization/security campaign NOT_RUN |
| Cache/concurrency/persistence | Cache tests passed; checkpoint and activation paths unchanged by diff review; multiprocess/concurrency tests NOT_RUN |
| Operations/recovery | Original S2 source restored without Git-history changes; schedules/manual activation retained; real jobs/deployment NOT_RUN |
| Performance | NOT_RUN: pooled S3 samples can be larger per fit; no load/scalability assurance claimed |
| Frontend/migration/infrastructure | NOT_APPLICABLE to this change set |

Actual PostgreSQL execution, production configuration/rollout, load, and multiprocess checks remain NOT_RUN. The earlier frontend/browser acceptance limits remain historical and distinct. No comprehensive production readiness claim is made.

### Approval record and next boundary

- Stage 1: `CPMIND-S3-DIAG-TASK r2`, approved when the user explicitly combined S2 restoration and S3 implementation. The earlier provisional r1 diagnosis did not authorize edits.
- Stage 2: `CPMIND-S2-RESTORE-S3-AUDIT r1`, user replied "Confirmed."
- Stage 3: `CPMIND-S2-RESTORE-S3-SCOPE r1`, user replied "Confirmed".
- Stage 4: `CPMIND-S2-RESTORE-S3-CHANGE r1`, user replied "confirmed".
- Stage 5: `CPMIND-S2-RESTORE-S3-PLAN r1`, user replied "Confirmed. Go ahead" before edits.
- Stage 6: one approved layer, both tasks together; Stage 7 checks all passed; Stage 8 local PASS recommendation and acceptance request reported.
- Latest user instruction authorizes this snapshot/index update and a commit message. It does not authorize agent commits, deployments, activations, or historical recalculation.
- Next safe action: user review and manual commit of the seven-file pending change set. No additional product-code work is requested by this record.
- On resume, compare current HEAD/worktree, the current manifest, approval provenance, and test freshness. Earlier manifests must be checked against their own recorded baseline, not treated as current expected contents.
- `PROJECT_CONTEXT.md` and the engineering contract remain unchanged; context synchronization is available only on a separate explicit request.

### Current product-file manifest

SHA-256 fingerprints of current source/test files; not test logs or independent authorization:

```text
3793b12a8b667faefaf48c4f42eb419ccf4c793a1837de3d96197f2ea6f165ff  packages/backend/src/routes/impressions.ts
307b145faf243f4f14bda05150248ce32cd2b1734515d954f8b69f8d74fc6cfc  packages/backend/src/jobs/s2_calibration.ts
efd67bc568672562148de8364682014515cbe1be7bb6cf0f858fee61fb11c7b5  packages/backend/src/jobs/s3_logistic_recalibration.ts
14d7c23423cb92476df4eba558a067b18c4d2bb2e000ff935da9844ac581f753  packages/backend/tests/s2_segmentation.test.ts
7726b01e3346b24fcf508d770b8f3cbbf914b89c4b69a3ed942c6587001299a2  packages/backend/tests/s3_segmentation.test.ts
```

## Historical snapshot — S2 banner calibration follow-up

### State, authority, and baseline

- Updated on 2026-10-19, Europe/Moscow, under the explicit user request to update this session snapshot and provide a commit message. This authorizes this record and its index update, not broader future journaling.
- Session ID remains `2026-10-19-frontend-banner-ux`; this section records the subsequent, separately approved backend S2 scope.
- Current HEAD: `52490b4daa0c8bfcdb5452895cb267244ac9b258`. The worktree was clean before S2 implementation.
- All 26 product/test SHA-256 entries in the earlier frontend/banner manifest below were checked against Git blobs at current HEAD and matched, 26/26. That delivery is now part of the committed baseline.
- Current product delta: two modified backend source files and one new backend test file. This snapshot update additionally modifies this handoff and `docs/engineering/sessions/README.md`.
- No frontend, display-runtime, shared, SDK, player, embed, media pipeline, schema, migration, API contract, dependency, or deployment files were changed by this S2 follow-up.
- Stage 8 reported a local automated `PASS` recommendation and requested final acceptance. The user then asked a calibration clarification and requested this snapshot and commit message. No separate explicit final-acceptance decision or production acceptance evidence is recorded.
- No staging, commit, push, other Git-history operation, deployment, real calibration run, production-data operation, or bulk historical recalculation was performed by the agent. The user will commit manually.

Sections beginning with "Earlier snapshot and authority" retain the frontend/banner delivery evidence at its original baseline. Their statements about uncommitted files, unchanged backend, and prior worktree contents describe that earlier phase, not the current S2 delta.

### Agreed S2 behavior and implementation

- All non-video banners use the existing `static` S2 group, including GIF and HTML5. The user also explicitly approved pooling these types for future S2 training. Existing names and formulas remain unchanged.
- Banner resolution: `{device}|static` → `static` → `global` → `DEFAULT_S2_PARAMS`.
- Video resolution remains `{device}|video` → `video` → `global` → `DEFAULT_S2_PARAMS`.
- `routes/impressions.ts` constructs a separate S2 segment key. The existing S1/S3 key remains unchanged, including their `animated` grouping for GIF/HTML5.
- The server delivery-context creative type still takes precedence over validated client payload. The existing scoring service receives the selected parameters and saves the configuration ID as `s2ModelVersion`.
- S2 training maps `banner_static`, `banner_gif`, and `banner_html5` to `static`; `video_creative` remains `video`. Both groups retain device-level and group-level drafts.
- Future S2 runs no longer create `animated` drafts. Existing configurations remain in the database/configuration management; new banner calculations no longer select them through the ingestion route.
- The 30-day window, minimum 1000 finite observations, quantile grid/interpolation, minimum spread of 0.05 percentage points, quality filters, cron schedule, and manual activation policy remain unchanged.
- Cron and the existing manual signal-calibration service both call `recalibrateS2()`. Neither caller was modified or executed against a real database.
- Historical impressions were not bulk-recalculated. Automatic model activation was not added.
- Separating GIF and HTML5 models later requires a separately approved segment-selection/training change; configuration creation alone cannot override common static grouping.

An S2 value of 50 alone does not prove fallback: a calibrated model can also return 50 at its median. This correction aligns model selection with the clarified grouping; it does not prohibit legitimate scores of 50.

### Current file inventory

| Path | State | Purpose |
|---|---|---|
| `packages/backend/src/routes/impressions.ts` | Modified | Separate S2 selection from S1/S3 |
| `packages/backend/src/jobs/s2_calibration.ts` | Modified | Pool banners into static; retain video |
| `packages/backend/tests/s2_segmentation.test.ts` | New | 27 isolated regression tests |
| `docs/engineering/sessions/2026-10-19-frontend-banner-ux/HANDOFF.md` | Modified | Current S2 outcome and historical distinction |
| `docs/engineering/sessions/README.md` | Modified | Update session index |

### Verification and acceptance traceability

Executed on Node `v22.23.2` after `nvm use 22`, with TypeScript `5.9.3`, Vitest `1.6.1`, and Drizzle ORM `0.31.4`. Every command below exited 0:

```sh
source "$HOME/.nvm/nvm.sh"
nvm use 22
node packages/backend/node_modules/vitest/vitest.mjs run --root packages/backend tests/s2_segmentation.test.ts --maxWorkers=1 --minWorkers=1
node node_modules/typescript/bin/tsc --project packages/backend/tsconfig.json --noEmit --incremental false
node packages/backend/node_modules/vitest/vitest.mjs run --root packages/backend tests/domain_policy.test.ts tests/impression_context_rules.test.ts tests/sample_split.test.ts --maxWorkers=1 --minWorkers=1
git diff --check
```

| Criterion | Test evidence | Result |
|---|---|---|
| `AC-1`: banners select static | `TEST-1`: three types × three devices, saved model ID and actual normalized S2 | PASS |
| `AC-2`: fallback retained | `TEST-2`: device/group/global/default, inactive/malformed models, cache/invalidation | PASS |
| `AC-3`: video, S1/S3, attribution retained | `TEST-3`: video on three devices; unchanged S1/S3 keys; server type precedence in both directions | PASS |
| `AC-4`: common banner training | `TEST-4`: pooled banner types, separate video, device/group keys, fixture owners, draft sizes/quantiles, no animated drafts | PASS |
| `AC-5`: safeguards retained | `TEST-5`: query filters/window, insufficient/constant/non-finite samples, quantile grid, inactive drafts | PASS |

- New S2 suite: 27/27 passed.
- Existing pure regressions: impression context 18/18, domain policy 10/10, sample split 4/4; total 32/32.
- Current S2 total: 59/59 passed. Earlier frontend/runtime suites below were not rerun for this backend-only follow-up and are not included.
- Backend source typecheck passed. The package tsconfig includes `src`, not tests; test execution is separate evidence.
- Scoped diff/whitespace checks passed, including the untracked test file. Original no-final-newline formatting was restored in the two production files after the checks; executable contents are unchanged, classified `IRRELEVANT` to test freshness.
- No test failures occurred in this follow-up. Evidence is in conversation tool results, not a saved CI log.

The new suite executes the real Fastify route, S2 resolver, scoring path, and fitting runner. The DB module is replaced before production-service imports; other model/ownership/context lookups use fixtures. Actual Drizzle PostgreSQL query predicates are inspected, while fixture selection supplies rows. This verifies local behavior and generated conditions, not real PostgreSQL execution, ownership validation, deployed cron execution, or production model contents.

### Engineering review and limits

| Domain | Assessment and evidence |
|---|---|
| Architecture/maintainability | PASS within scope: separate S2 key, two localized source changes, no dependencies/refactor |
| Business logic/data contracts | PASS: AC-1–AC-5, existing formula/API/schema/model-version semantics retained |
| Security/attribution | PASS for changed boundary: server-type precedence exercised; authorization untouched, no comprehensive security claim |
| Cache/concurrency/persistence | Cache tests passed; existing checkpoint/activation mechanisms unchanged by diff review; distributed testing NOT_RUN |
| Operations/diagnostics | Schedule/logging/inactive drafts/manual activation retained by source review; real jobs/deployment NOT_RUN |
| Performance | NOT_RUN: pooled static samples can be larger per fit; no load/scalability claim |
| Frontend/migration/infrastructure | NOT_APPLICABLE to this follow-up; no changes |

Real DB integration, production configuration/rollout, and load checks remain NOT_RUN. Earlier frontend/browser acceptance limitations below remain distinct and are not resolved by these backend tests.

### Calibration eligibility clarification

Source inspection across automatic S1–S7 training jobs confirmed:

- No owner, role, user-ID, or tag-ID restriction: eligible admin and user impressions contribute.
- Every job requires `isSuspicious = false`; the common trainability filter requires `scoreReliable = true`, excluding GIVT and suspected/confirmed SIVT under the existing classifier.
- Current `isSuspicious` covers no interaction events, a predominantly hidden tab, and anomalous duration.
- `CLIENT_CONTEXT_MISMATCH` impressions are excluded.
- S1–S6 use 30-day windows; S7 uses 60 days. Signal availability, segmentation, minimum sample size, collection mode, and applicable constants-version restrictions further limit eligibility.
- S1/S2/S4/S6 select SDK-only data; S3/S5/S7 allow compatible legacy-tag samples.
- Manual weight-recalculation batches have a separate admin-owner scope and do not define automatic model-training eligibility.

No eligibility or ownership policy was changed in this follow-up.

### Approvals and next boundary

- Stage 1: `CPMIND-S2-BANNER-TASK r1`, explicitly accepted together with common static training.
- Stage 2: `CPMIND-S2-BANNER-AUDIT r1`, user replied "Confirmed."
- Stage 3: `CPMIND-S2-BANNER-SCOPE r1`, user replied "Confirmed."
- Stage 4: `CPMIND-S2-BANNER-CHANGE r1`, explicitly confirmed; the accompanying request to start code was followed by the required versioned-plan gate.
- Stage 5: `CPMIND-S2-BANNER-PLAN r1`, user replied "Confirmed" before source/test edits.
- Stage 6: one approved layer; Stage 7 checks passed; Stage 8 local PASS recommendation reported with runtime limits.
- Latest user request authorizes this snapshot/index update and a commit message, not agent commits, deployments, model activation, or historical recalculation.
- Next safe action: the user reviews the pending five-file change set and commits manually. No additional code/release work is authorized by this record.
- On resume, verify Git/worktree, manifest, approval provenance, and test freshness.
- `PROJECT_CONTEXT.md` and the engineering contract remain unchanged. Context synchronization requires a separate explicit request.

### Current S2 product-file manifest

SHA-256 fingerprints, not test logs or independent approval evidence:

```text
07dff39c7a59200a091543f2596a33fae34101ec3c9a11119dc184bd57f11dd5  packages/backend/src/routes/impressions.ts
2de92ac6157ffa885557534557d636f1d6ad819a285ea56ebdba612d2231f2e9  packages/backend/src/jobs/s2_calibration.ts
fad08ab7f53eb50e0c0af6ac8c0fd1038129c735bebb8ac554c893f648e6ff8f  packages/backend/tests/s2_segmentation.test.ts
```

## Earlier snapshot and authority

- Session ID: `2026-10-19-frontend-banner-ux`.
- Snapshot date: 2026-10-19, Europe/Moscow, following the user's request to record the session outcome.
- Repository HEAD: `cbc35029b692d73d67f89646d0efbacbeacea5cb`.
- Delivery state: local, uncommitted changes; 26 product/test files across frontend and display-runtime, comprising 20 modified files and 6 new files.
- User acknowledgment: after the implementation report, the user stated, "Everything we set out to implement has been implemented," and requested this snapshot.
- Verification state: automated checks passed. The last engineering validation recommendation remained `BLOCKED` for final browser acceptance. The user's acknowledgment does not supply missing browser test results.
- Deployment state: the agent performed no deployment, runtime publication, production-data changes, migrations, bulk recalculation, staging, commits, pushes, or other Git-history operations. Current production rollout status has not been reverified.
- Documentation authorization: the current user request authorizes this session record and its index entry. No broader future journaling or product-change permission is inferred.

This record describes the observed local implementation and recorded session evidence. It is not independent proof of approval, test execution, deployment, or production readiness. On resume, reconcile it with the conversation, current source, Git state, and the engineering framework. Historical handoffs are context, not an active backlog.

## Relevant architecture

- `packages/frontend` contains the shared Next.js workspace, user/admin impressions, calibration UI, campaigns, creatives, and placement controls. The affected UI uses existing backend contracts and shared taxonomy helpers.
- `packages/display-runtime` handles `banner_static`, `banner_gif`, and `banner_html5`, initializes measurement through the existing SDK, and sends existing delivery lifecycle events. Its browser bundle inlines SDK/shared dependencies.
- The SDK remains responsible for S1–S7 collection, presence-driven segmentation, checkpoint/final transport, and measurement-session lifecycle after initialization. SDK source was not changed in this session.
- Backend scoring, calibration calculations, ingestion, database schemas, API contracts, video player, embed loader, and media processing were not modified.
- Older architecture/package documentation was used for context only. In particular, the old display-runtime documentation's claim that render confirmation guarantees viewport exposure is not supported by the pre-fix implementation.

## Implemented product behavior

### Campaign and creative names in impressions

- Both admin and user impressions tables display existing `campaign_name` and `creative_name` fields under human-readable column labels.
- A nullish name falls back to the existing canonical identifier for compatibility. An empty string is not replaced by that nullish fallback.
- Canonical IDs, table accessors, routing, API requests, and data relationships remain unchanged. Names are presentation values, not new identity keys.
- This change targets impressions-table cells; it does not assert that every selector or identifier elsewhere in the product was renamed.

### S2 calibration UI

- The signals page now loads existing S2 configurations and passes them to the shared models panel.
- S2 has its own tab, segment groups, active-state display, sample sizes, fitted dates, quantile table, and the existing activation/deactivation/deletion actions and countdown behavior.
- Quantile columns are derived from actual `quantileLevels`; values are matched by level, rather than assuming identical array positions across configurations. Incomplete/non-finite pairs display as unavailable.
- The existing formula presentation is used. No new calibration formula, parameter, endpoint, or database field was introduced.
- Admin impression details now show the existing `s2_model_version`, identifying the saved S2 calibration configuration used for that impression, consistently with the other model-version fields.

### S6 calibration presentation

- The UI separates In-stream, Out-stream, and historical/other configurations.
- Recognized segments use existing shared segment builders and mode definitions; device tabs include desktop, mobile, tablet, and common mode-level configurations.
- Unknown/historical keys remain accessible without assigning them an invented mode.
- Coefficient presentation distinguishes the mode-specific symbols and the existing skipped/closed-by-user interpretation. Persisted label thresholds and positive-label rate are displayed from existing fields.
- Zero values remain distinct from unavailable values. Existing `signal-formulas.ts`, API contracts, backend model logic, and scoring were not changed.

### Impressions filters

- Creative type, placement format, and placement subtype now pass through URL parsing into existing backend list parameters for both roles.
- UI state follows the corresponding URL values. With no format selected, subtype options expose the existing combined taxonomy choices.
- The obsolete tag-version filter was removed from the admin impressions context; that context also ignores stale tag-version query parameters and no longer loads tag-version options.
- An explicit admin parser/filter context preserves the existing default recalculation behavior, including tag-version handling and owner scoping. This was intentional isolation, not a recalculation redesign.
- Existing CSV URL builders were exercised with the forwarded taxonomy parameters; the API/CSV builders themselves were not rewritten.

### Logout and navigation

- Header Logout is present on `/admin/users_panel` and `/user/panel`; the user-panel placement already existed and was retained.
- The global shared workspace header no longer displays Logout.
- On the admin users panel, the campaigns link moved beside Create User in the toolbar, and the shared Logout control moved into the page header.
- Authentication/session cleanup and the shared logout implementation were preserved.

### Start of measurement for all banners

- Root cause: the old common display flow initialized the SDK immediately after asset render confirmation. Load/decode/animation-frame completion did not establish viewport exposure; records with zero visibility could subsequently be sent and counted.
- Preparing the SDK early also armed presence/segmentation machinery. Therefore, delaying only the explicit start call would not fully prevent premature records.
- The common flow now waits until the asset is ready and an observer reports `isIntersecting && intersectionRatio > 0`, matching the existing first-viewport-entry condition.
- SDK preparation and measurement start happen only after that confirmation, for static images, GIFs, and HTML5 banners.
- `timestamp_start` uses the viewport confirmation time, excluding the preceding wait. The separate S1 75% threshold/MRC logic and post-start segmentation remain unchanged.
- Asset-load timeout ends after readiness; ordinary waiting for scrolling does not become a load timeout.
- A pending lifecycle handles container removal and `pagehide` before SDK creation, cancels waiting, and releases pending observers. HTML5 bridge cleanup is invoked through the existing context cleanup path.
- Missing/failing viewport observation does not start measurement. Existing diagnostic event/error contracts are retained.
- Asset loading and delivery lifecycle events still occur before measurement when appropriate. An ad-session/delivery event is not itself an impressions-table record.

### Placement embed modal

- Root cause: creation opened the modal and immediately called `router.refresh()`. The refreshed server page found the new placement and replaced the form component, unmounting its modal state.
- Refresh now occurs when the user closes the modal. The code stays available until then.
- Existing close button, Escape, backdrop handling, and copy-code components are preserved.

### Creative activity badge in a campaign

- Campaign cards now show the same Active/Inactive state used inside a creative detail page, alongside the existing processing/readiness badge.
- The existing placements API is read once for the page. The first matching placement in the returned order supplies its `isActive`, matching the detail page's existing selection rule.
- The implementation does not aggregate activity across placements or add a new Creative `isActive` contract.
- If no placement exists, no activity badge is rendered, consistent with the absence of that state in the detail view.
- Mobile wrapping uses a class applied only to the campaign-list layout.

## Investigated and excluded work

- Out-stream positioning was investigated at `https://onlinetrailer.ru`. The user's browser output showed `outstream/inpage`, a relative surface, and a large 16:9 size, despite the initial expectation of sticky.
- The user confirmed that In-Page had been selected accidentally, changed the placement to Sticky, and reported correct behavior. They explicitly stopped further investigation. No player/CSS/backend fix was made for this configuration issue.
- The browser snapshot during investigation referenced loader v4, display v5, and player v6. Public player v6 contained sticky support; public display v5 contained the premature-start path. These are session-time observations, not a claim about the current deployed versions after this snapshot.
- Bulk recalculation was explicitly deferred by the user and was not executed.
- No historical backend/handoff issues were automatically resumed. No general documentation-versus-code audit or unrelated refactor was performed.

## File inventory

### Earlier frontend delivery — 15 modified files and 2 new files

| Path | State | Purpose |
|---|---|---|
| `packages/frontend/src/app/admin/impressions/page.tsx` | Modified | Explicit impressions filter context; remove tag-options fetch |
| `packages/frontend/src/app/admin/signals/page.tsx` | Modified | Load/pass S2 configurations |
| `packages/frontend/src/app/admin/users_panel/page.tsx` | Modified | Shared Logout in header |
| `packages/frontend/src/components/admin/Filters.tsx` | Modified | Taxonomy synchronization and isolated tag-filter removal |
| `packages/frontend/src/components/admin/ImpressionDetail.tsx` | Modified | Display `s2_model_version` |
| `packages/frontend/src/components/admin/ImpressionsTable.tsx` | Modified | Campaign/creative display names |
| `packages/frontend/src/components/admin/SignalModelsPanel.tsx` | Modified | S2 table/actions and S6 presentation |
| `packages/frontend/src/components/admin/UsersPanelTable.tsx` | Modified | Campaigns link beside Create User |
| `packages/frontend/src/components/shared/WorkspaceNav.tsx` | Modified | Remove global Logout |
| `packages/frontend/src/components/user/Filters.tsx` | Modified | Taxonomy synchronization/options |
| `packages/frontend/src/components/user/ImpressionsTable.tsx` | Modified | Campaign/creative display names |
| `packages/frontend/src/lib/admin/search-params.ts` | Modified | Forward taxonomy only in impressions context |
| `packages/frontend/src/lib/admin/types.ts` | Modified | S2 props/types and filter context |
| `packages/frontend/src/lib/user/search-params.ts` | Modified | Forward taxonomy filters |
| `packages/frontend/src/styles/users_panel.module.css` | Modified | Toolbar wrapping |
| `packages/frontend/src/lib/admin/signal-model-presentation.ts` | New | S2 alignment and S6 segment/value presentation helpers |
| `packages/frontend/tests/frontend-regressions.test.mjs` | New | Eight regression tests |

### Banner/UI delivery — 5 modified files and 4 new files

| Path | State | Purpose |
|---|---|---|
| `packages/display-runtime/src/index.ts` | Modified | Gate common banner flow; pending lifecycle and timeout handling |
| `packages/display-runtime/src/session.ts` | Modified | Actual measurement start timestamp and prepared-state guard |
| `packages/display-runtime/src/viewport.ts` | New | Pending lifecycle and first-entry observation |
| `packages/display-runtime/tests/measurement-start.test.mjs` | New | Eighteen runtime/build tests |
| `packages/frontend/src/components/shared/InlinePlacementForm.tsx` | Modified | Refresh after modal close |
| `packages/frontend/src/app/(workspace)/campaigns/[uuid]/page.tsx` | Modified | Read/display existing placement activity |
| `packages/frontend/src/styles/creatives.module.css` | Modified | Campaign-only mobile wrapping |
| `packages/frontend/src/components/shared/CreativeActivityBadge.tsx` | New | Active/Inactive badge; absent when no placement |
| `packages/frontend/tests/placement-ui.test.mjs` | New | Six UI handler/tree tests |

The existing frontend API module, formula definitions, shared logout implementation, SDK, player, backend, shared schemas, embed, media worker, runtime publisher, dependency manifests/lockfile, database migrations, and deployment configuration were not changed by this session's product implementation.

## Verification evidence

Evidence was recorded in this conversation, not in a separately saved CI log. The following commands completed with exit 0 on Node `v22.23.2` after `nvm use 22`. Installed tooling inspected during the session included TypeScript `5.9.3`, Next.js `14.2.35`, React `18.3.1`, and esbuild `0.21.5`.

```sh
source "$HOME/.nvm/nvm.sh"
nvm use 22
node --test packages/display-runtime/tests/measurement-start.test.mjs
node node_modules/typescript/bin/tsc --project packages/display-runtime/tsconfig.json --noEmit --incremental false
node --test packages/frontend/tests/placement-ui.test.mjs
node node_modules/typescript/bin/tsc --project packages/frontend/tsconfig.json --noEmit --incremental false
node --experimental-strip-types --test packages/frontend/tests/frontend-regressions.test.mjs
BACKEND_URL=http://127.0.0.1:1 NEXT_PUBLIC_BACKEND_URL= node packages/frontend/node_modules/next/dist/bin/next build packages/frontend
git diff --check
```

| Evidence | Result | Scope/limitations |
|---|---|---|
| Runtime suite | PASS, 18/18 | Real runtime orchestration/static flow with simulated DOM/observers/clock; SDK transport and HTML5 readiness bridge are substituted |
| Runtime browser bundle | PASS | Included in runtime suite; esbuild runs in memory for existing shared browser targets; no runtime artifact published |
| UI suite | PASS, 6/6 | Real component handlers/JSX with substituted hooks, router, API, and document; not browser layout/e2e |
| Earlier frontend regressions | PASS, 8/8 | Taxonomy forwarding/CSV, recalculation isolation, S2 quantiles, S6 grouping and null/zero handling |
| Type checks | PASS | Display-runtime and frontend; no emit/incremental output requested |
| Frontend production build | PASS | Compilation/type validation and 18/18 generated pages; backend address overridden to unavailable loopback |
| Diff and new-file whitespace | PASS | No whitespace errors; scope checked against plan |
| Browser acceptance | NOT_RUN / BLOCKED | Real scrolling, clipboard behavior, modal persistence, mobile layout, live calibration actions |
| Production rollout verification | NOT_RUN | No deployment/publication performed by agent |
| Load/security campaign | NOT_RUN | No throughput or comprehensive security assurance claimed |

The 18 + 6 + 8 suites total 32 passing automated tests. Initial UI harness runs failed on directory resolution (`EISDIR`) and cross-VM `Error` identity; the test harness was corrected and the full six-test UI suite then passed. Earlier exploratory read-only reproduction attempts also required completing their DOM mocks. These tooling failures are not recorded as product defects. The existing Node `MODULE_TYPELESS_PACKAGE_JSON` warning appeared in the earlier frontend regression suite; it did not fail the run, and package configuration was not changed to suppress it.

## Acceptance and engineering assessment

| Criterion | Automated evidence | Remaining acceptance evidence |
|---|---|---|
| `AC-BNR-1`: first-entry start for all three banner types | `TEST-BNR-START`, PASS | Real-browser exposure/transport check |
| `AC-BNR-2`: no backdating or repeated start | `TEST-BNR-TIMING`, PASS | Real-browser behavior |
| `AC-BNR-3`: cancellation, timeout separation, cleanup | `TEST-BNR-CANCEL`, PASS | Real HTML5 bridge/browser lifecycle check |
| `AC-UI-1`: persistent embed modal | `TEST-UI-MODAL`, PASS | Clipboard and browser persistence check |
| `AC-UI-2`: activity matches detail selection | `TEST-UI-ACTIVITY`, PASS | Browser display and mobile layout check |

- Architecture/identity/contracts: source review and scoped diff passed; no new backend contract or canonical-identity change.
- Error paths/cancellation/races: covered by the bounded automated scenarios, including removal between observer notification and SDK preparation.
- Access: existing cookie/API paths retained; UI fixture checks forwarding and campaign filtering. This is not a comprehensive authorization/security test.
- Performance: one existing placements-list request is added to campaign rendering, and pending banners have observers until start/cancellation. Load behavior has not been benchmarked.
- Diagnostics/compatibility: existing event/error schemas retained; compilation for supported browser targets passed. Actual browser compatibility is not established by compilation alone.
- Operations/recovery: no migration/deployment/history operation; unrelated edits preserved. Runtime release requires a separate appropriately versioned publication and backend runtime-version selection through the existing release process. This record does not authorize that operation.

The two investigated product defects (premature banner start and disappearing embed modal) are implemented as `FIXED` locally, with automated retests passing; browser verification/closure remains unrecorded. The activity badge is an implemented feature. The Out-stream configuration issue is user-reported resolved and excluded from further work.

## Approval and workflow record

- Earlier frontend work was delivered under the recorded `CPMIND-FE-PLAN r1` approval in this conversation; recover the original approval context before reusing it.
- For the later work, Stage 1 explicitly included all banner formats and authorized the display-runtime scope extension. Stage 2 audit and Stage 3 `CPMIND-BANNER-UX-SCOPE r1` were separately confirmed.
- Stage 4 `CPMIND-BANNER-UX-CHANGE r1` was confirmed.
- Stage 5 `CPMIND-BANNER-UX-PLAN r1` was explicitly approved with "Confirmed. Go ahead" before source edits.
- Both planned implementation layers passed their automated checkpoints; final Stage 7 checks passed. Final Stage 8 report retained a browser-acceptance limitation.
- The latest user message acknowledges completion of the intended implementation and requests this documentation. Do not relabel unexecuted browser checks as PASS or claim deployment on that basis.
- No session artifacts were written before the documentation request. This handoff and its index entry are being created under that request; `PROJECT_CONTEXT.md` and the engineering contract remain unchanged.

## Pre-existing worktree changes

These existed before the product work and were preserved; do not attribute them to the implementation or discard them:

- `docs/README.md`: six deleted lines relative to HEAD.
- `docs/TECH_DEBT.md`: deleted, 223 lines.
- `docs/packages_information/INFRA_LOGIC.md`: deleted, 501 lines.
- Untracked `.agents/`, `AGENTS.md`, `docs/development_history/TECH_DEBT.md`, and `docs/engineering/` framework/session material.

The snapshot's new handoff/index edits are documentation work requested after the implementation. `git diff --stat` does not include untracked product files; use the complete inventory and manifest below.

## Resume boundary and exact next safe action

1. Read this record, then verify current HEAD, `git status`, scoped diff, and the product-file manifest. Revalidate test freshness and approvals under Stage 0 before any new engineering work.
2. Treat the completed local implementation as delivered, with browser/rollout evidence still distinct. Do not automatically resume archived work, bulk recalculation, publication, or unrelated fixes.
3. If browser acceptance or release work is requested, establish the authorized environment and scope first. No additional product-code change is currently requested by this handoff.

`PROJECT_CONTEXT.md` synchronization remains available on a separate explicit request.

## Product-file snapshot manifest

The following SHA-256 values pin the uncommitted product/test files at documentation time. They are content fingerprints, not test logs or approval records.

```text
f43ba6ea073f98f558a1d6769105f643dbfde3b40109523bb0e150135ed9c20b  packages/display-runtime/src/index.ts
12e0c18f6b191f7a73ca087e806be671037d2b2f40ea4d4e621c26fce1e961d4  packages/display-runtime/src/session.ts
126aa7541977e80538971d0fcbd22d2625d253b44ddcb0c15c8c81c1950389e2  packages/display-runtime/src/viewport.ts
956f701d2f825e0127924bb2f255b5de2981605677269ce2a594635e9fa5867e  packages/display-runtime/tests/measurement-start.test.mjs
414cef3d4748a2bcb82cca956d65b18be916fed20416d2746cfcc6b705955ad9  packages/frontend/src/app/(workspace)/campaigns/[uuid]/page.tsx
99c3a837c14d79d5a7246cc9f44a1f82ab50cad92f143c84891ec4525a28d94f  packages/frontend/src/app/admin/impressions/page.tsx
bde0c42483e3f0fbdd7824c9c8d39a7f54eb4c9745a586590a0b376947d6a6a2  packages/frontend/src/app/admin/signals/page.tsx
867c7aca1f8731441e935ec519473f2138112d218bb698f983e36b22b5183523  packages/frontend/src/app/admin/users_panel/page.tsx
df6580c8b40cbdecbd08d29cae61a9eaafb8f0e91648e506f0ab6588d6c4b1e7  packages/frontend/src/components/admin/Filters.tsx
edc6fb22b3ea4856b05d3b9b40be42369e0f11f5fd5ae72c2787cb8197e3174e  packages/frontend/src/components/admin/ImpressionDetail.tsx
46b33f162986a278b5f037241b9b721f975cb0de362ff3ac126fcf5a82e18d6f  packages/frontend/src/components/admin/ImpressionsTable.tsx
0e4d8f5e46ad28f8754bf717a0a8b84ad4735654c8058267f86d92978a209ea0  packages/frontend/src/components/admin/SignalModelsPanel.tsx
e582fd12fc89ba6a4655aca6359ba481a7ffddc05cc38996d6c1ae496b19b4bd  packages/frontend/src/components/admin/UsersPanelTable.tsx
51195270c81f731fa2acbfe8c3254c15390ba248c278e0cb2748f199663169e6  packages/frontend/src/components/shared/CreativeActivityBadge.tsx
ce65cb280b43de14d330443f9fd4eda2ad74481ce52276168ea919a75148abc0  packages/frontend/src/components/shared/InlinePlacementForm.tsx
c05078c73564d0e7d092a4ba28b7a9a1d16661ca82873f92a89225f3de6dcce0  packages/frontend/src/components/shared/WorkspaceNav.tsx
da5d90376107f735641763074b983d3bbace02d5e6d06161fdb78daf2a8789a8  packages/frontend/src/components/user/Filters.tsx
5da0d7b1ef235dc5636cc4d12f42dc752df03f40461d30137c52df9ca76caf8d  packages/frontend/src/components/user/ImpressionsTable.tsx
cb7ceb98a509f188c588a5c026a58df53c090f1eb9cbdec049bb7075f5306da4  packages/frontend/src/lib/admin/search-params.ts
feb79b151c80d4aa75144d7b19a3b5dd3d0e2300ca78bac33e3a944bf4e30ce0  packages/frontend/src/lib/admin/signal-model-presentation.ts
f29b624ca87d82bf458a00203c86124a3ef0a5e6d383b3412bbd910d6730b527  packages/frontend/src/lib/admin/types.ts
e36351b3ce273addc4ac7ebcd543b888b2a90298f2b7aa9279616720eecb2705  packages/frontend/src/lib/user/search-params.ts
a065b64a44afe1fabcb29316feac1b83606fb80e0dfb50af62b5f9362d9511ef  packages/frontend/src/styles/creatives.module.css
0b4366163a11d746a8837c57d55b917ca4077097380ea0f3d141fd3fa9ba0547  packages/frontend/src/styles/users_panel.module.css
e74456c654bb7096ead4c821c5609e79c6618ebf49d57ced4cc0827a6416e5a0  packages/frontend/tests/frontend-regressions.test.mjs
b8a4f69d6489b8d28e353009cf7697d00b0db21000c2efc7e134dd2a721337b3  packages/frontend/tests/placement-ui.test.mjs
```
