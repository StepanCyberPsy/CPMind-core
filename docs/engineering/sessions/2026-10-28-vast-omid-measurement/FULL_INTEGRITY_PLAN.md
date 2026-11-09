# Implementation plan — OMID-full-integrity-P1 / revision 1

Status: IMPLEMENTED; final LOCAL Stage 8 validation PASS, awaiting user acceptance. Stage 5 approval is the user's Confirmed immediately after presentation of P1 r1. On 2026-11-09 the user initially requested continuation without tests, then explicitly approved the listed final local checks with Confirmed. Go ahead. Those checks are now complete; production/server checks remain with the user.

## Authority, baseline and boundaries

- Approved task: T1 r1; audit: A2 r1; discovery: C3 r2 (supersedes the incorrect legacy-tag primary regression surface); modification proposal: M1 r1. Approval evidence is the user's explicit confirmations/continuation in the conversation, including Confirmed immediately after M1 r1.
- Baseline: `80f0c2e2f31e5738483c2f69c77cdbdf65c455b1`. Only authorized HANDOFF.md notes differ; preserve them. Revalidate before implementation.
- Local environment: Node 22.23.2, pnpm 10.17.1; installed Chrome and `/usr/local/bin/ffmpeg`. Existing SDK typecheck + 14 tests and OMID typecheck + 69 tests passed during A2.
- Objective: avoid overlapping duplicate FULL measurements of one OMID ad run, and preserve reported 25/50/75 quartiles through the actual SDK and serialization. Different genuine runs must remain independent.
- Do not edit embed, loader, player, display-runtime or legacy-tag product source; backend, VAST XML, shared network schemas, DB, models, scoring formulas, dependencies and environment files remain unchanged. Duration-from-start, initial audio mapping, LIMITED interval accounting and metadata corrections are excluded.

## Expected paths

Product:

- `packages/omid/src/full.ts`: acquire/reuse measurement ownership; opt into event-based SDK quartiles; release active references on actual SDK finalization.
- `packages/omid/src/index.ts`: identify repeated session notifications; pass OMID run identity; preserve pre-load media events; prevent stale finish/media callbacks from acting on another run; suppress duplicate partial fallback after an already successful full claim.
- `packages/omid/src/types.ts`: revise the private same-version factory input contract to carry OMID run identity and document duplicate handles.
- New forecast `packages/omid/src/full_sessions.ts`: small internal ownership registry, no SDK/DOM selection logic or general-purpose cache framework.
- `packages/sdk/src/public_api.ts`: optional `videoQuartileSource: 'progress' | 'events'` input, default `progress`; handle quartile reports only for explicit event mode.
- `packages/sdk/src/signals/s6.ts` and `packages/sdk/src/types.ts`: accumulator source setting/default, idempotent event-based quarter flags, and unchanged default progress/seek behavior.

Tests/docs:

- Extend OMID `entry_access.test.ts`, `full_mapping.test.ts`, and relevant factory contract tests; extend SDK `s6.test.ts`.
- New forecast `packages/sdk/tests/public_api_quartiles.test.ts`: actual public API and payload serialization, stubbing only DOM/transport boundaries as needed.
- New forecast `packages/omid/tests/full_sessions.test.ts`: owner lifecycle and cleanup with fake time.
- Extend `packages/omid/tests/browser_access.mjs`: actual SDK and actual embed loader/player source regressions; retain existing cases, including the secondary legacy banner fixture.
- `docs/packages_information/OMID_LOGIC.md`, this plan and HANDOFF.md: concise behavior, evidence and limitations.

No other product files are planned. A material need for another component, dependency or contract requires revised approval.

## Implementation decisions

### One owner per full OMID run

