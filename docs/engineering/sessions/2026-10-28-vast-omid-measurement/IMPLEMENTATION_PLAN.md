# Implementation Plan — OMID-access-P1 / revision 1

Status: IMPLEMENTED; local Stage 8 validation PASS, awaiting user acceptance. Product/test edits were made only after explicit Stage 5 approval of this revision.

- Task: OMID-access-r1; approved proposal: OMID-access-M1 revision 1.
- Approval evidence: explicit confirmations at Stages 1–4, followed by the user's Confirmed immediately after the presentation of OMID-access-P1 revision 1, authorizing implementation and planned checks.
- Baseline: 7ae417b69b65c669e64c7e27b0daf3b977430e7b. The only pre-existing worktree change is the authorized session HANDOFF.md; preserve it.
- Environment: Node 22.23.2, existing pnpm/dependencies. Baseline OMID typecheck + 36 tests and SDK typecheck + 14 tests passed. Those checks do not cover the browser scenario below.
- Observed IMA evidence: full access, missing friendlyToTop, readable top DOM, verification window different from top, and the supplied videoElement belongs to the top document.

## Scope and invariants

1. Require an explicitly reported full access mode and a successful actual top-document check before attempting full measurement. Missing diagnostic friendlyToTop must not veto that check.
2. Limited, domain, unknown, or missing access modes remain partial even if some DOM is accessible. Inaccessible top DOM with full access remains creative.
3. Retain the exact videoElement/slotElement supplied by OMID. Full measurement requires an element of the chosen top document; a missing, detached, inaccessible, or other-document element falls back to partial. Do not select an arbitrary video or convert frame coordinates.
4. Execute the existing full SDK branch in that top window, with its factory read from the same window. Preserve per-ad session identity, independent signal state, and sticky element tracking.
5. Reuse only a factory for the requested OMID runtime version. Keep different runtime versions separate; do not reuse an old unversioned factory.
6. Failed, timed-out, stale, or unsuccessful startup must not suppress partial collection or start a full session after that run ended/replaced. Avoid duplicate final payloads.
7. Leave SDK source, formulas, signal models, weights, backend ingestion contracts, database schema, player controls, and ordinary script source unchanged.

Duration-from-start, final geometry interval accounting, and limited S5 scoring remain separate tasks. Existing media mapping is not being redesigned; this task does not certify every S6 submetric. Newly exposed blockers outside this scope require a revised proposal/plan.

## Expected files

Product paths, bounded to OMID:

- packages/omid/src/gate.ts — actual accessible-top-window resolution and access classification; correct the diagnostic-field comment.
- packages/omid/src/index.ts — resolve the target window once for an eligible run, pass it to the loader, guard asynchronous startup and preserve partial fallback.
- packages/omid/src/global.ts — explicit target-window factory reads and runtime-version-specific namespace; publication remains in the executing full bundle's own window.
- packages/omid/src/loader.ts — load into the verified target document; read the factory there; bound/coalesce concurrent loads for the same window/version, with target-owned timeout and retry after failure.
- packages/omid/src/full.ts — validate the supplied element/document before SDK initialization; publish the matching-version factory. Preserve existing video-event mapping.
- packages/omid/src/types.ts — clarify diagnostic context fields and any internal window/factory contract typing needed above.

Tests/docs:

- Existing packages/omid/tests/gate.test.ts, loader_contract.test.ts, full_mapping.test.ts.
- New packages/omid/tests/entry_access.test.ts — entrypoint startup, fallback and asynchronous run isolation.
- New packages/omid/tests/browser_access.mjs — standalone local browser regression runner; generated fixtures/stub OMID event source are contained in this runner or temporary artifacts.
- docs/packages_information/OMID_LOGIC.md — correct access/document/factory assumptions.
- This plan and HANDOFF.md — concise actual results/remaining limitations.

New test paths are forecasts. No dependency, package manifest, SDK, backend, infrastructure or environment-file changes are planned. A material need for such changes stops implementation for re-approval.

## Internal contract decisions

- Access resolution receives the result of a real DOM check; friendlyToTop is diagnostic metadata rather than an authorization signal.
- Probe top only for a reported full mode; catch cross-origin/security exceptions and remain partial.
- Loader target and factory lookup target are the same verified Window. Use a namespace containing contract identity and runtime version.
- Each factory.start call creates an independent SDK session from its own supplied element, metadata and session ID. Share loading/factory code only.
- Concurrent loads share bounded target-window/version loading state; remove failed pending state so a later attempt can retry. Do not use cross-realm instanceof checks.
- Reject incompatible elements in the full branch before creating SDK observers/timers; preserve fallback if startup throws or returns null.
- Keep existing partial endpoint selection and full-versus-partial finalization behavior; check that delayed callbacks cannot create orphan sessions.

## Ordered layers and checkpoints

