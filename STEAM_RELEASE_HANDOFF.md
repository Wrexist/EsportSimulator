# Esports Manager: FPS — game overview and Steam release handoff

Updated 25 September 2026. Target: **Windows desktop 1.0**, not Early Access. App ID **4326170**. Decision: **NO-GO for launch** until the acceptance gates below pass. This is a development checkpoint, not a promise of zero bugs or a release certification.

This is the current summary. [Every unaccepted task and acceptance criterion](docs/launch-readiness/OPEN-RELEASE-ITEMS-2026-09-25.md) is listed separately, derived from the 36-package register. Older unchecked items can have substantial implementation already: reverify before rewriting. Historical passing reports certify only their recorded source/build, not today's candidate.

## What the game is

A single-player esports organization management game. The player runs the club rather than controlling a shooter character: choose a club or build one, manage the squad and budget, scout and negotiate, develop players, prepare matches, observe results and progress through seasons and competitions.

| Area | Current implementation and intended player experience | Still needs release acceptance |
|---|---|---|
| World and identities | Stock database: 198 clubs and 1,368 players; fictionalized display identities. Top 25 clubs have 128 authored stylized portraits bound to permanent IDs; other players use stable randomized portraits. | Fresh and existing careers, custom names/images, transfers and all portrait surfaces in the installed build. Fictionalization does not independently establish third-party rights. |
| Career | Existing-team/custom-team setup, manager progression, board expectations, jobs, goals, season outcomes and history. | First-session playtests, multi-season transitions, dismissals/job offers and late-career continuity. |
| Squad and development | Roles, lineups, bench, training, drills, fatigue/energy/morale, recovery, academy and player development. | Consistent selectors/display values, capacity/timing, age/decline balance and long-run player supply. |
| Recruitment | Scouting uncertainty, watchlists, transfers, free agents, negotiation, contracts and AI recruitment. | Complete cancellation/expiry/renewal/registration flows, AI solvency, role needs and information consistency. |
| Club business | Finance ledger, forecasts, wages, sponsors, staff, facilities, equipment and weekly activities. | Repeated/conditional transactions, bankruptcy, affordability, seasonal scaling and all UI promises versus settlement. |
| Competition | Calendar, tournament formats, qualification, rankings and career match scheduling. | Every supported format and field size, tie-breaks, byes, fixtures/qualification consistency and season boundaries. |
| Career matches | Existing live/instant/skip/result flows, tactical choices, purchases, match history and replay/recovery work. | One authoritative result across every entry path, interruption and repeated delivery. |
| New physical simulation | Deterministic spatial engine with navigation, collision, perception, shooting, utility, team coordination and radar/replay diagnostics. | **Still rehearsal-only.** All-map acceptance, performance and production career ownership are unfinished. Do not advertise it as fully integrated. |
| Maps and Map Studio | Mirage, Inferno, Overpass, Vertigo, Ancient, Anubis and Sandstone are active. Nuke remains for editor/old-save compatibility, not the active pool. Drawings/import/review tools are preserved. | Geometry/height/site/traversal calibration, utility calibration, remaining recovery cases and packaged content checks. No new owner redraw is currently needed. |
| Presentation | Shared navy/glass desktop UI, trophy logo, facilities/equipment art, player dossiers, scouting and compact management surfaces. | All routes/modal states at 1280×720, 1440×900 and 1920×1080; keyboard/focus, contrast, reduced motion, audio and actual first-time users. |
| Persistence | IndexedDB/browser saves, desktop adapters, backups/migrations, worker/fallback and interrupted-state recovery. | Actual packaged faults, disk/quota errors, corrupt primary/valid backup, old versions and account/career switching. |
| Steam and community | App ID configured, Steam/Cloud/achievements/stats and community-import/Workshop implementation work. | Installed client acceptance. Workshop and any real-data community mod remain conditional; separate distribution is not automatic permission. |

## Technical map