1. Ownership resides in the shared full factory executing in the verified top document; it is separate from the existing shared bundle-load promise. Runtime versions remain isolated.
2. Identity uses delivery `sid` plus the OMID session event's `adSessionId`. If that external identity is absent/empty, use the existing finite session-start timestamp as a compatibility fallback. Do not key solely by creative, element or delivery sid; legitimate distinct OMID runs must not be merged. The fallback cannot guarantee deduplication when a player changes timestamps and supplies no stable identity.
3. The first successful caller owns SDK initialization, media forwarding and finalization. Other callers for the same identity receive a non-null passive handle: no new SDK, no duplicate forwarding/finalization and no second partial payload. The existing owner continues measuring.
4. Reject conflicting immutable metadata/creative-element ownership instead of merging unrelated ads. Retain the exact OMID-supplied element and all existing top-document/access checks. A failed first initialization releases its claim and preserves partial fallback; a subsequent valid caller may retry.
5. Repeated sessionStart in one verification instance must not replace its active run or register duplicate listeners. Route finish/error by matching OMID identity; ignore stale notifications. Buffer media while eligible full loading is pending, then replay once in arrival order to the successful owner. Bound the queue at 256 events; on overflow keep partial collection and do not start an incomplete full session. Do not alter LIMITED aggregation.
6. SDK onFinalized (including DOM removal/page unload) closes ownership and releases SDK/element/media references. Duplicate arrivals after closure receive a passive terminal handle. Keep compact completed identities for 30 minutes, at most 1024 per top-document/runtime; evict expired/oldest completed entries, never an active owner. These are proposed internal safeguards, not existing product limits. Deduplication after eviction or across page reloads is outside this browser-only guarantee; server-wide idempotency is not added in this task.

### Opt-in quarter events

1. Existing SDK users default to progress mode. Existing constructor calls and accumulator calls remain compatible; player/embed/display/legacy source does not opt into the new mode.
2. Only OMID full.ts explicitly chooses events mode. Record the reported quarter itself, independently of duration/progress, and only once. A reported 75 must not fabricate 25/50. Duplicate notifications must not retrospectively change the original audible-quarter flag. Preserve current known SDK mute/volume semantics; initial OMID audio mapping remains excluded.
3. In events mode, completion and progress must not synthesize missing 25/50/75 flags. Keep existing completion handling otherwise; do not derive synthetic progress, watched time, duration or position from quarter events. Do not redesign scoring features.
4. Progress mode retains watched-frontier checks, seek protection, pause/resume, replay, and existing completion behavior. A quarter report alone must not make a default progress-mode session count a seek as viewing.
5. Segment reset clears quarter evidence without changing the selected source mode. Events before measurement or after finalization do not create viewing credit. Keep the public event schema unchanged, including its existing 100 value; handling that value must not infer missing lower quarters or trigger completion on its own.

## Layers and checkpoints

| Layer | Scope | Mandatory checkpoint |
|---|---|---|
| L1 | SDK opt-in quarter source and focused tests | Typechecks and SDK suite pass; actual public API serialization proves both modes, missing/duplicate/out-of-order quarters, reset and sound cases; default seek tests remain green |
| L2 | OMID owner registry, entry identity/buffering, event-mode integration | OMID suite passes; duplicate same-run callers prepare/finalize SDK once, independent runs stay independent, failure/late-loading fallback remains valid |
| L3 | Browser regression additions | Real Chromium tests pass for duplicate verification frames, one/different runs, quarter payloads, and actual async embed loader/player with local video; previous access/sticky/loading/version cases pass |
| L4 | Final build, typechecks and review | All required commands pass, scope/diff review passes, and AC evidence/limitations are recorded |

Approval authorizes automatic progression through these checkpoints after a passing layer validation; do not request another approval between passing layers. Reproduction tests should show the pre-fix failure where feasible, then pass after the scoped fix. Record compilation/tooling failures honestly. Bounded corrections within this plan may use Stage 9 followed by affected testing/validation. Material scope or behavior changes stop for re-approval. Final acceptance is a separate user decision.

## Acceptance and test matrix

