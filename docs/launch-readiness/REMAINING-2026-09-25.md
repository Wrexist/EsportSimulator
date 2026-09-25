# Remaining work before Windows 1.0 on Steam

App ID **4326170** is configured. Release decision remains **NO-GO**. Steamworks was checked while signed in on September 25; see `evidence/STEAM-STATUS-2026-09-25.md`. This list does not replace the detailed package register.

## Required work, in order

| Priority | Work | Acceptance needed |
|---|---|---|
| 1 | Finish physical match acceptance | Full series on real reference geometry; additional seeds, both sites, side swaps and interrupted objectives. Investigate blocked survivors, no-plant timeouts and pathological economy/score outcomes. The three gunfire-disabled Vertigo opponent stand-offs remain a known stress-test limitation. |
| 2 | Complete production career integration | Physical results must own radar, score, kills, purchases, economy, progression and final career settlement exactly once, including crash/reload. Current physical matches remain rehearsal-only. Enabling them without acceptance is not a release fix. |
| 3 | Finish career and balance acceptance | Long careers across club tiers, calendar/qualification/season transitions, board/jobs, recruitment/contracts, staff/sponsors/facilities, finances and AI budgets. Verify actual user flows, not only isolated engine tests. |
| 4 | Finish UI, onboarding and performance checks | First-session player testing; remaining routes/dialogs; keyboard/focus, audio, readable 1280x720/1440x900/1920x1080 layouts; full match resume; measured startup, round processing, frame timing and memory. A single Team Lab browser pass is not full-game acceptance. |
| 5 | Verify the packaged content manifest | The source content gate now passes after reconciling 67 map/draft records and 39 portrait/data derivatives. Original real-player photos/logos remain excluded by the packaging rules; verify the final archive too. Owner-directed lineup inclusion remains distinct from upstream permission evidence. |
| 6 | Freeze and package the candidate | Run final full tests, release hardening, strict gates and production build. Create the actual Windows distribution with the root EsportsManager.exe; inspect exact ASAR/assets/dependency notices and record source/build hashes. Older packages do not contain current simulation changes. |
| 7 | Install and test through Steam | Upload the accepted package to a test branch; fresh install, launch, update, uninstall/reinstall, offline play, save/load/crash recovery, overlay, account changes and two-device Cloud conflicts. Verify configured achievements/stats against actual behavior. Record the installed Steam Build ID. |
| 8 | Finish and verify the store | Keep the confirmed Windows 1.0 scope consistent with settings/copy. Verify exact logo/capsules/library assets, gameplay-only gallery, trailer processing, accurate supported features/languages/input/system requirements, content/AI disclosures, support links and price. Promotional panels belong in permitted marketing areas, not substituted for gameplay screenshots. |
| 9 | Obtain current Valve approvals | Verify and resolve current store/build feedback, publish pending configuration changes where needed, then submit the accepted candidate. Local success does not establish Steam approval. |
| 10 | Release operations | Confirm release date/price, review prerequisites, archive the accepted artifact, test rollback/hotfix steps, prepare support and launch notes, then perform the final Steam release action after all gates pass. |

## Current evidence and limitations

- v12: 122 focused tests, type-check, focused lint, production build and worker checks passed in the preceding pass. Seven seeded combat-recovery examples and 150 synthetic mirrored BO3 rounds passed. See `docs/PHYSICAL-APPROACH-V12.md`.
- Current follow-up passes a **43-round real-map BO3**: Vertigo 8-13, Anubis 9-13, away 2-0, zero final blocked survivors. Sandstone was not needed as a decider and is not covered by this series. The 51 recovery/lifecycle tests and seven audit tests pass. See `../PHYSICAL-REAL-SERIES-V12.md`; this is not all-map, overtime, performance or production-career acceptance.
- The original `evidence/2026-09-25-content-recheck.json` is retained as the 67-record baseline. Exact reconciliation is recorded in `evidence/2026-09-25-map-reconciliation.json`; portrait derivatives in `evidence/2026-09-25-portrait-sync.json`. The current source content gate passes; packaged validation remains open.
- Geometry optimization preserves 600 collision queries on each of seven maps against the previous implementation. The 15-case combat campaign settles every round with zero final blocked survivors, but Overpass has two floor-support route failures (one no-plant timeout). These still need repair; no all-map acceptance claim. Sandstone instrumented A/B cases improved from 93.7/73.3 seconds to 51.5/30.8 seconds with identical deterministic round hashes, not a real-time performance guarantee.
- Top-25 portrait synchronization covers 128 players by permanent ID (92 retained portraits, 36 original-face crops). Seventeen focused tests pass, including old-save migration, custom-art preservation and render consistency. Only 108 portrait references changed; no other player fields changed.
- Strict Steam source readiness passes with zero BLOCKER/HIGH findings, one MEDIUM map-name warning and seven INFO findings. Obsolete App ID-file checks and comment/reference-URL classification were corrected; seven audit tests pass. This static check does not clear the remaining content records or establish packaged Steam acceptance.
- Chrome runs the production browser worker. Vertigo combat recovery, playback and saved replay-position resume after reload were checked. This is a Team Lab review, not full career or packaged acceptance.
- Steam default is **25370240**, depot **4326171**, manifest **7171118896994346851**. Store presence is approved; build approval remains outstanding. Older feedback references build 23989573, so it must not be presented as a verified defect in 25370240.
- Store editor has **1/5 required screenshots**, an incomplete/processing trailer, old Early Access copy and unpublished store changes. App configuration separately reports no uncommitted app data. Published base price is **$14.99 USD**. The current Windows 1.0 scope must match the store before resubmission.
- Valve documents separate store/build preparation and the release workflow: https://partner.steamgames.com/doc/store/releasing . Account-specific timing and prerequisites must be checked in the signed-in dashboard.

## What the owner needs to do

1. Participate in the final first-session playtest and approve any explicit scope deferrals. No map redrawing is needed now.
2. Choose the launch date once the accepted candidate and approvals are ready. Login is resolved, the published price is $14.99 USD, and Windows 1.0 and the trophy logo are already confirmed.

The remaining engineering, manifests, packaging, upload preparation and verification can continue locally. No further general artwork-origin question is needed for asset families already confirmed as project-created.
