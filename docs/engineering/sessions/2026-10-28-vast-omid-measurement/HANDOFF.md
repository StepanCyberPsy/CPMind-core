# CPMind Session Handoff — VAST Delivery with OMID Verification

## Current snapshot — measurement over VAST without publisher-side code

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