| AC | Test | Required result |
|---|---|---|
| AC1 same-ad uniqueness | TEST-OWNER / TEST-BROWSER-DUP | Two clients, repeated start, delayed/repeated finish and post-finalization arrival within retention: one SDK owner, one unique final impression payload, no extra partial payload |
| AC2 independence | TEST-INDEPENDENT | Concurrent distinct sids, distinct OMID runs reusing a video, separate creatives: independent IDs, events, finalization and signal state |
| AC3 delivered quartiles | TEST-QUARTILE / TEST-PUBLIC / TEST-BROWSER-OMID | Both video formats: actual SDK final payload has exactly received 25/50/75 evidence; no-duration, missing/repeated/out-of-order events and completion-only cases behave explicitly |
| AC4 script compatibility | TEST-BROWSER-EMBED / TEST-PUBLIC-PROGRESS | Actual embed loader/player sources and actual SDK: normal progress reaches quarters/completion, forward seek does not receive unearned viewing credit, pause/resume/mute/replay remain correct; one unique final payload per genuine run |
| AC5 access/failure compatibility | Existing plus TEST-ENTRY | LIMITED/domain/denied/invalid element/error/CSP/timeout/late finish preserve partial collection; delayed full loading buffers media without double forwarding |
| AC6 resource/lifecycle | TEST-OWNER-CLEANUP | SDK removal/finalization releases active references; completed retention expires/caps correctly; no active run eviction; separate runtime state remains isolated |
| AC7 overall verification | TEST-BUILD / TEST-TYPES / TEST-DIFF | SDK + OMID suites, package builds/typechecks, unchanged integration-source diff and browser scenarios pass; full payloads satisfy shared schemas and produce finite Scores with shared defaults |

Browser OMID events remain explicitly simulated; DOM/layout and measurement code are real. For embed, use a fixture `/e/<token>.js` configuration response consistent with the inspected backend output, then actual embed loader and player source. Generate a small local MP4 with installed ffmpeg; serve all assets/collector on loopback. Report that backend configuration/DB and real publisher behavior are not exercised. Exercise actual media playback; controlled event sequences may supplement it for seek/pause boundary assertions but must be labeled. The loopback collector counts unique final payloads and validates serialization; it is not proof of a production DB transaction. Actual IMA plus server DB retest remains required after a separately authorized release.

## Commands and evidence

Use Node 22.23.2 in PATH. Run the smallest applicable subset at each checkpoint, then the final required set; do not repeat unaffected checks without reason.

```bash
pnpm --filter @cpmind/shared build
pnpm --filter @cpmind/sdk build
pnpm --filter @cpmind/sdk test
pnpm --filter @cpmind/omid test
OMID_RUNTIME_VERSION=3 pnpm -r --workspace-concurrency=1 build
pnpm -r --workspace-concurrency=1 exec tsc --project tsconfig.json --noEmit
pnpm --filter @cpmind/backend exec tsc --project tsconfig.test.json --noEmit
node packages/omid/tests/browser_access.mjs
git diff --check
```

Version 3 is solely a local immutable-runtime build candidate; do not publish, change server .env or deploy. Ordinary runtime builds may change generated ignored files but do not authorize publishing them under existing CDN versions. Browser temporary artifacts belong under `/private/tmp/cpmind-omid-integrity-*`; capture commands, exit statuses, versions, test counts, JSON observations and runtime errors. Clean up only task-owned servers/browser processes. Use tool escalation if sandbox restrictions block browser/network/filesystem work; never substitute unexecuted checks with a pass.

## Review, recovery and gates

- Review source and actual diffs for default behavior preservation, per-run ownership, failure cleanup, fallback, schema compatibility and exclusions. No new security privileges or production operations are planned. Existing page-access checks must not be weakened.
- If a checkpoint fails, retain evidence and fix only the authorized behavior, then rerun affected checks. If real embed behavior reveals an unrelated problem, report it and stop the affected acceptance claim rather than editing embed automatically.
- No commit, push, production data cleanup, database restore or deployment is authorized. Recovery before commit is a scoped reviewed reversal of this task's changes, preserving existing notes and user edits; do not use broad reset/checkout commands.
- Prior v2 immutable assets remain available. Any later release must publish both new OMID bundles before switching backend selection; SDK default consumers need no runtime version change unless separately approved.
- Final report must distinguish local PASS/FAIL/NOT_RUN from real IMA/DB evidence and request user acceptance. Do not update PROJECT_CONTEXT.md.

## Implementation history and prior verification checkpoints

L1/L2 were implemented before interruption: event-based SDK quarter handling, OMID ownership/entry guards, bounded buffering/retention and focused tests. SDK typecheck + 24 tests and OMID typecheck + 83 tests passed (exit 0). Reproduction runs before the fixes showed dropped quarters and two SDK preparations for the same run. The initial public-API fixture lacked document state and the older entry fixture used a mismatched finish identity; these test-fixture issues were corrected and the suites passed.

