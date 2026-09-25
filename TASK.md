## Avatar bulk complete: all approved personal-photo sources

1,170 player records exported and synced (1,156 unique avatars, fourteen verified historical aliases). Final built-in generation queue: 809/809 successful, no active generation remains. All approved batch inputs delivered, zero wrong snapshot mappings, dark/light contact sheets inspected through final exports. Final portrait tests: 15 passed; TypeScript passed. Earlier isolated UI capture: twelve polished portraits loaded at 1920x1080 and 1280x720, zero page errors, no career created. Originals and older masters preserved; first ten photo-based v3 corrections integrated. 198 records lack a verified personal photo (191 unsuitable/placeholder candidates, six missing local source, one ambiguous identity). See docs/ui-review/portraits/AVATAR-POLISH.md and production-progress.json. No API, Git push or Steam packaging performed. Entries below are historical checkpoints, not the current generation status.

# Avatar bulk checkpoint ? generation still running

347 exported. See docs/ui-review/portraits/AVATAR-POLISH.md and batch-11 through batch-19 approved/pending manifests. Built-in imagegen only; six concurrent requests; save every result. Remaining portraits are NOT complete.

## Avatar production checkpoint: 209 delivered

Batch 08: 42 personal-source jersey avatars integrated; two source-based corrections applied (cap graphic and hair seam). Alpha verified and dark/light contact sheets reviewed. Batches 09 (37 approved inputs) and 10 (38 approved inputs) currently generating; not yet integrated. Only approved input lists may be exported. Whole-library and in-game visual validation remain unfinished.

## Avatar production checkpoint: 167 delivered

Batch 07: 40 new personal-source jersey avatars integrated, alpha verified, dark/light contact sheets reviewed. All 167 mappings and unique masters verified. Portrait tests: 18 passed; TypeScript: passed. No non-portrait gameplay changes. Batch 08: 42 inspected source portraits submitted to built-in imagegen; not yet integrated. Whole library and in-game visual validation remain unfinished. See docs/ui-review/portraits/production-progress.json.

## 2026-09-25 expanded avatar production
- 127 reviewed avatars integrated; 31-player batch 06 complete, 40-player batch 07 generating through built-in imagegen.
- Alpha and exact source/output hashes checked; 18 portrait/save tests pass; all 127 snapshot mappings verified. No non-portrait gameplay changes.
- Source exceptions identify 161 players whose audited candidates are placeholders and five needing alternate identity review; six have no local source. Counts in production-progress.json supersede older entries.
- Export uses full player IDs for new master filenames to avoid duplicate nickname collisions; earlier master paths preserved. Whole-library generation and actual in-game visual checks remain open.

## 2026-09-25 avatar bulk progress
- User explicitly chose built-in imagegen, not API, and requested bulk for ALL players with an own portrait. Distinct per-player image requests are dispatched in groups; never a multi-person sprite sheet.
- 36 delivered avatars across the first seven stock teams, 512px genuine alpha exports, full masters and source hashes preserved. Vitalis/Foria used existing stylized references; later teams use original photographs to remove invented accessories. First two teams still need original-photo likeness comparison.
- Archive search expands candidate inventory to 1362 own-source candidates, six with no local source. 1332 stock players remain unprocessed (1326 candidates plus six unresolved/missing). No claim of whole-library completion or in-game/Steam verification.
- See docs/ui-review/portraits/production-progress.json and polished-progress.html for persistent queue and preview. No background image job remains after completed batches. Next: next queued team, then all remaining own-source players; verify actual UI and source/likeness clearance separately.

## 2026-09-25 avatar polish started
- Built-in imagegen edited five Vitalis portraits; alpha-preserving 512px exports and identity overrides integrated. Original files preserved. 18 focused portrait/save tests and type-check passed before final scope extension.
- Full 1368-player candidate inventory: 1273 possible own sources, 93 missing locally, 2 ambiguous. These require visual identity/placeholder review; mass generation is NOT complete. User wants own-source avatars for all players with a real portrait, random only when genuinely absent.
- See docs/ui-review/portraits/AVATAR-POLISH.md. Actual in-game visual check and remaining avatar production pending.

## 2026-09-25 GitHub release handoff
- Added STEAM_RELEASE_HANDOFF.md: game/system inventory, current blockers, Windows/Steam installation, store assets/copy, content disposition, support and owner actions. Exported all 102 unchecked tasks and 98 acceptance criteria across L01-L36; unchecked is not a claim of missing implementation.
- Pre-push preflight passed: TypeScript clean, 192 Jest suites and 1818 tests pass. Shipping byte preservation configured in .gitattributes; duplicate marketing ZIP archives remain local.
- Publishing development checkpoint to claude/steam-release-readiness-2026-09-25 per DEV.md. No Steam upload or release.

## 2026-09-25 top-25 portrait sync
- 128 authored stylized portraits mapped by permanent player ID; 92 retained PNGs and 36 original-face crops. 108 snapshot portrait changes; no other player fields changed. Custom art preserved; old saves refresh.
- 17 focused tests, typecheck, lint (existing warnings), production build and worker startup pass. Source content gate passes after 39 derivative records. Chrome Vitalis preview verified on 3371; screenshot and full 25-team review in docs/ui-review/portraits/.
- No Steam upload this pass. Remaining release work stays in docs/launch-readiness/REMAINING-2026-09-25.md, including two Overpass floor-support failures, career integration, installed Windows/Steam acceptance and store fixes.

## 2026-09-25 real-map series, interrupted recovery and Steam status
- Real reference BO3 completed 43 rounds: Vertigo 8-13, Anubis 9-13, away 2-0; zero final blocked survivors. Purchases, pending JSON resume, duplicate delivery, halftime, map progression and finalization passed. Sandstone decider was not played; no real-map overtime or all-map acceptance claim.
- Recoverer-death and failed-live-smoke regressions added. 51 recovery/lifecycle tests plus seven audit tests pass (58 total); final type-check and focused test lint pass. Production engine unchanged, physical matches remain rehearsal-only.
- Chrome production worker recovery/playback and saved-position resume after reload verified on Vertigo. Actual viewport 1049x827; override did not apply, so target-resolution/full-game checks stay open. Isolated review server remains on 3371; existing 3210 untouched.
- Steam signed in and checked: default 25370240, store presence approved, build approval pending; old rejection names 23989573. Store has 1/5 screenshots, incomplete trailer, old Early Access copy and unpublished store changes. App configuration separately has no uncommitted data. Published base price $14.99 USD.
- Reconciled 78 exact project-art delivery records; content gate still has 67 map/draft/scenario/data records. No original photos/logos added to build. Source audit false App ID-file/comment/URL blockers corrected with tests; strict scan passes with informational references and one map-name warning. No claim of final content clearance.
- See docs/PHYSICAL-REAL-SERIES-V12.md and docs/launch-readiness/REMAINING-2026-09-25.md. Mirage v13 original SHA256 unchanged. No package/upload/review submission this pass.
- Next: wider real-map/site/seed and performance acceptance, then production-career integration; current content reconciliation, Windows/Steam installation, store fixes and Valve approval remain required. No user redraw needed.

## 2026-09-25 approach recovery and series v12
- Reservation-only route rejection now falls back to a checked world approach; runtime swept-body, wall and floor checks remain enforced. Engine v12 reads v1-v11 replays but does not resume old pending work with changed rules.
- Final-source movement reruns: Anubis and Sandstone plant/defuse with zero route failures/blocked survivors. Vertigo has zero route failures but three direct opponent stand-offs with gunfire disabled. Vertigo A/B combat both settle with zero blocked survivors. Four of seven v11 recorded blockages clear; do not claim a new seven-map full-round campaign.
- All seven active-map 10-second combat recovery fixtures pass actual shots, smoke-before-pickup, one grenade consumed, moving support and no overlap. Team Lab exposes backed-up combat recovery examples.
- Two mirrored synthetic BO3 series pass 150 physical rounds through purchases, resume, halftime/overtime, map progression, duplicate delivery and finalization. Identical mirrored rosters preserve replay hashes and reverse team ownership. These are not real-map full-series tests.
- 122 focused tests, final type-check, focused lint, production build, week-worker startup and bundled physical-worker repeat/settlement checks pass. Build retains existing repository lint warnings. Evidence is recorded in docs/PHYSICAL-APPROACH-V12.md. Chrome tab selection still times out, so UI validation remains open.
- Drawings and saves preserved; original Mirage SHA256 unchanged. No user redraw needed. Physical matches remain rehearsal-only.
- Next: real-map full-series/additional-seed validation, recovery interruption/death cases, browser/performance review, then packaged Windows/Steam testing. See docs/PHYSICAL-APPROACH-V12.md for scope and receipts.