| Layer | Expected change | Mandatory checkpoint |
|---|---|---|
| L1 | Gate behavior and diagnostic types/comments; update only the index access-classification call, keeping the existing loader call until L2 | TEST-GATE: target full/missing-field case, denied DOM, conflicting diagnostic values, top-level and iframe contexts; tests + typecheck must pass |
| L2, after L1 | Target-document loading and its index caller, versioned factory lookup/publication, concurrent loading and element/document guards | TEST-FACTORY and TEST-ELEMENT: correct window/version, two callers, load/error/timeout/retry, wrong-document/absent/detached element; no SDK initialization on rejection |
| L3, after L2 | Entrypoint lifecycle/fallback guards; complete integration tests and documentation | TEST-ENTRY: successful full startup, partial fallback, thrown/null initialization, late resolution after finish/replacement, exactly one finalization path |
| L4, after L3 | Execute browser regressions and final package verification; review actual diff against all invariants | TEST-BROWSER, TEST-REGRESSION, TEST-BUILD and TEST-DIFF; record exact results and remaining limitations |

Approval of this plan authorizes automatic progression through these checkpoints only after their checks and scoped layer validation pass. No additional user checkpoint is required between passing layers. If a check fails, triage it; bounded corrections caused by this change within these files/invariants may use the Stage 9 → 7 → 8 loop. Material scope, security, compatibility, architecture or acceptance changes require a revised approval. Final Stage 8 acceptance remains a user decision.

## Acceptance and verification traceability

| AC | Test IDs / procedure | Expected evidence | Local status |
|---|---|---|---|
| AC1: full plus accessible top works without friendlyToTop | TEST-GATE, TEST-BROWSER-FULL | full_page selected, full bundle executes in top, exact supplied element retained | PASS: gate/entry tests, full-child and full-top fixtures |
| AC2: restricted/unknown/denied contexts stay partial | TEST-GATE, TEST-BROWSER-DENIED | no top SDK launch, one partial payload | PASS: gate/entry tests, limited/domain/denied fixtures |
| AC3: correct document and coordinates | TEST-ELEMENT, TEST-BROWSER-FULL | element ownerDocument equals SDK execution document; page context/viewport are top's | PASS: full_mapping tests; browser document and viewport assertions |
| AC4: failure preserves collection | TEST-FACTORY, TEST-ENTRY | blocked/error/timeout/init failure and late completion keep a single valid finalization route | PASS: loader/entry tests and error/CSP/timeout/late-finish fixtures |
| AC5: sticky and concurrent ad isolation | TEST-BROWSER-STICKY, TEST-BROWSER-MULTI | movement remains tied to the same element; two IDs/elements produce separate payloads and lifetimes | PASS: sticky movement; independent clicks/finalization; one bundle request for two creatives |
| AC6: ordinary script compatibility | TEST-REGRESSION, TEST-BROWSER-SCRIPT | existing SDK tests pass; real tag source runs in a separate ordinary-script fixture and produces a valid full payload | PASS: SDK 14 tests and ordinary-script browser fixture |
| AC7: version coherence and rollback boundary | TEST-FACTORY, TEST-BUILD, TEST-DIFF | wrong-version/legacy factory ignored; new version builds; old runtime assets and DB untouched | PASS locally: version tests, old-factory fixture, v2 build, scope review; deployment/rollback execution NOT_RUN |

Unit tests may stub DOM/SDK/client boundaries; they do not establish real browser access. The browser runner uses actual Chromium DOM/layout, real OMID entry/full code and SDK, but an explicit simulated OMID event producer and a loopback collector. It validates full payload shape and finite Score computability with shared scoring/default configurations, not production model values or a production DB write.

Browser cases: same-origin verification child with a top-document creative and missing friendlyToTop; direct top execution; cross-origin/denied frame; limited mode despite reachable DOM; missing/other-document element; load failure and delayed resolution after finalization; sticky scroll/fixed positioning; two simultaneous creatives with independent finish; wrong-version existing factory; ordinary tag collection. Compare ad IDs, observed elements, document/viewport, payload route and finalization counts. Capture console/runtime errors.

Use the installed Chrome executable at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome with a fresh temporary profile and Node CDP/WebSocket driver; no new browser dependency is required. Bind fixture servers/debugging to loopback only; use synthetic IDs/local URLs and shut down only task-owned processes. Save JSON/log evidence under a new /private/tmp/cpmind-omid-access-* directory. If sandbox execution needs approval, prepare the concrete runner first and request it through the tool. A blocked browser check cannot be reported as passing.

## Commands

Run with Node 22.23.2 selected in PATH. Build unchanged prerequisites once, then run scoped tests as layers change:

~~~bash
pnpm --filter @cpmind/shared build
pnpm --filter @cpmind/sdk build
pnpm --filter @cpmind/omid test
pnpm --filter @cpmind/sdk test
OMID_RUNTIME_VERSION=2 pnpm --filter @cpmind/omid build
node packages/omid/tests/browser_access.mjs
git diff --check
~~~