- Next.js 15 / React 19 App Router, Zustand/Immer state, TypeScript and Electron desktop packaging.
- `app/`: routes; `components/layout/`: shared shell; `components/ui/`: controls and portrait/crest presentation.
- `engine/`: deterministic simulation, finances, competition and persistence; `engine/spatial/`: physical rehearsal engine.
- `store/slices/`: game actions; `store/utils/build-save-snapshot.ts`: canonical save serialization.
- `data/` and `public/data/snapshot/`: game data; `public/branding/`: retained shipping identity artwork; `public/map-studio/`: map authoring and spatial data.
- `electron/`: desktop lifecycle, IPC and Steam adapter; `scripts/launch/`: audits, fixtures and packaging evidence.
- Preserve seeded RNG, compute-only workers, a single authoritative save commit, deduplicated transactions/results and user career/map data.
- Never bundle credentials, Steam login sessions, developer saves, scratch output or original real-player photos/team logos in the Steam base game.

## Known blockers and next engineering order

1. **Fix Overpass floor support:** two seeded combat cases reported `Feet lost floor support`; one ended without a plant. Reproduce with traces, fix the supported route/movement boundary without teleporting or weakening collision, then rerun affected and neighboring cases.
2. **Finish physical map acceptance:** both sites on every map, multiple seeds, narrow doors/crowds, vertical transitions, bomb pickup/death, smoke timing, interrupted plant/defuse, buys, halftime, overtime and series progression. Three Vertigo stand-offs with gunfire disabled remain a stress-test limitation.
3. **Complete physical career integration:** versioned compatibility for old saves/replays; one event stream must own radar, kills, score, equipment, economy, rewards and final settlement exactly once for live/instant/skip/resume. Rehearsal must not commit career rewards.
4. **Measure performance on the shipping target:** startup/navigation, full match processing/playback, week advancement, saves, memory and long sessions. The optimized Sandstone examples still took approximately 51.5 and 30.8 seconds on the instrumented host; faster is not the same as acceptable real-time performance.
5. **Complete management balance and career testing:** finances, salaries/fees, AI budgets, scouting, training/decline, facilities/staff/sponsors, calendars/qualification/rankings, board/jobs and season outcomes. Retain failures from multi-seed/multi-season runs.
6. **Complete save and lifecycle fault acceptance:** crash/close while processing or saving, worker failures, corrupt saves, backups, migration, offline, account switches and Cloud conflicts in the actual Windows package.
7. **Finish the UI/first session matrix:** every production route and important overlay, small desktop resolutions, keyboard/focus, text/number consistency, errors/loading/empty/locked/insufficient-money states and fresh-player observation.
8. **Resolve remaining release-gate findings:** strict content scan currently reports a `public/hltvrankiing` path finding. Determine its actual shipped use/provenance and resolve explicitly; do not hide findings by refreshing a baseline. Generated QA license separator false positives and temporary TypeScript backup inclusion were corrected locally; confirm on the frozen candidate.
9. **Freeze/package/install the accepted candidate**, then complete Steam/store approvals below. Do not upload a stale package merely because the web build passes.

## Evidence already available — and its limits

| Evidence | Result | Limit |
|---|---|---|
| Portrait correction | 128 top-25 identities; 17 focused tests pass. 108 portrait references changed, no other player fields. Chrome Vitalis preview loads correct files. | Full installed-game route acceptance remains. [Visual review](docs/ui-review/portraits/top-25-2026-09-25.html). |
| Production web build | Build and production worker startup check pass; TypeScript passes; lint has existing warnings, no errors. | This is not an Electron/Steam installation test. |
| Collision equivalence | 600 queries per map on seven maps match the previous implementation exactly. | Supports optimization parity, not complete geometric realism. |
| Physical real BO3 | 43 rounds on Vertigo/Anubis, away wins 2–0; no final blocked survivors. | Sandstone decider unused; not real-map overtime or all-map acceptance. |
| Physical combat campaign | 15 cases settle with zero final blocked survivors. | Two Overpass floor-support failures remain; not a clean pass. |
| Source content records | Current source content gate passes after exact map and portrait reconciliation. | Packaged archive validation and upstream-permission distinctions remain. |
| Full regression | Fresh pre-push run recorded in the GitHub checkpoint verification note below. | Passing unit tests cannot establish zero bugs, fun/balance or Valve approval. |

## Windows candidate checklist