## 2026-09-25 coordination and moving recovery v11
- Alternate checked portal crossings, bounded failed-cover reassignment, direct-sight-only opposing-body reservations, and exact-coordinate reservation-world caching implemented. Finished shortened follow tracks now yield; passing pockets retry body-aware routes when direct paths cross teammates.
- Final source a0bab3c41a7c452018276fd982f745969ea2f7529460a294cf01683893aa621a: seven-map no-gun campaign has 7 final blocked actors versus v10's 11, six maps plant versus five. Mirage/Inferno/Ancient/Overpass clear; Vertigo 3, Sandstone 2, Anubis 2 remain. Anubis no-gun stand-off times out, so do not claim all maps fixed.
- Overpass and Anubis A/B combat cases all settle with zero blocked survivors (four cases only). All seven moving 5v5 recovery fixtures pass: screening before pickup, one smoke spent, seven added actors moving, no overlap. Team Lab has a backed-up moving-recovery loader. Source/fixture hashes verified.
- 95 focused tests in four suites, type-check, targeted lint, production build, week-worker startup and bundled physical-worker repeat/settlement checks pass. Build retains existing lint warnings. Worker verifier now checks the source engine version instead of stale v3. Earlier stopped/prototype runs are not passing evidence.
- v1-v10 replays remain readable; old pending work cannot silently change engine. Physical matches remain rehearsal-only. Browser click-through still pending after Chrome timeouts; isolated port3371 review server stopped, existing port3210 untouched.
- See docs/PHYSICAL-COVER-RECOVERY-V11.md and docs/ui-review/map-pool/spatial-round-v11-movement-summary.json. Original Mirage drawing hash unchanged; saves and drawings preserved. No user redraw needed.
- Next: Vertigo/Sandstone failed routes, opposing-player stand-offs under combat/additional seeds, then side-swapped series and combat recovery. Browser/performance and packaged Windows/Steam validation remain open.
## 2026-09-23 crowd movement and recovery calibration v10
- Shared passing pockets follow the requester lane and remain occupied until passage; local same-polygon detours preserve body separation. Non-objective arrival tolerance is eight units. Floor-triangle seams, small native portal steps, destination clearance and stance-aware footprint caching now match live movement more closely.
- Seven portable recovery-smoke fixtures and Team Lab loading buttons added. Actual smoke screening precedes pickup on each map; one grenade consumed, zero model landing/bounce error. Controlled 2T/1CT calibration only, not full 5v5 utility certification.
- Final 22-round campaign source/fixture hashes verified: minimum separation 32.00001831, 14/15 combat rounds with no final blocked actor. Overpass B retains one blocked support beside a cover teammate; defuse completes. No-gun blocked survivors 16 -> 11; Ancient now plants/defuses, while Inferno/Overpass still time out without planting. Remaining cases are not certified fixed.
- 189 suites / 1,791 tests have passing evidence: full run 1,790 passes plus one timing failure under concurrent campaigns; unchanged isolated timing test passes at 1.89x versus 8x ceiling. Production build/type validation/worker startup pass; targeted engine/UI lint passes with existing script exclusions.
- Current Anubis browser worker recovery checked: smoke 1.500s, screening 1.516s, pickup 1.938s. Observer example left open on isolated port3371. Mirage drawing SHA256 unchanged; saves/careers preserved. v1-v9 replays readable; physical matches remain rehearsal-only.
- See docs/PHYSICAL-CROWD-RECOVERY-V10.md and docs/ui-review/map-pool/spatial-round-v10-summary.json.
- Next: cover-position/passing coordination on Overpass, remaining no-gun floor/body failures, moving 5v5 recovery utility and side-swapped series. No user redrawing required; packaged Windows/Steam validation remains separate.