Version 2 is a local verification build value, not authorization to change server .env. Record pnpm/browser versions, commands, exit statuses and artifact paths. Repeat affected checks after corrections; do not repeat unchanged suites without cause.

## Release and recovery

- Do not commit, push, upload runtime bundles, deploy, edit server .env, change models, migrate or recalculate historical data under this plan.
- Local recovery: stop task-owned servers/browser, preserve unrelated user/session edits, and retain logs. Never reset the worktree or overwrite user changes. Prepare a bounded revert if requested.
- Future user-authorized release: separate commit; a new unused OMID runtime version built/published without overwriting immutable prior URLs; backend delivery must reference that same version. Retain prior backend image and runtime configuration.
- Future rollback: restore the prior compatible backend image/runtime version and recreate the affected service through the approved deployment procedure. Existing recorded impressions remain; already-open tabs may require reload. No DB rollback/migration is planned.
- Actual Google IMA retest with the new published runtime is a user-operated post-release check; it is unavailable before publication and must not be represented as completed by the local fixture.

## Approval

OMID-access-P1 revision 1 was explicitly approved before edits. HEAD remained at the baseline; no manifest/lockfile or unrelated product changes were introduced. Layer checkpoints passed and continued under the approved automatic policy.

## Executed evidence and final local validation

Environment: Node 22.23.2; pnpm 10.17.1; Chrome 150.0.7871.125. Product changes are limited to the six planned OMID source files; SDK, shared scoring, backend, player, tag, dependencies, infrastructure and server environment are unchanged.

| Check | Actual outcome / evidence |
|---|---|
| Prerequisites | shared build and SDK build: exit 0 |
| L1 / TEST-GATE checkpoint | typecheck + 46 package tests passed; /private/tmp/cpmind-omid-access.njhaIS/L1-retest.log |
| L2 / TEST-FACTORY, TEST-ELEMENT checkpoint | typecheck + 57 package tests passed; /private/tmp/cpmind-omid-access.njhaIS/L2-retest-final.log |
| L3 / TEST-ENTRY and final OMID source checks | typecheck + 69 tests passed; /private/tmp/cpmind-omid-access.njhaIS/L3-tests.log |
| TEST-REGRESSION | SDK typecheck + 14 tests passed; /private/tmp/cpmind-omid-access.njhaIS/sdk-regression.log |
| TEST-BROWSER | 16/16 scenarios passed, 17 final payloads, zero Runtime exceptions; seven complete payloads validated and scored with shared defaults; /private/tmp/cpmind-omid-access-browser-k9X3Eo/results.json |
| TEST-BUILD | OMID_RUNTIME_VERSION=2 pnpm --filter @cpmind/omid build: exit 0; loader 49.5 KB, full 58.7 KB; successful exec session 82844 |
| TEST-DIFF | git diff --check: exit 0; no changes outside approved source/test/docs scope |

Earlier check failures were test-fixture corrections: an optional-property test type (L1), an afterEach return type (L2), and a mistaken expected loader URL (L2). They were corrected and the affected checkpoint rerun successfully; initial logs remain alongside final logs. Sandbox denied the browser loopback listener and tsx IPC socket with EPERM; both checks subsequently passed with explicit tool approvals. No failed product regression remains.

| Engineering review domain | Assessment |
|---|---|
| Access/security | PASS for tested boundaries: explicit full required, actual top-DOM read, denied/limited contexts stay partial; no permission or CSP bypass |
| Architecture/document ownership | PASS: factory executes in selected document; exact supplied element and matching ownerDocument required; no SDK rewrite or arbitrary video selection |
| Business/scoring/data contracts | PASS within scope: full payload schema and finite Score with shared defaults; formulas untouched. Production model values/DB writes not exercised |
| Concurrency/recovery | PASS: one matching-version asset for two clients, independent session IDs/clicks/finalization, retry after error, bounded timeout, late/stale callback guards |
| Compatibility | PASS for existing SDK tests and actual tag source in Chromium fixture. Safari/Firefox and new-runtime Google IMA playback remain NOT_RUN |
| Resource/performance | PASS for bounded/coalesced loading and timer cleanup assertions; no load/scale benchmark or broader performance claim |
| Observability/operations | Existing full/partial payload distinction retained; failure-reason telemetry unchanged. Publication and real rollback are NOT_RUN, outside current authorization |
| Scope/maintainability | PASS: approved OMID changes, focused tests and documentation; no migrations, new dependencies, infrastructure edits or unrelated refactors |

Recommendation: accept the implementation on local evidence, then obtain separate release authorization and perform the user-operated IMA FULL/LIMITED retest. This is not a claim that every player will permit full measurement. Duration-from-start, final geometry intervals and limited S5 remain explicitly unresolved separate observations.