- [ ] Finish and freeze the accepted implementation and source commit; record lockfile/toolchain/build hashes.
- [ ] Run full typecheck/Jest, lint, strict source/content/security gates and production worker build checks; preserve all failures.
- [ ] Build the actual Windows distribution using the configured App ID, not the old portable/source upload layout.
- [ ] Confirm `dist/win-unpacked/EsportsManager.exe` is the launch executable and the depot content root is correct.
- [ ] Inspect ASAR, native dependencies, fonts, notices, asset inclusion/exclusion and debug/dev routes for the exact package.
- [ ] Test a clean Windows account/machine without Node or a development server, including non-ASCII paths and display scaling.
- [ ] Fresh install → launch → new career → recruit/train/upgrade → match → advance → save → close → reload.
- [ ] Test update, offline play, uninstall/reinstall and save retention; never delete player careers as a repair shortcut.
- [ ] Test fullscreen, minimize/restore, sleep/resume, audio preferences, multiple-instance handling and close during work.
- [ ] Record tested Windows/hardware configurations, signing/SmartScreen behavior, crashes and known issues.
- [ ] Upload the accepted package to a Steam test branch and record the new Build ID/depot manifest.

## Steam integration acceptance

- [ ] Launch from an owned Steam installation; verify executable, App ID, account identity and overlay.
- [ ] Verify achievements/stats definitions against implemented conditions, repeated events and offline-to-online recovery.
- [ ] Verify local-only, Cloud-only, conflicting/corrupt saves, two-device conflicts, different accounts, failed sync and retry with backups.
- [ ] Keep local progression usable when Steam is unavailable; verify no cross-account save contamination.
- [ ] If Workshop is advertised: subscribe/update/unsubscribe, invalid/missing dependencies, offline use, asset retention and clean unmodded fallback. Otherwise remove the unverified claim/control from launch scope through an explicit decision.
- [ ] Verify branch-to-default promotion, rollback and save compatibility using retained previous-good artifacts.

## Steam store: what belongs where

The last authenticated inspection on 25 September recorded store presence approved, build approval outstanding, default build **25370240**, depot **4326171**, manifest **7171118896994346851**, and published base price **US$14.99**. Historical rejection refers to **23989573**, not proof that every listed defect exists in 25370240. These are last-observed facts, not a fresh account inspection during this GitHub push.

The store editor still showed **1/5 required screenshots**, an incomplete/processing trailer, outdated Early Access copy and unpublished store changes. Existing approved-looking previews are not evidence that uploads were saved, published or accepted.

| Store area | Required action |
|---|---|
| Name/logo/positioning | Keep **Esports Manager: FPS** and the owner-approved gold trophy identity consistent; check readability at small sizes. |
| Store capsules | Verify the current required header/small/main/vertical slots, dimensions, localization and safe areas in Steamworks. Use the matching exported artwork, not arbitrary aspect ratios. |
| Screenshot assets / Skärmbildsresurser | Upload current genuine gameplay captures showing the actual shipped UI: match, squad/profile, scouting, club, facilities/equipment, finances and competition. Remove obsolete or misleading images. Do not use promotional composites as substitutes for gameplay screenshots. |
| Library assets / Biblioteksresurser | Correct library capsule, hero and transparent logo in their separate slots; verify logo placement against hero art. |
| Client/community icons | Verify PNG/ICO and client/community slots independently; a store capsule is not an application icon. |
| About section | Use concise truthful feature copy and permitted promotional panels here, with character/art layers only where they accurately represent the game. |
| Trailer | Finish processing; play the encoded result in Steamworks. Show actual management and match gameplay early; exclude unsupported systems and outdated UI. |
| Release model | Reconcile the confirmed Windows **1.0** launch with stale Early Access material and settings. Do not invent completed features to fill the Early Access questionnaire. |
| Features and languages | Claim only verified single-player/input/language/Cloud/achievement/Workshop support; no controller, Deck, multiplayer, Mac/Linux or perfect CS2 simulation promise without acceptance. |
| System requirements | Derive minimum/recommended specs and storage from tested named machines and the real package. Do not guess unmeasured requirements. |
| Content and AI disclosures | Match the exact shipped art/content and use of generated artwork; verify surveys, ratings and required region information. |
| Support and commercial settings | Verify support contact/links, developer/publisher, categories/tags, regional prices, purchase package and launch date. |
| Publish/review | Save, preview, publish applicable pending store/configuration changes, then submit the current accepted build for review. Record the outcome rather than assuming it passed. |