## 2026-09-23 map pool and smoke pickup v9
- Shared corner/doorway yielding now covers mutual waits and stationary teammates. Circular planning reservations match runtime body separation; collision/floor/speed enforcement remains active.
- A nominated recoverer waits for actual smoke screening, with bounded cancellation and no mid-air freezing. Old v1-v8 recordings remain readable; physical careers remain rehearsal-only.
- Added portable 5v5 review fixtures and UI loading for all seven active maps. Six additional maps use 60 grounded native starts, multipart plant volumes and separately route-tested CT holds. Inferno native spawn candidates 39/40 are excluded from these review fixtures after failed approach checks; original source records and drawings are unchanged.
- Map Team Lab displays plant polygons and floor-filtered replay actors, contacts, shots, bomb and utility. Anubis worker playback visually checked in Chrome; later browser timeouts prevented completing Vertigo floor playback verification.
- The old Mirage 4326174 approach now plants and resolves at 86.328125 seconds, with no final blocked actors. Reviewed all-map campaign results and exact hashes are in docs/ui-review/map-pool/*-reviewed.json. No-gun stress congestion remains open; this is not full-map certification.
- Final evidence: 188 suites / 1779 tests pass; production build and worker startup pass. All 22 reviewed rounds have matching current source/fixture hashes, 15 combat outcomes with zero final blocked survivors, minimum separation 32.0014488374. No-gun cases retain 16 blocked survivors across seven maps; Ancient/Inferno/Overpass time out without planting. Those cases remain open, not certified.
- See docs/PHYSICAL-MAP-POOL-V9.md for files, reproduction, tests and remaining work. Latest Mirage drawing hash unchanged.
- Next: remaining crowd/uneven-floor cases and per-map authored recovery utility, then side-swapped series, career UI/resume and packaged Windows/Steam validation. No new user drawing required.

## 2026-09-23 recovery support v8
- Added bounded report-based covering aim during bomb recovery and existing save withdrawal. Firing still requires direct sight, reaction, aim and resolved collision/body hits.
- Added opt-in authored recovery smoke/flash with release-position and trajectory preflight, smoke screening and current friendly flash checks, preserved finite inventory, serialized grenade release and gun-use interval. Team Lab exposes trigger and release/landing markers.
- v1-v7 replays remain readable; old pending work cannot silently mix v8 rules. Physical careers stay rehearsal-only. Drawings and careers unchanged.
- Expanded Mirage campaign: six combat seeds plus no-gun; no body overlaps (minimum 32.03523). Includes recoveries, three combat plants, two defuses and an explosion. Seed 4326174 times out with T1/carrier T2 blocked at an approach; not certified as resolved. No authored utility in this map fixture; utility gates tested in controlled regressions.
- Typecheck, targeted lint, production build/worker pass. Final suite: 1769 passes plus one timing failure under concurrent build load; unchanged timing test passed separately (1.54x vs 8x limit). Total 187 suites / 1770 tests. See docs/PHYSICAL-RECOVERY-SUPPORT-V8.md and the extended v8 campaign receipt.
- Next: trace/fix seed 4326174's blocked entry/carrier approach while keeping collision checks, then smoke/pickup timing and cover-aware withdrawal, followed by additional-map calibration. No new drawing needed from the user. Browser and packaged Windows/Steam validation remain open.

## 2026-09-23 recovery route ownership v7
- Fixed the carrier-loss timeout: a nearby recovery goal reused an exhausted 72-unit-short following path. Routes now invalidate on task changes, independent of the 24-unit destination threshold; collision/retry rules remain intact.
- Controlled regression fails on preserved v6 and passes v7. Seed 4326172 now recovers twice and resolves at 64.67 seconds instead of timing out at 115 seconds. All four full-duration campaign cases resolve; combat and no-gun plant/defuse checks pass.
- 186 suites / 1761 tests, targeted lint, production type validation/build and worker startup pass. Concurrent production 404 / isolated viewer 200 verified. Old replay versions remain readable; physical career outcomes stay rehearsal-only.
- Updated local replay fixture shows the repaired recovery sequence. See docs/PHYSICAL-RECOVERY-V7.md. Latest Mirage drawing unchanged.
- Next: covering fire, disengagement and authored utility support for recovery attempts, then wider map/seed calibration. No new user drawing needed.

## 2026-09-23 objective coordination v6
- Added one nominated bomb recoverer, separate checked objective/retake/post-plant positions, actual planted-position defuse routing, and planted-site tactical locking. v1-v5 replays remain readable; new rehearsals use v6.
- Final full campaign: two real recoveries in seed 4326170; combat plant/defuse in 4326171; formerly jammed no-gun case now plants/defuses at 53.5 seconds (waits 680 -> 393). Combat seed 4326172 still times out after carrier loss. Collision separation preserved.
- 186 suites / 1759 tests, targeted lint, production build/worker pass. See docs/PHYSICAL-OBJECTIVES-V6.md. Latest Mirage drawing unchanged; physical matches stay rehearsal-only.
- Fixed review compiler output isolation: scripts/launch/start-radar-review.cjs plus process-local next.config flag. Production 404/dev viewer 200 verified concurrently without losing production manifest.
- Next: remaining carrier-loss/recovery-under-opposition timeout, tactical disengagement/utility support and broader map calibration. No user redraw required.

## 2026-09-23 squad spacing v5 and full-round checks
- Support direction follows the entry route around bends; supports ahead clear the approach, followers stop short along validated paths. Collision checks remain intact. New doorway regression passes.
- Same short Mirage seed: blocked movement ticks 866 -> 395. Three full-duration combat seeds resolve by elimination (8/6/8 eliminations); no combat plants. No-gun stress still jams near the B approach and times out without a plant.
- 186 suites / 1755 tests, typecheck, targeted lint, clean production build and worker startup pass. Initial generated-chunk build failure recovered after stopping preview and rebuilding. See docs/PHYSICAL-SPACING-V5.md.
- Next: objective-area congestion/head-on passing and bomb recovery/post-plant placement, then all-map/full-career validation. Physical outcomes remain rehearsal-only; no new user drawing required.

## 2026-09-23 physical combat v4 calibration
- Fixed recoil recovery/burst cadence and retry after a tracked teammate obstruction clears. Pending rounds/series cannot mix engine rules; old recordings remain viewable.
- Same Mirage seed: 300 -> 86 shots, 100 -> 442 damage, 1 -> 4 eliminations. Three combat seeds tested; longer movement-only run plants and defuses. Routing/formation and weapon balance remain provisional.
- 186 suites / 1753 tests, typecheck, targeted lint, production build and worker startup pass. See docs/PHYSICAL-CALIBRATION-V4.md. No new Windows/Steam/UI click-through check.
- Next: collision-validated support spacing, narrow-entry queues and endpoint clearance, then full-duration objective calibration. Career outcomes remain legacy-v2; user drawing preserved; no redraw needed now.

## 2026-09-23 physical career radar viewer
- Live matches can review an owned sealed physical rehearsal with recorded positions, reference-aligned images, player identity, floor/shot handling and canonical save checkpoints. Career outcomes remain legacy-v2. See docs/PHYSICAL-CAREER-RADAR.md.
- 185 suites / 1749 tests, typecheck, targeted lint, production build and worker startup pass. Chrome Mirage playback/end/backward-seek checked; full career dialog/recovery UI still open.
- Next: Mirage route/spacing and combat calibration, then authoritative result/reward gating. No user redraw needed now.

## 2026-09-22 Anubis interiors and radar routing
- Added 18 interior void boundaries (19 editable polylines), protected all native navigation, preserved drafts via independent import receipt/backup. Native Anubis physics categories and vertical mesh evidence inspected.
- Retired Nuke from new competitive/FPL/veto/fallback selection; Sandstone remains available. Saved Nuke matches and drawings preserved.
- Estimated radar gains deterministic obstacle routes, fixed freeze holds and conservative shot-link suppression; autoplay preview added. Physical career activation remains gated.
- 185 suites / 1746 tests pass; production build/worker passed; Chrome outline import and radar playback controls verified. See docs/ANUBIS-RADAR-REPAIR.md.


## Native reference visual follow-up
- Captured Nuke upper/lower and Anubis in Map Studio, plus actual MapRadarPanel with its existing mock fixture. Saved four-image gallery under docs/previews/native-maps-2026-09-22.
- Fixed overlapping native site labels and dense spawn names; blue CT/gold T pins now stay compact with full details on selection. 66 tests pass.
- Inspected weapons.vdata_c, item schema, surface properties, competitive CFG and 11 local demo files. Original squad-buy UI proposal and content reuse findings: docs/CS2-REFERENCE-OPPORTUNITIES.md. No Valve weapon/UI artwork added to the game.

## 2026-09-22 all supported native map references
- Added seven non-Mirage native extractions, nine floor drafts, 216 enabled spawn pins and 24 separate convex site pieces. All seven installed nav meshes match existing references.
- Native reference map/floor picker uses existing backup/Undo import flow. Mirage drawings, local careers and runtime simulation preserved.
- 64 targeted tests and type checking pass. Native runtime collision masks, grounded spawn selection and exact trigger overlap remain open. See docs/NATIVE-MAP-REFERENCES.md.

## 2026-09-22 native Mirage extraction
- Extracted installed map read-only with official VRF 20.0; navigation exactly matches current 2544-area reference.
- Added native A/B footprint draft, 33 spawn review pins, audit, reproducible import tools and Saved drafts action.
- 48 tests pass. Native collision masks, spawn grounding and trigger runtime integration remain open; no guessed wall heights or production engine changes.
## Mirage v13 review - 2026-09-22

Preserved owner v13 upload byte-for-byte. Restored four spawn/site floor bindings and A/B identities; added ten collision-tested reference routes and a numbered visual checklist. All 142 original point arrays and 116 utility markings retained. Errors reduced 28 to 19: 15 wall height bindings and four floor-coverage issues remain; seven blue openings need intent/heights. Both spawns fit five separated players. Report: docs/MIRAGE-V13-REVIEW.md. Updated Map Studio library points to v13; no automatic overwrite of local drawings or production engine activation.

## Physical match lifecycle follow-up - 2026-09-21

Implemented saved rehearsal purchases, armor repair, halftime/side swaps, repeated MR3 overtime, BO1/BO3/BO5 map progression and idempotent final preview settlement. Report: docs/PHYSICAL-MATCH-LIFECYCLE.md. Full suite 181/1712 passed; final focused 29 tests includes a complete real physical 5v5 BO1 through JSON resume, purchases and sealed receipts. Type-check, production build and bundled worker passed; local production server on 3370. Normal career engine/rewards remain unchanged. Next: live match/radar UI integration and recovery acceptance, then gated production result/reward adapter and real-map calibration. Owner: finish flagged Mirage geometry and export latest Map Studio JSON. No Steam upload.

## Physical engine follow-up - 2026-09-21

V3 team traversal and saved career-round rehearsal are implemented; production careers remain on the existing engine. See docs/PHYSICAL-CAREER-V3.md. Exact armor carry-over, authored jump/drop/crouch settings, pinned worker requests, main-thread settlement verification, final store ownership and save snapshot/hydration are covered. Full suite: 180 suites/1,701 tests; final focused tests: 18. Mirage still times out with 300 shots/one elimination; calibration and geometry are not accepted. Chrome timed out. Next: complete rehearsal match lifecycle (buys, side swaps, halftime/overtime/map resets and final ownership), then live UI and Windows/Steam acceptance. Owner exports reviewed Mirage JSON; original drawings and portraits preserved.

# TASK.md — Live state & priorities

> Update this file when state changes. Definition of done = closer to shipped on Steam.

## Current status (2026-09-14)

- **L31 QA executable now boots:** [report](docs/launch-readiness/evidence/L31-REPORT.md), [artifact inspection](docs/launch-readiness/evidence/L31-QA-PACKAGE.json). Corrected QA entry mapping, packaged Windows x64 successfully, and confirmed embedded server/main-menu renderer boot with isolated saves and Steam disabled. Test process stopped. Zero original-logo reference files in archive; 19 map and 10 old marketing paths still bundled. Release remains blocked; no Steam upload/review submission. Next: artifact-scoped content cleanup/review, release packaging and actual installed Steam acceptance, gallery/store completion.

- **L31 packaging follow-up 2026-09-15 (partial):** release beforePack still blocks 4,988 unresolved/changed source-inventory records; this is not a count of third-party assets. Direct Steam upload now verifies the app/content-root configuration and package before login, propagates failures, and avoids shell interpolation. Ship guard validates x64 PE headers/runtime files and rejects marked local QA packages. Added isolated local QA packaging (`npm run qa:package`) with separate saves and disabled Steam initialization; packaging/runtime acceptance remains in progress. 21 targeted tests pass and type-check passed. No upload or resubmission; owner careers/drawings unchanged.

- **Steamworks follow-up 2026-09-15:** redesigned outlined title/EM icon and 18 exact-size image/icon files in `marketing/esports-manager-steam-assets-4326170/UPLOAD-READY-v2`; upload-only ZIP excludes confusing masters. [Live review audit](docs/launch-readiness/evidence/STEAM-REVIEW-2026-09-15.md): store already approved/Coming Soon; **Build 23989573 rejected because configured EsportsManager.exe is absent**, screenshot overlays and Early Access wording also flagged; trailer incomplete. English summary, English/Swedish long descriptions and three uploaded feature panels saved as unpublished Steam drafts. Store/library capsule uploader remains blocked; files local only. **Do not resubmit the failed build. Next: actual Windows package/depot validation (L31), gameplay-only gallery and store upload completion.** Careers/Mirage/game code untouched.

- **Steam artwork follow-up delivered:** [18 exact-size assets, ZIP and upload guide](docs/launch-readiness/evidence/L30-STORE-ASSETS.md). Approved campaign extended to store/library capsules, hero, transparent vector title, icons and optional events. Asset dimensions/alpha/ICO/hashes and local preview links verified. No browser is available, so Steam upload remains unperformed despite owner authorization. Current gameplay captures remain open. **Next: upload and verify in Steamworks when connected; development L31 remains next.**

- **L30 increment delivered; acceptance partial**: [report](docs/launch-readiness/evidence/L30-REPORT.md). Fixed SDK achievement/stats calls, account-scoped achievement caches/retry, Cloud discovery, deliberate conflict selection with retained originals and guarded uploads. L29 adds media-folder imports, retained image bundles and pinned offline Workshop selection. Read-only real Steam probe confirms owned App ID 4326170 and Cloud enabled; no owner account mutations. 1,650 tests / 172 suites, types, build WOMDt4J9XzaXV0mhJvMsO and isolated Electron IPC pass. Four new promotional PNG masters, feature description and [local store preview](marketing/steam-2026-09-14/preview.html). Exact capsule exports and real screenshots remain. Owner careers/Mirage/base snapshots preserved. Content gate: 4,988. **Next L31: actual Windows shipping artifact**, alongside L29/L30 lifecycle/UI, two-device/account Cloud validation, durable retry, identities, 5v5/calibration and content clearance.

- **L29 local increment delivered; acceptance partial:** [report](docs/launch-readiness/evidence/L29-REPORT.md). Atomic JSON database install/backup/restore, preview, schema/path/reference limits and base-game fallback. Separate unpublished `dist-mod/real-teams-2026`: 198 teams/logos, 1,368 player identities, 1,323 original portraits; 45 missing/corrupt. No Steam upload or publication scheduled. 1,638/170 tests, production build `oLnHAm-kha__OkZyd5b_s`, worker startup and isolated real Electron IPC pass. Image pinning, folder installer, real Workshop lifecycle/UI, packaged tests and rights clearance remain open. Owner careers/Mirage/base snapshots preserved. Content gate: 4,988. **Next L30**, alongside L29 follow-up and earlier identities, 5v5/calibration and player testing.

- **L28 balance increment delivered; acceptance partial:** [report](docs/launch-readiness/evidence/L28-REPORT.md). Paid/affordable AI recruits, retirement contract cleanup, finite awards, round-based KPR and solvency reconciled after prize settlement. Staged 30 seeds × two policies × 520 small-world ticks (31,200 total), 270 tactical matches, full-world failures and follow-ups retained. Final settlement follow-up: two full-world cases complete 520 ticks, four stop at genuine bankruptcy, 37,162 matches and no structural failures; 30-seed final full-world and ten human/integration cases remain open. 1,618/168 tests, types/build/worker pass; build `EA-MVYDvWDNj7iTVNZQMI`, preview 3210 PID 306488. Owner careers/Mirage/snapshot preserved. App ID 4326170 passes; content gate holds 4,988 items. **Next L29**, alongside balance, earlier player/UI testing, identities, full 5v5/calibration, real performance, Windows packaging and clearance.

- **L27 measured increment delivered; acceptance partial:** [report](docs/launch-readiness/evidence/L27-REPORT.md). Recruitment quote reuse within one vacancy fill and precomputed role-weight entries reduce direct stress median 1.66 s to 0.65 s; bundled Node VM 6.05 s to 2.09 s. All eight paired outputs/RNG match. 1,610 tests / 167 suites, types/build/worker pass; build `cAVrB5l32x2qQWbl99c0j`, preview 3210 PID 322816. Frozen fixtures, CPU profile, 52-tick compute soak and asset census archived. Browser unavailable; 12 real performance cases NOT_RUN. Careers/Mirage/snapshot preserved. App ID 4326170 passes; content gate holds 4,988 items. **Next L28**, alongside target-hardware/UI/storage/memory acceptance and earlier player testing, identities, full 5v5/calibration, Windows packaging and content clearance.

- **L26 increment delivered; acceptance partial:** [report](docs/launch-readiness/evidence/L26-REPORT.md). Exact finance/contract money, actual income bars, accessible progress values, safe inbox titles and guide edits. Bootcamp card/guide now show the existing flat +50 XP per player. Audio throttling, gentle warnings and music cleanup/scene ownership added. 1,608/166 tests, types/build/worker pass; build `2GX-oYzTzbaGEiXjb0G1r`, preview 3210 PID 491460. Browser unavailable; all 18 real UI/audio/content cases NOT_RUN. Inventory: 1,368 players / 161 portraits, 289 editorial candidates / 103 files. Careers/Mirage/snapshot preserved. App ID 4326170 passes; content gate holds 4,988 items. **Next L27**, alongside earlier UI/player, L25 identities, full 5v5/calibration, Windows packaging and content clearance.

- **L25 implementation increment delivered; acceptance partial:** [report](docs/launch-readiness/evidence/L25-REPORT.md). 198-team catalog; 12 new + 3 retained crest studies, 183 shared-family identities remain. Unified logo resolution, dark outline and clipping fixes; 594 reviewed-format exports verified, 18 identical-pixel groups. 1,595/164 tests, types/build/worker pass; build `cq8dsNxFQpI_H_o3H8Svp`, preview 3210 PID 531800. No real UI/packaged acceptance or visual/content approval. 1,368 portrait paths resolve but PNG format flags remain. Careers/Mirage/snapshot preserved. App ID 4326170 passes; content gate blocks 4,986 items. **Next L26**, alongside remaining identity work, earlier UI/player testing, full 5v5/calibration and packaged Windows/content gates.

- **L24 implementation complete for this increment; acceptance partial:** [report](docs/launch-readiness/evidence/L24-REPORT.md). Scoped focus in signing/settings dialogs, slider/switch/input names, numeric map creation/refinement and lab placement, validated startup contrast preference, reduced-motion confetti and English-only readiness. 1,589/163 tests, TypeScript, build `s-yb7lubDHeLiB9Wk6WOV` and worker startup pass. Preview port 3210 PID 531792. Browser selection reports unavailable; all 42 L24 UI cases NOT_RUN. Source scan: 2,088 text candidates / 146 files, translation helper not consumed by UI, glyph checks open. Careers and Mirage drafts preserved. App ID 4326170 passes; content gate blocks 4,984 unresolved/changed items. **Next L25**, alongside L24/L23/L22 acceptance, full 5v5/calibration, packaged Windows tests and content clearance.


- **L23 interface consistency implemented, acceptance partial:** [report](docs/launch-readiness/evidence/L23-REPORT.md). Compact headings, shared dialog/table/tab/empty/loading improvements, viewport-safe custom overlays, per-career session filters and main-panel scroll restoration. 1,571 tests / 162 suites, TypeScript, production build and worker startup pass. Build `P6YMlEYBkceFlAeTBiDU5`; preview port 3210 PID 389184. Static inventory covers 40 routes; 150 UI cases NOT_RUN because no browser surface is available. Careers and Mirage drafts untouched. Content gate blocks 4,979 unresolved/changed items; Steam App ID 4326170 passes. **Next L24**, while L23/L22 UI/fresh-player, 5v5/calibration and packaged Windows/content gates remain open.


- **L22 first-session implementation:** contextual four-action career guide, actual-choice completion, canonical guide/weekly-focus persistence, skip/replay isolation, setup draft recovery, affordability/eligibility/error guards and direct roster-builder entry. **1,560 tests / 159 suites**, build `X-YUbkV5tvJuK3DL9cuDK`, compiled-worker startup and actual isolated Electron store/save/load/first-match lifecycle pass. [L22 report](docs/launch-readiness/evidence/L22-REPORT.md). **Partial:** browser unavailable; full UI/resolution/setup/recovery validation and 12 fresh-player sessions remain open (**0 tested**, protocol prepared). L21 full 5v5/calibration and full-world economy also remain open. Preview PID 398944 / port 3210. **Next: L23 interface consistency across routes.** Steam App ID **4326170** passes; **4,975 content items** and packaged Windows acceptance remain gates. Owner careers and Mirage drafts preserved.

- **L21 match-management implementation:** regroup timeouts replace flat win boosts; managed-team loadouts, paid-prep/fixture guards, starter validation, active-match quick-sim protection, historical lineup recording and actionable reports. **1,553 tests / 158 suites**, build `w85noNhQbAmNk10nuJvH6`, paired engine audit and actual native-worker checks pass. [L21 report](docs/launch-readiness/evidence/L21-REPORT.md). **Partial:** browser unavailable; all live BO1/3/5/back/resume/UI paths, full 5v5/L14, calibration and full-world economy acceptance remain open. New optional lineup IDs preserve history; old pending rounds are retained, but future rounds use new regroup rules. Preview PID 370896 / port 3210. **Next: L22 onboarding and the first session.** App ID **4326170** passes; **4,973 content items** and packaged Windows acceptance remain gates. Owner careers and Mirage drafts preserved.

- **L20 career implementation:** unified job-offer validation and one-time rewards, per-club academy/scouting/board archives, multi-stint season history, correct prize/legacy trophy attribution, relative board targets and late-arrival grace, contextual decisions, and team-filtered season recaps. **1,541 tests / 157 suites**, build `HgrJLttZZgAy4aZACqOIU` and actual native worker checks pass. Two identical **520-week** careers make **two club moves**, retain **12 stints**, have no roster shortages and peak at 502 events. [L20 report](docs/launch-readiness/evidence/L20-REPORT.md). **Partial:** three-club fixture, excessive final cash, no natural new decisions, full-world/UI/recovery and archived-academy lifecycle remain open; same-week tenure attribution and MVP history need follow-up. Preview PID 568668 / port 3210. **Next: L21 match management and tactical agency**, alongside these checks and L14. Steam App ID **4326170** passes; **4,971 content items** and packaged Windows acceptance remain gates. Owner careers and Mirage drafts preserved.

- **L19 implementation and format validation:** corrected 12-team byes, BO5 finals stopping at 2?1, conflicting/future-week scheduling, source-slot progression, terminal-result rewards, season-specific qualification/circuit receipts, full GSL placements and transitive standings ties. Shared UTC calendar dates include historical fixture days. **1,533 tests / 156 suites, production build `bxlHNghfTicUnk6xOcJ0h`, and actual Electron worker checks pass.** Thirteen isolated real-simulation tournament cases each repeat through weekly save/load, including rollover and season-2 qualifier promotion. [L19 report](docs/launch-readiness/evidence/L19-REPORT.md). **Partial:** full-world/multi-season/player/job-switch/daily/UI acceptance, historical malformed brackets, format-copy reconciliation, L14 and economy remain open. Browser unavailable; preview PID 368352 on port 3210. Owner careers and Mirage drafts preserved. **Next: L20 long careers, board/jobs/season outcomes**, alongside these checks. Steam App ID **4326170** passes; **4,969 content items** and packaged Windows acceptance remain release gates.

- **L18 organization implementation:** facility/staff previews now share actual effects/upkeep, sponsor eligibility resolves canonical offers, sponsor totals and incremental income match settlement, equipment duplicate charges/slot stacking are blocked, stale staff hires and false renewal-success UI are fixed. **1,519 tests / 155 suites, production build `tePTzTD8nT08jz6H4qLMx`, and actual Electron worker checks pass.** Two 52-week investment plans repeat exactly through real actions and save/load; cheaper upkeep remains meaningful. [L18 report](docs/launch-readiness/evidence/L18-REPORT.md). **Partial:** no browser available, remaining organization flows, L16/L17 full-world supply/economy and L14 full-match acceptance still open. **Next: L19 calendar, tournaments, qualification and rankings**, alongside those follow-ups. App ID **4326170** passes; content gate has **4,968 unresolved/changed items** and packaged Windows/Steam testing remains required. Owner careers and both Mirage drafts preserved.

- **L17 continued:** working day-by-day academy selectors and individual focus, configured facility growth bonuses, employed staff/scout guards, hidden-potential protection, unique academy lineup slots, authoritative drill catalog, correct leadership/stress rewards and full recovery. **1,511 tests / 154 suites and production build `xxRdaGdl1-ff-d8WaWmDl` pass.** Three age/potential profiles x three plans repeat over 52 academy weeks. The repeated 520-week real lifecycle soak preserves ownership and final saved-state equality: 401 matches, 10 retirements, 8 promotions. It also exposes 85 weeks with a four-player human roster and excessive cash in the three-club fixture; full-world supply/economy acceptance stays open. Browser control still times out. [Current L17 report](docs/launch-readiness/evidence/L17-REPORT.md). **Next: L18 staff, sponsors, facilities and equipment**, alongside remaining L17 browser/balance and L14 full-match validation. Steam App ID is **4326170**; content clearance and real packaged Windows/Steam testing remain required. Owner careers and Mirage drawings preserved.

- **L16 follow-up + L17 implementation:** optional AI investments now budget ongoing upkeep; three repeated 104-week synthetic finance scenarios stay solvent. Registration validates senior ownership/contracts and entry rules. Corrected bench match rewards, fractional academy growth, day-ordered fatigue/recovery, duplicate weekly academy processing, retired/foreign role training, specialist stat caps and prospect deletion/promotion guards. **1,505 tests / 154 suites pass**, fresh production build `1e5CW0tWz8eP6RO_F5jCn`, native week and six spatial replay scenarios pass. Three 52-week academy plans repeat through weekly save/import and promotion. [L17 report](docs/launch-readiness/evidence/L17-REPORT.md). **Steam App ID 4326170 restored locally**, corroborated by the installed game manifest and deployment configuration; ID gate passes. Browser connection timed out, so new UI acceptance remains open. Next: finish L17 browser/ten-season lifecycle validation, then L18 staff/sponsors/facilities/equipment. L16 full-career economics/eligibility/hidden-information review, L14 full 5v5 integration, packaged Windows acceptance and content clearance remain open. Source content gate reports 4,967 unresolved/changed items. Owner careers and Mirage drawings were not changed.

- **L16 recruitment implementation pass:** shared report-dependent OVR, shortlist/squad comparison, own-staff scouting with upgrades/cancellation, canonical market negotiations, academy/ownership and stale-offer guards, safe lineup swaps, full-cost AI recruitment and ledgered AI transfers. See [L16 report](docs/launch-readiness/evidence/L16-REPORT.md). Full suite: **1,495 tests / 153 suites pass**; final Swap fix: 31 focused tests pass; production build and native worker/replay checks pass. Browser scout/compare/sign/starting-lineup/reload/friendly workflow verified, owner career restored unchanged. Unused substitute match XP is an L17 follow-up. The 104-week repeated synthetic run preserves ownership/contracts but one AI club enters debt; economic acceptance remains open. **Next: L17 development, training and academy**, alongside L16 economy/eligibility and remaining L14 validation. Packaged Windows testing, the Steam App ID and content clearance remain required.

- **Logo follow-up:** removed the small letter tags under generated club emblems at every size; full team names remain in their cards.

- **L15 finance/contract implementation:** generated portraits now use stable player IDs across profiles, squad, career previews and lists; Offer contract sits below Current Team with independently scrolling terms. Generic club letter tiles use distinct original vector motifs.  durable recurring/activity receipts prevent repeated payments and consequences; academy upkeep is in the shared report, dashboard and negotiation preview; dated staff expiry precedes training/match indexes; conditional player win/MVP bonuses use shared weekly/live commit logic. Twelve-week forecasts respect expiry and show debt; invalid signing/release/renewal paths are guarded. **1,482 tests / 152 suites pass**, with 33 final portrait/emblem/save-preview checks passing. Production build and browser profile/signing/career-preview checks pass. [L15 report](docs/launch-readiness/evidence/L15-REPORT.md) and [Windows finance runtime](docs/launch-readiness/evidence/L15-finance-runtime.json). Stable finance fixture reconciles 52 weeks; distress reaches the documented eighth insolvent settlement; owner Mirage hashes unchanged. **Partial:** full cross-surface/long-career and packaged acceptance plus L03/L04 dependencies remain open. **Next: L16 squad, recruitment, scouting and transfer AI**, carrying contract/affordability follow-ups and remaining L14 5v5/career parity/recovery checks. Windows packaged testing, real Steam App ID and content clearance remain required.

- **L14 integration preparation:** sealed spatial-round-v1 worker replay; shared lab scoreboard/radar/health/outcome/reward projection; collision-resolved observer shot lines; export and saved-position resume. Career compatibility fixes preserve saved veto maps, sides and seed zero, restore actual pending events and visible deaths, prevent stale checkpoint writes and duplicate result rewards. **1,447 tests / 150 suites pass.** [L14 report](docs/launch-readiness/evidence/L14-REPORT.md). Six actual compiled-worker scenarios repeat and match Node exactly; visible browser save/reload/resume, changed-seed rejection and export reproduction pass. Final build c6WiZjNWoq-AbKYiUY1zh. 52-week legacy benchmark: 1,546 matches / 17.23 seconds (above 10-second target). **Partial:** full spatial career stream/5v5 integration, mode parity, packaged recovery and upstream review remain open. Owner Mirage 169 marks/hashes unchanged. **Next: L15 finances and contracts**, alongside L14 full-match acceptance and Mirage/utility calibration. Windows packaged testing, real Steam App ID and content clearance remain required. Prior queued portrait/results/Hall of Fame UI work remains pending.

- **L13 team coordination implementation pass:** independent team lab with delayed/uncertain radio knowledge, entry/support/lurk/anchor roles, inspectable plans, body spacing, collision-tested shots, planted/dropped bomb handling, full objective timers, save decisions and bounded utility spending. Six Mirage 2v2 examples, portable settings and team/observer replay views are implemented. **1,435 tests / 147 suites; 60 focused tests; types/build pass. Six actual compiled-worker scenarios repeat and match Node in full; five L12 utility regressions pass.** [L13 report](docs/launch-readiness/evidence/L13-REPORT.md). Browser edit/reload, delayed reports, replay controls and exact export reproduction verified. L13 remains **partial** for full 5v5/all-map coverage, congestion/angle tactics, calibration and dependencies. Owner Mirage SHA/169 marks unchanged; 17 wall bindings and spawn/site/vertical review remain open. **Next: L14 versioned authoritative match/replay integration**, alongside that review. Windows packaged testing, real Steam App ID and content clearance remain required. **Queued UI requests:** transfer signing portrait; compact match results; compact Hall of Fame with original-inspired fictional aliases. Owner returned priority to L13, so these UI requests are not yet applied.

- **L12 utility lab:** world-space flight/bounces, inventory and timed smoke/flash/HE/fire/decoy effects now resolve in the controlled encounter. The editor adds scheduled throws, editable landing/bounce targets, model-versus-draft diagnostics and 2D effect replay. Five original Mirage fixtures; **1,418 tests / 146 suites pass**. [L12 report and runtime evidence](docs/launch-readiness/evidence/L12-REPORT.md). Read-only Mirage review preserves 169 marks and both owner hashes; 20 errors / 87 notes remain. **Next: L13 team knowledge/tactics**, alongside L10/L12 calibration and Mirage wall-height/zone review. Dynamic entities/materials and all-map verified lineups remain open. Windows packaged testing, real Steam identity and content clearance still block launch acceptance.

- **L11 controlled encounter:** implemented bounded 64 Hz perception, reaction, decaying last-seen knowledge, aim turning/spread, movement accuracy, burst/recoil, ammo/reload, head/body hits, armor and opaque-geometry shot resolution. Outcomes emerge from the event timeline, with same-tick lethal trades. The lab adds five Mirage examples, separate player/world inspection, focused 2D replay, slow motion and portable settings. **1,394 tests / 145 suites pass; 21 final encounter tests pass**, including two additional burst/ammo checks. [L11 report and latest runtime evidence](docs/launch-readiness/evidence/L11-REPORT.md). L11 remains **partial** for calibration, broader map/packaged evidence and L04/L10 dependencies. All owner Mirage source markings remain preserved. **Next: L12 utility flight/effects and smoke/flash/HE/fire cover**, alongside Mirage wall heights, CT/A/B bounds and vertical review. L13 team decisions and L14 live-match integration follow. Windows packaged testing, the real Steam App ID and content clearance remain launch requirements.

- **Mirage v12 follow-up:** preserved all 169 uploaded marks and generated a separate 179-mark copy with ten reference routes plus portable 3D lab tests. Added opening overlap/length/metadata diagnostics and clearer issue focus. **90 targeted tests / 5 suites, types, production build and ten repeated native routes pass**; full suite not rerun. Motion fields match Node/Chromium exactly; display-heading last-bit differences keep whole-frame cross-runtime equality open. [Updated audit](docs/launch-readiness/evidence/MIRAGE-V12-REPORT.md). **Next: review the two blue/green overlaps, seven default windows, 17 wall heights and CT/A/B ground boundaries; continue L11 perception/shots alongside L10 calibration.** L09/L10 remain partial; Windows packaging, real Steam App ID and content clearance remain required. Older status entries below are historical.

- **L09 validation and L10 lab integration:** preserved the original 142-mark Mirage upload, measured registration for all 10 radar floors and added a separate review copy with A/B names and provisional ground ranges. Studio exposes floor/body/route checks, issue focus, portable validation receipts and held coverage. Registered walls and safe zone endpoints feed independent lab tests, with supported movement, constrained smoothing, optional one-way arcs and stationary teammate obstacles. **1362 tests / 143 suites pass**; browser import/backup, check reload, lab geometry reload and CT?A arrival (9.125s) verified. Both packages remain **partial**: 15 wall heights, CT/A/B floor boundaries, manual vertical traversal, measured calibration and moving-team coordination remain open. [L09 report](docs/launch-readiness/evidence/L09-REPORT.md), [L10 report](docs/launch-readiness/evidence/L10-REPORT.md). **Next: L11 controlled perception/shot encounter, alongside Mirage/L10 review.** Packaged Windows testing, real Steam App ID, content clearance and earlier prerequisites remain required.

- **L04 then L05 implementation pass:** fixed zero-seed and long-stream determinism, UTC recovery year, stale worker/career ownership, and pending manual-save close. Unified career difficulty, bounded persisted device settings, clarified local-career deletion and propagated delete failures, and kept Studio/first-gesture/background audio quiet. **1347 tests / 141 suites pass**, fresh types/build/compiled worker pass; ten actual Chromium worker/fallback/reload comparisons and native cancel/autosave/17-second save plus preference restart pass. Both packages remain **partial** for packaged Windows/OS lifecycle and L02/L03 prerequisites. Browser settings UI check timed out twice. [L04 report](docs/launch-readiness/evidence/L04-REPORT.md), [L05 report](docs/launch-readiness/evidence/L05-REPORT.md). **Next: L09 — register and validate Mirage annotations, spawn areas and bombsites**, then L10–L14. Real Steam App ID and content distribution clearance are still required. Owner Mirage SHA remains unchanged.

- **L08 then L03 completed implementation pass:** content/lineup provenance rosters, packaged notices and a fail-closed builder/release gate added; map/assets permissions and current Steam media remain unresolved. Save recovery fixes cover transaction acknowledgement, literal native staging keys, no silent backend fallback, validated recovery, save queuing, custom tactics/live-match/watchlist persistence and career isolation. **1,331 tests / 137 suites pass**, production build/worker pass; three real adapters pass fault injection and fresh-process reload. Both packages remain **partial** pending historical-save/UI/packaged and rights acceptance. [L08 report](docs/launch-readiness/evidence/L08-REPORT.md), [L03 report](docs/launch-readiness/evidence/L03-REPORT.md). **Next: L04 deterministic simulation/worker ownership, then L05 lifecycle.** Preserve owner drafts and existing careers; the extra Mirage backup is outside the project. Real Steam App ID and content clearance are still required for a releasable Windows candidate.

- **L07 Electron/IPC hardening:** all 41 channels now share exact main-frame/origin validation and bounded schemas. Protected native settings from renderer storage/clear; contained mod/log/GPU writes and mod asset reads; fixed local-port fallback; removed production eval allowance after real Electron renderer/worker checks. Steam Cloud write/delete rejection now propagates truthfully while local saves remain available. Full suite **1,322 tests / 135 suites passes**; production build/worker and real sandboxed Electron probes pass. **Partial:** actual packaged security/lifecycle acceptance and L06 prerequisites remain open (real Steam App ID absent). [L07 report](docs/launch-readiness/evidence/L07-REPORT.md). **Next: L08 content provenance and distribution rights, then L03 save/recovery; repeat L06/L07 native acceptance on the Windows candidate.**

- **L06 dependency/runtime upgrade:** full and production npm audits now both report **0 known vulnerabilities**, down from 47 / 7. Next 15.5.25, React 19.2.8, Fiber 9/Drei 10, Electron 44.3.0 and patched image/spreadsheet/build tools installed reproducibly. Full regression **1,311 tests / 133 suites passes**; clean types, production build and actual worker pass. Existing QA career, 142-mark Mirage draft and lab playback verified in browser. Electron's real Node runtime loads Steamworks and serves the production main menu. **Partial:** missing real Steam App ID prevents release packaging; actual packaged graph, native window/IPC/offline and L02 fault acceptance remain. [L06 report](docs/launch-readiness/evidence/L06-REPORT.md). **Next: L07, L08, then L03; complete L06 native acceptance with the next Windows candidate.**

- **Identity/profile follow-up:** 1,368 stock handles and 198 clubs refreshed from verified original correspondence; existing careers migrate stock labels while retaining IDs/custom names. Profiles now use compact navy surfaces, readable metrics, plain labels and restrained motion. Fixed the profile refresh race found in browser QA. Full suite 1,306/131 passes; final focused 6/2 passes. Portrait cleanup is now complete with owner-approved local processing: 11 PNGs plus 11 WebP siblings, used by 88 stock players. RGB preserved, true alpha verified, live assets checked. Durable backups are outside the project in EsportSimulator-backups/portrait-edges-jYw20o. [Detailed report](docs/audit-2026-09-13/IDENTITY-AND-PROFILE-POLISH.md). Next: L06-L08 and L03.

- **L01/L02/L34 execution:** [product contract](docs/launch-readiness/PRODUCT-CONTRACT.md) complete; seven deterministic QA careers and real browser new-career/recruit/train/match/week/save/reopen journey implemented/executed. L02 remains partial for fault/scenario acceptance. Shared release runner and CI checks now preserve failures; L34 remains partial for packaged identity, rights and prerequisite closure. Full recorded suite 1,300 tests/129 suites passes; 16 final targeted tests pass. Release checks correctly NO-GO. [Reports](docs/launch-readiness/evidence/L34-REPORT.md). **Every completion report must name next work and remaining acceptance.** Next launch work: L06-L08, then L03. Current owner steering: closer original-inspired fictional team/player names and remove portrait white fringes.

- **Current launch execution index:** [Windows 1.0 launch plan](docs/launch-readiness/README.md), confirmed by the owner. Includes 36 master prompts, 144 implementation tasks, 108 acceptance criteria, all 40 routes and a crosswalk of the earlier 60 packages. Current decision **NO-GO**: fresh strict readiness scan fails (1 HIGH/1 MEDIUM), Windows ship artifact is absent, and L06 dependency audits now have zero known findings; actual packaged dependency acceptance remains open. Fresh 500-week hardening and limited compliance scans pass. Next: L01/L02/L34, dependency/IPC/rights triage (L06-L08), save recovery (L03), then the Mirage encounter milestone. Old numbered priorities below are historical detail; this launch pack governs sequencing.

- Simulation lab at `/map-editor/lab`: eight maps with versioned world-space navigation/height, static collision references, directed route checks, fixed-step movement and sight inspection. Independent saved tests preserve annotations and career state. The latest Mirage spawn/site attachment is preserved (142 marks) and available in Saved drafts. Full suite: **1,283 tests / 127 suites passed**. [Guide, provenance and remaining limits](docs/SPATIAL-LAB.md). Live spatial combat, grenade physics and match-outcome integration remain unfinished.

- Map Studio tactical upgrade: preserved the user's unfinished 14-wall Mirage upload unchanged; added five grenade types with throw/bounce/landing points, 13 researched purpose templates, CT/T and bombsite polygons, callouts, label positioning, locks, duplicate/focus, team/search filters and version 1 migration. Native file-picker automation remains extension-blocked; saved-draft opening works. See the [tactical guide](docs/MAP-STUDIO-TACTICAL.md).

- Baseline audit: `f0c1f814`; [audit, 28 findings and 60-package plan](docs/audit-2026-09-12/README.md).
- First cleanup batch is implemented locally: worker request safety and production startup, compute-only worker/fallback with final store commit, canonical save serialization, consistent recurring finances, shared autosave/close lifecycle, audio preferences, responsive progression controls, and initial Electron boundary fixes.
- [Implementation report](docs/audit-2026-09-12/IMPLEMENTATION.md) records verification, evidence and remaining acceptance. Full suite: **1,207 tests / 121 suites passed**. Dependency versions are unchanged; 47 baseline findings still need triage.
- Glass interface pass: floating lens-edged shell, system typography, clearer dashboard, shorter route motion, and Ctrl/Cmd+K navigation search. See [design and verification notes](docs/audit-2026-09-12/GLASS-INTERFACE.md). This implements shared visual/navigation improvements; individual feature-page redesigns remain in the backlog.
- Team/radar pass: cleaner small crests, isolated SVG IDs, logo fallback recovery, larger top-down radar, independent floor/view controls, stable 3D overview and keyboard map cards. [Asset audit and remaining work](docs/audit-2026-09-12/ASSETS-AND-RADAR.md). Current full suite: **1,213 tests / 123 suites passed**.
- Updated direction: radar is now 2D only; fictional names retained. Three individual logo studies are implemented. [Mirage geometry handoff, source inventory and spatial simulation plan](docs/audit-2026-09-12/MIRAGE-AND-LOGO-DIRECTION.md). Remaining 195 logo redesigns and physical movement/combat are unfinished; user selected Mirage for annotation. Seven targeted tests passed; prior full-suite count above predates this pass.
- Map Studio is implemented at `/map-editor`, accessible from Settings & Tools and the advanced map builder. It supports four-color annotations, editing, undo/redo, zoom/pan, layers, labels/notes, per-map/floor local drafts, validated project import/export, and PNG export. [Guide and verification](docs/MAP-STUDIO.md). Annotations are portable review drafts; live simulation integration remains pending.
- Next: complete persistent-field/recovery coverage, test close/save in packaged Electron, triage dependencies and remaining IPC, then apply the shared visual/accessibility system across all routes. The full 60-package program is not complete.
- Packaged Electron, live Steam/cloud, complete accessibility, and multi-season gameplay acceptance remain pending. No commit, push or release was performed.

**Historical notes below:** June branch/PR status, counts, approval notes, and priority queues are retained as history, not current instructions or verified current state. Reconcile still-relevant items into the September plan rather than maintaining competing backlogs.

## Status snapshot (2026-06-14)

- Branch: `claude/nice-babbage-uusrux` — UX/feel/progression program (`AUDIT_UX_2026-06.md`).
  Shipped Waves 1→5b (hub unification, feedback, cross-save progression, onboarding,
  verified fixes, milestones, sponsor depth, polish). Gates green throughout
  (tsc 0 · jest 1007 · lint 0); +24 regression tests.
- Open from that audit: minor polish (E5–E10, F3/F9–F10) and the **G1** passive-
  training-pipeline decision. (Re-verified in code 2026-06-18: **B5** live-match agency
  shipped — Tactical Timeout, 2/match, +6% bounded round boost + opponent-momentum
  neutralise, `useLiveMatch.ts` + `match-tactical-timeout.test.ts`; D11/D12/E7/B12/F8/E10
  also shipped.) See `AUDIT_UX_2026-06.md` "Implementation status".

## Status snapshot (2026-06-09)

- Branch: `claude/great-knuth-0Wbbf` — **9 commits ahead of main, pushed; PR open.**
- Quality gates: `tsc` 0 errors · `jest` 958 passed / 82 suites · `next lint` 0 errors.
- Working tree: clean.

## On the branch (awaiting review/merge)

1. `c0e80f3` Audit r1 — league completion (prizes/champions were never awarded), Swiss multi-BYE corruption, finance replay dedup, save-write serialization (+11 tests).
2. `0262b11` Audit r2 — softlocks, dead buttons, UI crashes, AI ranking drift (+3 tests).
3. `5b5c89c` Game feel — toast audio feedback, `<AnimatedNumber>` money count-ups.
4. `fed336d` Onboarding — fixed broken Replay Tutorial (dead flag), mounted the orphaned Help & Game Guide globally.
5. `9e64ba1` Bug tail — poaching-offer inbox pile-up, 12-week job-change cooldown (signing-bonus exploit), truthful RMR formats (+4 tests).
6. `da59f2b` Season Objectives dashboard panel (derived, adaptive goals).
7. `c138ef6` Board Expectations & Confidence — season reviews, confidence meter, on-notice warning, SACKED game-over, board-backing rewards (+12 tests).

## Priority queue

### P0 — Ship the branch
Open PR → review → merge. **Blocked on user's explicit go for PR creation.** After merge: manual verification pass (see P1 risks) on a real save.

### P1 — Manual verification debt (not covered by unit tests; jest is node-env only)
- [ ] Play a 52-week season in the browser: board review fires once, news posts, confidence moves, reward ledgered.
- [x] `boardState` survives the save-builder round-trip — `__tests__/save-snapshot-roundtrip.test.ts` (the *real IndexedDB* write is still browser-only, but the field-drop failure mode is now guarded).
- [ ] SACKED game-over overlay renders correctly (use DevTools to force confidence low + on-notice).
- [ ] Toast sounds: confirm sparse/not annoying in normal play; respect mute toggle.
- [ ] Help "?" button placement vs BugReportButton on small viewports.

### P2 — Verified-open engineering debt (deferred deliberately; see AUDIT_2026-06.md §2)
- [ ] **Determinism hardening** — mid-tick `lastRngSeed` re-seeding + cosmetic RNG draws (e.g. news engagement numbers) can shift sim outcomes between otherwise-identical runs. Invisible to players; highest-risk refactor in the codebase. Needs a dedicated seed-replay test harness FIRST (run same seed twice, assert identical save JSON), then split cosmetic vs sim RNG streams.
- [ ] Proper small-field Swiss (8-team) — currently relabeled honestly as `bracket` in `data/tournaments.json`. Only worth doing with pairing tests like `swiss-pairing.test.ts` extended to 8-team fields.

### P2.5 — UI/UX polish program
Six audits completed + verified → **`UI_POLISH_PLAN.md`** (phased: money-flow correctness → global
quick wins → semantic visual system → feedback → performance → 1024×640 layout → a11y → QA gate).
Phase 0 is correctness, not polish — do it regardless. Awaiting go.

### P2.6 — Audit wave 3 (see AUDIT_WAVE3.md)
12 verified findings FIXED (aging was entirely missing; facility upgrades never reached match
strength; retired-player signing; unledgered budget path; clamp sweep; fanbase cap). The three
decision-gated "top open" items have since ALL shipped (re-verified in code 2026-06-18):
activeMerchItems→fan income (`economy-engine.ts:150`), the three "dead" settings wired
(`settings-store.applyWindowSettings`, game-speed→playback, notifications→toast gate), and
sponsor re-sign cooldown (`team.sponsorCooldowns`). See AUDIT_WAVE3.md "Open items EXECUTED".
All wave-3 P2 items now resolved (2026-06-18): match-rating denominator RE-VERIFIED as a
non-issue (no mid-series subs → series-total rounds == per-player participation); sponsor-goal
payout consolidated into one shared `paySponsorGoalBonus` helper; AI roster churn surfaced
(marquee FA signings → news feed; transfers/bids were already surfaced). (**Staff system depth**
SHIPPED
2026-06-18: (1) `staff.specialization` now grants a bounded +10% "true specialist" multiplier on
each role's primary effect — coach→training, analyst→tactical, psychologist→recovery,
scout→scouting (`engine/staff-specialization`), with a Specialist badge on `/staff`; (2) the
genuinely-dead scout stats are now wired — `accuracy`→scouting report tier
(`scouting-mission-processor`, was a flat EXPERT) and `scoutingSpeed`→mission duration
(`scouting-slice`). Tested.)

### P3 — Depth roadmap (one feature per branch, smallest-first)
1. ~~**Board war-chest**~~ — SHIPPED: confidence gates the single-fee sanction (100%/80%/60%/40% of budget by confidence tier; on-notice = 40%). Enforced in transferPlayer, surfaced in NegotiationModal + dashboard board panel. Tested.
2. ~~**Mid-season board check-ins**~~ — SHIPPED: quarterly pulses (weeks 13/26/39) nudge confidence from recent form (+4/+1/-3/-6 by win rate, min 3 matches, never sacks — the sack stays season-end/telegraphed). Surfaced in news feed AND the week-reveal overlay. Tested.
3. ~~**Rivalries**~~ — SHIPPED (effects wired): tracked intensity now drives gameplay. A
   HEATED/FIERCE derby applies a deterministic stakes multiplier (×1.3 / ×1.6) to the
   post-match **morale** swing (`atomic-week-processor`, read pre-`updateRivalries`) and the
   **fanbase** swing (`processors/fanbase-growth`, still under the 2M cap → non-farmable), plus
   a pre-match **DerbyBanner** on the live page (HEATED/FIERCE only, with H2H record). Helpers
   `getRivalryBetween`/`isDerby`/`derbyMultiplier` in `history-tracker`. Tested
   (`rivalry-effects.test.ts` + derby cases in `fanbase-growth.test.ts`). *Confidence* swing
   deliberately deferred — the board-confidence system is quarterly/season-end by design
   (decisions log), so per-match nudges would fight it.
4. **Transfer negotiation depth** — counter-offers, agent personalities, holdouts.

### P4 — Steam release (manual, external)
`tasks/REMAINING_MANUAL_TASKS.md` — Steamworks achievement registration + icon generation, store assets. Code-side is done; `npm run release:verify` is the gate.

## Decisions log

- 2026-06: Sacking requires on-notice + bottomed confidence (always telegraphed one season ahead). New boards start at 60/100.
- 2026-06: Board rewards are upside-only and capped (≤$500k exceeded / ≤$250k met) to keep the economy non-farmable.
- 2026-06: 8-slot "swiss" events relabeled `bracket` rather than shipping an unvalidated Swiss path — honest data over silent misbehavior.
- 2026-06: Toast sounds only on meaningful types; `xp_gain`/`info` stay silent by design.

## Map Studio researched library - 12 September 2026

Added the CS2Nades snapshot for all eight supported maps: 628 mapped lineups, 16 incomplete records linked for manual placement, and outer silhouette wall outlines on ten floors. One-time merging preserves the current 21-mark Mirage draft and adds a downloadable pre-import backup. Compact targets, source links, collection/type/team filters and full-path toggle keep the imported library usable. See docs/MAP-STUDIO-LIBRARY.md and the per-map import report. No live match physics changed.

## L31 artwork/gallery follow-up � 2026-09-16
161 portraits migrated with legacy aliases; retired artwork excluded and checked in rebuilt QA archive. Approved EM icons applied. Eight gameplay captures and preview/ZIP completed locally. Packaged QA boot passed. Steam install still legacy; content reconciliation and upload/install acceptance remain open. See docs/launch-readiness/evidence/L31-REPORT.md. Next: resolve included-content records, fix shared club emblems/profile energy, then package/upload the real release and test it through Steam.

## L31 stock identity and energy consistency � 2026-09-16
Complete in source/production build: unique stock emblem assignments across all 198 catalog teams; squad/profile use actual training energy. Tests 14/14, type-check, production build and worker verification pass. Packaged content reconciled to exact archive bytes; permission review remains partial (see L31-CONTENT-DECISIONS.md). Next release blocker: imported Valve map permission or independently created replacement maps, remaining artwork records, then release build/upload/Steam install acceptance. No new Steam upload.

## L31 verified artwork records � 2026-09-16
Eight exact icon/font/license records resolved with byte-level reproduction and upstream matches. Added packaged Barlow OFL notice. Remaining asset CSV and L31-VERIFIED-ICONS.json identify scope; no blanket approvals. Content gate remains blocked. Local QA repackaging underway for current energy/emblem build; release upload and Steam acceptance still dependent on unresolved artwork/map permissions or replacements.
- Current QA repackaging completed successfully and actual executable booted to main menu. Archive build 7Tz1KBMCjc_dO3PhMwePO includes emblem/energy fixes and verified font notices. No Steam upload; see L31-REPORT.md for exact remaining records and limits.

## Current owner direction � 2026-09-16
Map-use permission is owner-confirmed and recorded for 54 exact assets. Preserve original photos/logos. Clarification pending on "now included" versus "not included" in Steam; current exclusions remain until answered. All 2,878 legacy portrait files and 220 original-logo references verified present locally.

## Confirmed Steam asset selection � 2026-09-16
Owner clarified original photographs/logos must remain local and NOT ship. Removed ambiguity: keep source backups; exclude legacy player folders, logo.original references and regular legacy raster logos. Fictional portrait selection and SVG club designs remain. Map authorization remains owner-confirmed. No permission question pending.
- Original-asset exclusion verified in rebuilt QA archive: zero retired paths, 161 retained portraits, 220 fewer legacy raster-logo files. All original source files preserved. Seven tests, production build and worker verification pass. Steam upload has not occurred.