L3 passed before interruption: `node packages/omid/tests/browser_access.mjs`, exit 0, 26 browser scenarios, 28 final payloads, zero Runtime exceptions. Evidence: `/private/tmp/cpmind-omid-integrity-browser-XQdG7W/results.json`, Node 22.23.2 / Chrome 150.0.7871.125. Coverage includes duplicate/late verification clients, both OMID video formats, missing/out-of-order quarters, delayed loading, unchanged embed loader/player In-Stream and Out-Stream, real seek, and two genuine embed cycles sharing a delivery sid with independent impression IDs. SDK/DOM/media decoding are real; OMID events, backend configuration and media network responses are fixtures. MP4 bytes were generated locally and its trusted HTTPS URL fulfilled locally through CDP with byte ranges. Earlier browser failures were fixture route matching, missing byte-range handling and an incorrect expectation that a fresh configured-muted second cycle must be audible; those fixtures/assertions were corrected before the full PASS.

Resume on 2026-11-09: HEAD remains the approved baseline; product changes match this task, and excluded integration sources remain untouched. The existing browser JSON was read, not re-executed. Final source review removed an initialization-error call to SDK destroy(): destroy finalizes/sends a record and could have emitted a full impression before partial fallback. Exceptions now release the registry claim and follow the existing partial path without that explicit send. Failed registry initialization also disables its abandoned close callback, preventing it from deleting ownership of a later successful retry; two regression cases (null/throw) were added but NOT RUN. These final OMID source adjustments are NOT RETESTED; affected test/browser results are historical and do not certify the adjusted error path. SDK source was not further changed on resume.

| Area | Current evidence/status |
|---|---|
| AC1–AC3 full ownership/quarters | Historical unit/browser PASS; final OMID error-path adjustment NOT RETESTED |
| AC4 embed compatibility | Historical real loader/player browser PASS; their product source remains unchanged |
| AC5–AC6 fallback/lifecycle | Historical unit/browser PASS; final error-path adjustment NOT RETESTED |
| AC7 complete workspace build/typechecks | NOT_RUN for this implementation; earlier SDK build/typechecks do not substitute for the final workspace checks |
| Production IMA/DB retest | NOT_RUN; no publication/deployment performed |

No tests, builds or typecheck commands were executed in the resumed turn, as requested. No final Stage 8 PASS or production-readiness claim is made. Next action, when the user authorizes verification: execute the remaining checks on the final source, review results, then obtain final acceptance before a separately authorized release. No commit/push or project-context synchronization performed.

## Final local validation — 2026-11-09

The subsequent user instruction Confirmed. Go ahead. authorized the final run and supersedes the pending-check status above. Baseline is still `80f0c2e` plus the approved task diff. Node 22.23.2, pnpm 10.17.1, Chrome 150.0.7871.125. No product changes were made during final verification; hashes of seven product files and six test files remained unchanged. No excluded integration source, dependency, lockfile or infrastructure changes.

| Test / command | Result | Evidence |
|---|---|---|
| TEST-BUILD: `OMID_RUNTIME_VERSION=3 pnpm -r --workspace-concurrency=1 build` | PASS, exit 0, 12 packages; frontend 18 pages; OMID loader 50.6 KB / full 60.7 KB | `build-escalated.log` |
| TEST-TYPES: `pnpm -r --workspace-concurrency=1 exec tsc --project tsconfig.json --noEmit` | PASS, exit 0 | `types-workspace.log` |
| TEST-BACKEND-TYPES: `pnpm --filter @cpmind/backend exec tsc --project tsconfig.test.json --noEmit` | PASS, exit 0 | `types-backend-tests.log` |
| TEST-SDK: `pnpm --filter @cpmind/sdk test` | PASS, typecheck + 24 tests / 3 files, exit 0 | `sdk.log` |
| TEST-OMID: `pnpm --filter @cpmind/omid test` | PASS, typecheck + 85 tests / 7 files, exit 0; includes both abandoned-callback regressions | `omid.log` |
| TEST-BROWSER: `node packages/omid/tests/browser_access.mjs` | PASS, 26 scenarios, 28 final payloads, zero Runtime exceptions, exit 0 | `browser-escalated.log` and browser JSON |
| TEST-DIFF: `git diff --check`, excluded-path diff inspection and source-hash comparison | PASS, exit 0 / no excluded source diff / unchanged hashes | `source-hashes.json`, `summary.json`, tool output |

