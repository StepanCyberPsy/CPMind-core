# CPMind Session Handoff — VAST Delivery with OMID Verification

## Follow-up — 2026-11-06: AdWebs measurement and limited S5

Recorded at the user's request; investigation notes only. No changes to measurement code, models, or configuration are authorized by this entry.

- The user deployed commits `17e6e61` (VAST rendition roles) and `7ae417b` (credentialed CORS for OMID collection). User-provided checks showed a healthy backend/database, successful preflights, and a stored impression. This does not establish complete signal coverage across players.
- Client clarification, relayed by the user: outstream commonly has no close button, timeline/seeking, play/pause, or mute/unmute controls. This is context about the observed player, not proof of a universal default or of incorrect implementation. Missing controls do not explain all measurement results by themselves.
- Direction: report actual measurement coverage and uncertainties transparently; avoid player-specific workarounds that could affect working script integrations. Validate the observations below before proposing changes.

### Observations to verify before changes

| Observation | Evidence and remaining check |
|---|---|
| Video duration may be missed | `packages/omid/src/limited.ts:onMediaEvent` and `packages/omid/src/full.ts:toVideoEvent` read duration from `loaded`, but ignore it in `start`. OM SDK supplies duration with `start(duration, volume)`; muted volume `0` is valid independently of duration. Verify actual player events and both OMID branches before changing the adapters. |
| Final observation interval may be omitted | Limited S1/S2/S4 accumulate between `geometryChange` events; `packages/omid/src/index.ts:buildPayload` finalizes audio only. A local synthetic sequence with one geometry event reproduced zero accumulated time/average share despite visible geometry. The original event stream for the production impression was not captured; verify event timing and finalization boundaries before changing interval accounting. |
| Full access detection depended on a diagnostic field | Baseline gate required `context.friendlyToTop === true`. IAB compliance/validation scripts add this field themselves. The user's IMA breakpoint showed `{accessMode: "full", friendlyToTop: undefined, friendlyToTopType: "undefined", topDocumentAccessible: true}`, confirming false downgrade in that run. The approved local implementation now uses actual top-document access and coherent full-branch document binding; see validation below. The paused video was expected debugger behavior. |
| Limited S5 can score a recorded click as zero | User-provided DB row: impression `5e575d4a-717e-4143-a7c0-16b63d2fbfd8`, `vast_omid`, `limited`, desktop, constants `v4`; `clicked=true`, other S5 features `null`. Model `43866bc8-e559-45e8-af33-a9929444a55b` has `beta0=-6.468453208357614`, `beta1=0`. Normalization substitutes zero for unavailable hover/cursor inputs: the reproduced result is approximately `0.154922`, rounded to `0`. Determine why the click coefficient is zero and how incomplete observations should be scored; do not infer that the user did not interact. |

The user reports moving the cursor, hovering, and clicking several times. Currently, the limited collector stores only a boolean click flag. Signal normalization functions/model selection are shared with script collection; active DB parameters can override `signal_defaults.ts`. Tag collection constants, signal-model parameters, and aggregate Score weights are distinct. For partial OMID, `omid:1` is a runtime provenance marker in `weights_version`, not a weight profile; aggregate Score is intentionally absent.