Reference exports and source artwork are under `marketing/`; duplicate ZIP upload archives stay local, with source assets/manifests versioned. The gallery must be recaptured from the accepted UI before final submission. See also [store draft](STEAM_STORE_LISTING.md) and [Steam setup guide](docs/STEAMWORKS_SETUP_GUIDE.md); audit their historical claims against this handoff.

Valve separates store/build readiness and the final release workflow. Check account-specific timing and approval status at release time: [official release process](https://partner.steamgames.com/doc/store/releasing). Confirm current slot requirements in [official graphical asset documentation](https://partner.steamgames.com/doc/store/assets/standard).

## Content disposition

- Original real-player photographs and real team logos stay local/excluded from the Steam base build, per owner direction. Verify the packaged bytes, not only reference paths.
- Owner confirmed project-created fictional/stylized portraits and illustrations, additional badges/merchandise/icons/older tournament art, and use of the map material. Preserve those exact evidence records.
- The imported lineup collection has an explicit owner-directed shipping decision but **no independently verified upstream redistribution permission record**. Do not describe owner direction as permission from the original creator; resolve/document the disposition before declaring complete clearance.
- A separate real-data Workshop mod requires its own content/permission review, packaging and subscribe/update testing. It is not automatically cleared because it is separate from the paid game.
- Preserve dependency/font/audio notices and provenance. Current source-gate success does not certify legal rights or final archive contents.

## Support, playtests and release decision

- [ ] External newcomer and experienced-manager playtests; record confusion, meaningful choices and match comprehension.
- [ ] Full route/error/recovery matrix and multi-hour/multi-season candidate soak tests on target hardware.
- [ ] Support address, known-issues page, version/build display, safe diagnostics export and save-backup instructions.
- [ ] Crash/save-loss severity triage, minimal reproduction template, hotfix/rollback procedure and first-week monitoring.
- [ ] Current Valve store/build approvals and all account prerequisites met.
- [ ] No unresolved release-blocking save loss, crashes, broken progression or misleading advertised features.
- [ ] Owner chooses the date and approves any explicit lower-priority scope deferrals; prepare truthful release notes and support communication.
- [ ] Archive the accepted commit/artifact/manifests/evidence, release through Steam, then verify customer install and purchase availability.

Curator outreach, community posts and promotional campaigns are optional marketing work after a reliable playable candidate. They do not replace build acceptance. Do not send unsolicited messages or promise sales/download outcomes.

## What the owner needs to do

1. Participate in a short fresh-player playtest once the candidate is ready.
2. Decide the launch date and any proposed explicit scope deferral. Windows 1.0, App ID and trophy logo are already confirmed; the last observed price is $14.99.
3. Supply genuinely missing third-party permission evidence or choose a documented replacement/exclusion if needed; do not repeat origin questions for already-confirmed project artwork.
4. Complete account-only authentication/approval steps only if they arise. No map redrawing or manual portrait reassignment is currently needed.

## Commands and safe handoff

```powershell
npm ci
npm run preflight
npm run lint
npm run build
npm run content:verify
npm run release:checks
npm run release:verify -- --package
```

Read `DEV.md`, `TASK.md`, `LEARNINGS.md` and the detailed release plan first. Build scripts clean output directories; preserve active previews and do not touch user saves. Upload scripts affect Steam externally: use the accepted artifact and correct test branch. A passing local command is not permission to mark an untested checklist item complete.

## GitHub checkpoint verification

`npm run preflight` passed on 25 September: **TypeScript clean, 192 Jest suites passed, 1,818 tests passed** (268.65 seconds). Production build/worker and portrait tests from the preceding pass are green; installed Windows/Steam acceptance remains open. No Steam upload, review submission or public game release is performed by this GitHub push.

Checkpoint branch: `claude/steam-release-readiness-2026-09-25`, following the repository's branch rule. Reviewed data/assets/evidence use byte-preserving Git attributes so checkout line-ending conversion cannot silently invalidate their provenance hashes. Local credentials, scratch/build output and duplicate marketing ZIPs are excluded. This does not change the Steam base-game exclusions for original photos/logos.