Logs and summary: `/private/tmp/cpmind-omid-integrity-final.khlBV9/`. Current browser evidence: `/private/tmp/cpmind-omid-integrity-browser-ZZvRKD/results.json`. Initial sandbox build failed on tsx IPC socket EPERM; initial sandbox browser run failed on loopback listen EPERM (`.../cpmind-omid-integrity-browser-MCR9Lr/`). Both were repeated with tool-approved escalation and passed; no source change was needed. Browserslist reports outdated caniuse-lite data, a non-blocking warning; dependencies were not updated.

| Acceptance criterion | Current evidence | Local result |
|---|---|---|
| AC1 one FULL measurement per same run | Registry/entry tests; duplicate-verifications including late client has one final payload and no extra partial | PASS |
| AC2 independent genuine runs | Different delivery/OMID identities in unit tests, two-creatives browser; two embed cycles share delivery sid but have two distinct impression/group IDs | PASS |
| AC3 quarters reach SDK serialization | Public API/S6 tests; both OMID video-format cases have 25/50/75=true; missing/out-of-order cases preserve only reported flags | PASS |
| AC4 embed compatibility | Real loader/player/SDK In-Stream and Out-Stream playback, real seek, pause/sound and two cycles; original integration sources unchanged | PASS |
| AC5 access/fallback | LIMITED/domain/denied/missing/detached/other document, CSP/error/timeout/late finish, buffer and failed initialization tests | PASS |
| AC6 lifecycle/bounds | Registry cap/expiry/active retention and stale callbacks; window/version isolation and duplicate forwarding/finalization tests | PASS |
| AC7 complete local verification | All commands above, schema-valid payloads and finite shared-default Scores, scope/diff review | PASS |

| Engineering-review domain | Invariant / evidence / residual limit | Result |
|---|---|---|
| Architecture and compatibility | OMID-only ownership; event mode explicitly opted in; existing progress API calls and integration source preserved | PASS locally |
| Business logic and errors | No synthetic missing quarters, first quarter audibility retained; passive duplicates; failed claims/late callbacks covered | PASS locally |
| Concurrency and recovery | Shared load versus per-run ownership; distinct identities; repeated starts/finish, bounded queues and terminal records | PASS within the approved page/runtime/retention boundary |
| Data/API contracts | Actual SDK serialization satisfies existing schemas; no network/schema/DB changes; finite Score computation uses shared defaults | PASS locally; production models/DB NOT_RUN |
| Security boundaries | Existing explicit-full/top-document checks retained; denied/CSP/wrong-document negative cases pass; no new permissions in product | PASS for scoped boundary preservation; comprehensive security audit NOT_RUN |
| Resources/performance | Tests exercise queue/record bounds, expiry and active-owner preservation; no dependencies added | PASS for bounded behavior; load/heap profiling NOT_RUN, no performance SLO claimed |
| Observability/maintainability | Focused owner registry, explicit source-mode default, documented limits and retained command/browser evidence | PASS for this change; unrelated metadata corrections remain excluded |
| Delivery/operations | Only local builds; no publish/commit/deploy or server access | PASS for authorized scope; production rollout/rollback execution NOT_RUN |

Both reported issues are VERIFIED locally, not CLOSED by user acceptance. Final local recommendation: PASS. Browser OMID producer/backend configuration/media network replies remain fixtures; actual browser decoding, integration sources and SDK are real. Live IMA/AdWebs and server DB checks are NOT_RUN and belong to the user.

Release boundary: the workspace build also rebuilds other runtimes containing the shared SDK under their current filenames. Do not publish those outputs over existing immutable CDN assets. A separately authorized release should publish only the two new OMID v3 assets, leaving existing embed/player/display versions intact; no server environment was changed here. Final user acceptance is pending. Project context synchronization remains available only by explicit request.