Google IMA Inspector follow-up, from the user's DB output: in-stream/out-stream LIMITED impressions `a74fa003-8e55-45ef-9e7a-b386510d8283` / `313378df-fb0a-47b0-ade6-8d9a31c1fbbc` stored `limited`; FULL impressions `aa732f94-4a24-4934-a2b1-84ce11a089f2` / `0e265f9a-9a11-4e3b-8c59-f83dc6cfd286` stored `creative`. All four have partial signals, null Score, and null video duration. Stored `creative` does not prove iframe isolation: the backend also downgrades `full_page` when collectors did not load. The in-stream FULL record ended at 12.638 seconds, before the user's IMA playback log completed; investigate early finalization separately. [IAB access-mode documentation](https://interactiveadvertisingbureau.github.io/Open-Measurement-SDKJS/accessmodes.html) identifies `friendlyToTop` as a compliance-script signal. These are pre-change production observations; local implementation results follow.

### Active task — OMID-access-r1

Stages 1–5 were explicitly approved in conversation. [OMID-access-P1 revision 1](IMPLEMENTATION_PLAN.md) is implemented; local Stage 8 validation is PASS, awaiting user acceptance. Baseline: `7ae417b`; worktree contains approved OMID source/tests and documentation only. No commit, push, runtime publication, deployment or server environment change was performed. Duration, interval accounting, and S5 remain separate.

- Baseline source used the verification document for loading and factory lookup, while SDK collectors use global `window`/`document`. The implementation now loads/reads in the verified top window, validates element ownership, isolates runtime-version factories and guards late startup; SDK source and formulas remain unchanged.
- Additional user-observed IMA FULL context: `currentWindowIsTop=false`, `videoElementNodeType=1`, `videoInTopDocument=true`; no `slotElement`, and no `friendlyToTop` key. This document arrangement is now covered locally in Chromium. A new-runtime Google IMA run and production Score remain unverified until separately authorized publication.
- Baseline checks on Node `v22.23.2`: `pnpm --filter @cpmind/omid test` (typecheck + 36 tests, exit 0); `pnpm --filter @cpmind/sdk test` (typecheck + 14 tests, exit 0). No product code changed; these passes do not validate the missing real-player scenario.
- Release dependency: OMID bundles are built by `runtime-publisher`, not the backend image; runtime version selection is shared with backend VAST delivery. Deployment remains outside current authorization.

Stage 3 map was preserved: changes are in `gate.ts`, `index.ts`, `loader.ts`, `global.ts`, `full.ts`, `types.ts`, focused tests and `OMID_LOGIC.md`. No SDK, backend, scoring, player, ordinary tag, dependency, infrastructure or DB changes. Each ad retains its exact supplied element and independent SDK session.

Approved M1/P1 preserves partial fallback for restricted/unknown modes, inaccessible DOM, incompatible elements, failed/late loading and failed initialization. Release/rollback requires a separate commit and new immutable runtime version, retaining previous assets and compatible backend configuration. Publication/deployment/model changes remain unauthorized.

Final local evidence: Node 22.23.2, pnpm 10.17.1, Chrome 150.0.7871.125. OMID typecheck + 69 tests, SDK typecheck + 14 tests, runtime v2 build and diff checks passed. All 16 browser scenarios passed: 17 final payloads, seven full payloads with finite Scores using shared defaults, no Runtime exceptions, one bundle request for two independent creatives. Browser events are simulated OMID, while DOM/layout, SDK and ordinary tag source are real; no production DB was used. Evidence: `/private/tmp/cpmind-omid-access.njhaIS/` and `/private/tmp/cpmind-omid-access-browser-k9X3Eo/results.json`; detailed AC/review results and initial tooling/fixture corrections are in the plan. Next safe action: user acceptance of the local implementation, then separate release authorization and actual IMA retest.

### S5 reference for possible future changes

In genuine `LIMITED` mode, the verification script cannot access the creative or publisher DOM. It can consume interactions reported by the player through OMID; it cannot attach hover/cursor listeners to the actual video.

| Data | Availability in limited collection |
|---|---|
| Advertising click | Available if the player reports `adUserInteraction: click`; observed in this impression |
| Number of received click events | Could be added; currently only `clicked: true/false` is stored |
| First/last click event timestamps | Could be stored; not currently retained |
| Time from session start to first click | Could be derived from event timestamps |
| `invitationAccept` interaction | Could be recorded separately if the player emits it; currently ignored |
| Hover count and duration | Unavailable through the standard OMID event stream |
| Cursor coordinates, trajectory, and proximity | Unavailable through that stream |
| Physical taps, swipes, pinch/zoom | Unavailable through that stream |

Count received events, not assumed physical clicks. Missing events do not prove absence of user interaction. Time to first click is not hover-to-click latency. Pause/resume, volume, and fullscreen events are separate observations; they do not reconstruct missing S5 features. Additional fields would require an explicit collection/schema/scoring proposal; they are not implemented by these notes.

References to retain for future S5 work:

- [Google IMA — Open Measurement access modes](https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/omsdk): `LIMITED` isolation and player-controlled access rules.
- [IAB — OM SDK for Web Video integration](https://interactiveadvertisingbureau.github.io/Open-Measurement-SDKJS/): media start and player-reported advertising interactions. The installed OM SDK also defines `click` and `invitationAccept`.
- Current collection/conversion: `packages/omid/src/limited.ts`, `packages/backend/src/services/omid/partial_signals.ts`; normalization: `packages/shared/src/scoring/normalize.ts`.

Next safe action: inspect the actual player event stream and the S5 model's training provenance before selecting any code or model changes. Ordinary script collection must remain a regression-check case. No new product changes or player-specific adaptation were made during this follow-up.

## Historical snapshot — 2026-10-28: measurement over VAST without publisher-side code

### State, authority, and baseline

- Updated on 2026-10-28, Europe/Moscow. Authorization covers this handoff, the session index entry, the documentation updates the user enumerated, and the commit/push the user explicitly released for this branch.
- Session ID: `2026-10-28-vast-omid-measurement`.
- Branch: `claude/gallant-thompson-x2m4vu`, pushed to `origin`. Base: `d9837d1`. No pull request was opened — the user reviews the branch directly.
- The commit ban that held through stages 1–8 was lifted by the user only at the reporting stage; nothing was committed before that point.
- Migrations `0032` and `0033` are generated and committed but **not applied**. The user applies migrations; the agent never ran one against any database other than an isolated local instance.
- No staging deployment, production-data operation, real calibration run, model activation, or bulk historical recalculation was performed.

### Delivered capability

Measurement of a video impression when no CPMind code exists on the publisher page. Both client scenarios are covered:

1. The client hands CPMind their VAST tag; CPMind wraps it and the client re-inserts the wrapped tag into their ad system.
2. CPMind issues its own VAST tag and the client inserts it.

In both, the response carries `<AdVerifications>` with the IAB OMID verification script. The publisher installs nothing; the player executes the script itself.

### Honest limits of the delivered capability

| Claim | Status |
|---|---|
| All of S1–S7 collected in both scenarios | **Not guaranteed.** S3 and S7 require code in the publisher's top window. The only standardized route is OMID with `accessMode: full` plus `friendlyToTop`, which the publisher's player grants or withholds. The realistic majority of impressions will be partial — S1, S2, S4, S5, S6 with no composite Score |
| Verified against real players | **No.** The diagnostic stand (D3) was declined by the user. Unknowns U1, U3, U5, U7, U8 remain open: whether AdFox, AdLook, AdRiver, Buzoola and Google IMA execute the verification resource, and what access level each grants |
| Ready to deploy | Yes, subject to three preconditions below |

Preconditions before deployment, all on the user's side: apply both migrations; run `nginx -t` (no validator was available in the build environment); confirm the runtime bundles are reachable under `/runtime/` on the CDN after the first publish.

### Architectural decisions

- **Separate ingestion endpoint.** `POST /api/collect/omid` rather than widening `ImpressionPayloadSchema`. The main collect path and its contract are untouched, per the user's standing constraint that mission-critical data-collection logic must not be modified.
- **One impressions table.** Partial impressions are stored alongside full ones with `measurement_mode = 'vast_omid'`, not in a separate table. Decided with the user.
- **Normalization is mandatory for partial impressions.** The user identified the absence of normalized values as a critical defect: `USER_VISIBLE_IMPRESSION_FIELDS` exposes only normalized fields, so unnormalized impressions would be invisible in the cabinet. All available signals are now normalized with the same functions, the same active configurations and the same segment derivation as `/api/collect`.
- **Measurement completeness is derived from `score_final`, not from `measurement_mode`.** The same mode yields both outcomes: with page collectors attached the impression travels the normal SDK path and carries a full Score. The `chk_score_final_required` constraint makes the inverse impossible.
- **Calibration excludes restricted-access impressions** from the training sample of all seven signals, and calibration sets admit only impressions with a complete aggregate score.
- **SIMID was evaluated and rejected.** Groundwork retained but disconnected; the reasoning is recorded in `docs/packages_information/OMID_LOGIC.md`.

### SIMID — why the approved option was not shipped

The user approved "option A" on the understanding that the creative would ask the player to fire CPMind tracking URLs. Reading SIMID 1.2 in full changed the picture in both directions and the agent stopped before shipping rather than proceeding under a premise that no longer held.

SIMID 1.2 §4.3.10.1 and §6.9 require the player to overlay the creative iframe across the whole media element once the creative resolves `startCreative`, and §4.4.1 delegates clickthrough execution to the creative. A measurement-only component would therefore either take ownership of the advertiser's click — with failures that are undetectable, since `clickThru` has no response when the creative navigates — or provoke a VAST 1213 error on every impression by never answering a mandatory message. `<InteractiveCreativeFile>` also lives in `<InLine>`, so it cannot cover the wrapper scenario at all, and the only signal it adds over OMID is backward-seek detection.

The user's decision after the analysis: keep the groundwork, do not connect it.

### Defects found and fixed during the session

| Defect | Nature |
|---|---|
| S2 interval attribution inconsistent with S1 | Real defect introduced by the agent; corrected against `packages/sdk/src/signals/s2.ts` after the user challenged the initial answer |
| `instanceof HTMLElement` across realms | Real production defect: a foreign-realm element would silently fail the check. Replaced with `nodeType === 1`; the other six `instanceof` uses were verified same-realm |
| Normalized values not written for partial impressions | Critical defect identified by the user; fixed |
| Stale `segments.test.ts` calling obsolete signatures | Pre-existing; the package `tsconfig` excluded tests from typecheck. Rewritten, and typecheck gates added to shared, sdk, backend and omid |
| `/api/collect/omid` outside the beacon rate-limit zone | Real infrastructure defect found in stage 8. `location = /api/collect` is an exact match, so the OMID path fell through to the panel limiter: 30 r/s instead of 100, and impression traffic would have throttled the cabinet through the shared zone |
| External-VAST creative showed "video processing" forever | Real defect in the new creative type: such a creative has no assets and never will. Fixed with a dedicated preview state |
| Placement embed modal claimed S1–S7 and Score unavailable over VAST | Became false once the verification block shipped. Text corrected |

### Commit inventory

| Commit | Scope |
|---|---|
| `c871e24` | shared contracts, backend, frontend, both migrations, tests |
| `b8978cd` | `@cpmind/omid` package and lockfile |
| `95ac880` | nginx beacon zone, runtime-publisher Dockerfile, compose |
| (this one) | documentation and session snapshot |

The first split put `@cpmind/omid` ahead of the shared contracts; `src/full.ts` references `'vast_omid'`, which `MeasurementModeSchema` only gains in the shared commit, so that intermediate state did not typecheck. The claim of self-containment had been made from the import list alone, where a string literal does not appear. The order was reversed and each intermediate commit was then verified by checkout, typecheck and build rather than by inspection.

### Verification

Full suite at branch HEAD, PostgreSQL 16 local instance:

```sh
pnpm -r test
npx tsc --noEmit -p packages/backend/tsconfig.json
npx tsc --noEmit -p packages/frontend/tsconfig.json
NEXT_PUBLIC_BACKEND_URL=... pnpm --filter @cpmind/frontend build
```

| Package | Tests |
|---|---|
| `@cpmind/shared` | 23 |
| `@cpmind/sdk` | 14 |
| `@cpmind/backend` | 174 |
| `@cpmind/omid` | 36 |
| **Total** | **247** |

Bundles: loader 49.1 KB, full branch 58.6 KB. Frontend compiles, 18 pages generated.

Not verified: `nginx -t` (no nginx or docker in the build environment; the change was checked structurally — block balance, directive termination, and byte-identical body against the proven `/api/collect` block). No execution against a real player.

### Open items

| Item | Owner |
|---|---|
| Apply migrations `0032`, `0033` | User |
| Run `nginx -t` before deployment | User |
| Trial against real players — closes U1, U3, U5, U7, U8 | User decision |
| Measurement-coverage reporting for `verificationNotExecuted` | Deferred by agreement |
| Calibration of the partial measurement tier | Deferred by agreement |
| Merging OMID and SIMID sources into one impression | Deferred by agreement |
| `docs/DEPLOYMENT.md` nginx listing is stale (one server block, `tag_endpoint` zone, `/api/impressions`) | Flagged; a warning was added above it, the rewrite needs separate authorization |
