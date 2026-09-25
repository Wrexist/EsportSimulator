# L31 â€” Windows packaging follow-up (15 September 2026)

Status: partial. No release upload or review submission.

## Delivered

- Direct `deployment/upload_steam.bat` now runs a Node upload entry point. It checks the configured App ID/content root and ship guard before Steam login, passes account input as an argument without a shell, and propagates failures.
- Ship guard checks Windows x64 PE headers and Electron runtime files, rejects marked QA artifacts, and retains the unresolved content gate. It no longer claims that structural checks alone establish release readiness.
- `npm run qa:package` creates `dist-qa/win-unpacked/EsportsManager-QA.exe` from the existing production frontend. Separate QA entry, save directory and marker; Steam initialization is disabled. Normal release beforePack is unchanged.
- Corrected the build guide's launcher name.

## Evidence

- 21 tests across ship-package, content-provenance, Steam integration and Cloud roundtrip passed. Type-check passed.
- Release packaging failed at the content gate, before producing a release launcher.
- First QA attempt exposed an incorrect entry-file mapping; corrected directory/filter mapping passed the builder's archive sanity check.
- Actual packaged x64 executable launched. Embedded Next server started; renderer logged `Boot success` for `/main-menu`. QA process was stopped after collecting logs.
- Startup confirms `EsportsManager-Local-QA` userData and disabled Steam initialization. No owner career or Mirage files changed.
- The shell inherited `ELECTRON_RUN_AS_NODE=1`; removed only in the launching shell for the app test. No permanent environment setting changed.
- Actual QA archive contains zero `logo.original.*` files, 19 map paths and 10 old marketing paths. See L31-QA-PACKAGE.json. This does not establish clearance for other portraits/logos.
- Direct upload command failed before login against absent release output. Ship guard also rejected the completed QA package.

## Still required, in order

1. Reconcile the content inventory with actual distributed files. Its 4,988 holds include implementation/source/development files and must not be described as 4,988 third-party assets. Owner reports fictional players; verify shipped portrait/logo bytes and remove unused bundled marketing content. Imported map/reference sources remain unresolved. Never replace unknown permission records with invented approvals.
2. Build the release artifact once included content is documented or replaced, then validate its exact depot content and installed Steam launch. A local QA boot is not Steam installation acceptance.
3. Save/reload, fresh-career and full UI acceptance in the packaged app. Current test establishes startup only. Deprecation warnings and an SSR storage warning are retained in L31-QA-STDERR.log for triage.
4. Finish gameplay-only gallery and capsule upload; reconcile Windows 1.0 versus existing Early Access configuration and incomplete trailer. No Steamworks changes were saved in this follow-up.
5. Upload and verify a new Build ID, then submit for review when these gates pass. User has already authorized upload and submission; no repeated permission request is needed.

Earlier 5v5/calibration and full-career acceptance remain open. The separately built real-data Workshop mod remains unpublished and outside the base package.

## Artwork cleanup and gameplay gallery — 16 September 2026

- Migrated 161 retained portrait PNGs, byte-for-byte, into neutral branding paths. Legacy portrait URLs resolve through aliases; mod URLs are preserved. Originals and backups remain locally.
- Replaced old application icons with approved EM exports. Excluded retired player folders, original-logo references, old Steamworks artwork and mockups from the package.
- Rebuilt isolated Windows QA package successfully. Archive guard reports zero retired paths and 161 retained portraits. Actual executable logged main-menu Boot success; only its test process was stopped afterward.
- Targeted regression checks: 13 tests in three suites passed. Type-check and production worker verification passed. Production build ID: NrlanxAzdVSo-ZEQXPmex.
- Eight unedited 1920x1080 gameplay captures are in marketing/gameplay-gallery-2026-09-16, with preview HTML, checksums and ZIP. Fresh career on isolated port 3358; owner saves and Mirage drawings preserved. Match was started and paused for the live capture.
- Read-only Steam installation inspection: D:/SteamLibrary/steamapps/appmanifest_4326170.acf shows installed Build 23556629, target 23989573. Installed Counter-Strike Manager folder has legacy launch scripts and no root EsportsManager.exe. No new release was installed, uploaded or submitted.
- Current source-wide content gate reports 5,151 unresolved/changed items, including development/source files and newly migrated assets. This is not a count of proven third-party assets. Reconcile packaged content and source evidence before producing the uploadable release; do not invent rights records.
- Remaining: content reconciliation; distinct amateur emblems; squad/profile energy consistency; training terminology; Steam gallery/capsule upload; release package and genuine Steam installation acceptance; store 1.0/Early Access and trailer review.

## L31 emblem, energy and reconciliation — 16 September 2026

- Corrected Squad's Energy bar: it previously displayed inverse fatigue, an independent simulation value. Squad now forwards training energy; card and owned profile share bounded/rounded playerEnergyPercent, including zero and missing values.
- Added canonical stock emblem assignments with collision avoidance across 198 silhouette/color combinations. Renaming preserves stock assignments; explicit custom artwork and custom colors remain authoritative. Browser DOM verified different shapes for Eternal Flame and Boshido Wildcats after loading the rebuilt production app.
- 14 tests across energy/club consistency, emblem rendering and identity delivery passed. Type-check passed. Production build 7Tz1KBMCjc_dO3PhMwePO completed successfully; worker boot verification passed. The existing packaged QA artifact predates these UI fixes.
- Actual archive reconciliation: 1,501 public/license/NOTICE files, 3,113 source assets absent at those archive paths, zero byte mismatches. Report does not certify compiled embedded data, remote files or runtime dependency licenses. See L31-PACKAGED-CONTENT-RECONCILIATION.json and L31-CONTENT-DECISIONS.md.
- Verified Awpy upstream distinction between MIT scripts and Valve-owned extracted radar/nav/collision assets. Permission for commercial game distribution remains unresolved; no blanket license approvals added.
- Release source gate still blocks (5,153 source-wide unresolved/changed records); dist/win-unpacked remains absent. Therefore no release upload, new Steam Build ID, or installed Steam acceptance test occurred. Previous QA boot is not evidence of these changes in Steam.
- Production browser acceptance: reloaded the isolated saved career and recovered its paused match; completed it using Skip Match and Continue to Results. DimQQ shows Energy 100% on both Squad and profile. Distinct Eternal Flame/Boshido Wildcats SVG path shapes verified in the live scoreboard. These are browser tests, not packaged/Steam tests.

## Verified artwork records and current package — 16 September 2026

Eight exact icon/font/license records were resolved in L08-content-inventory.json; the previous ledger is backed up in tmp/artwork-source-check/L08-before-icon-records.json. L31-VERIFIED-ICONS.json records source URLs, hashes and the scope. EM icons reproduce from retained SVG bytes; Barlow font/license match Google Fonts; Archivo WOFF2 matches Fontsource 5.3.0 and its OFL matches after whitespace normalization. Copied Barlow notice into licenses. No unknown portrait or imported-map records were approved.

Two targeted content/artwork guard tests passed. Rebuilt dist-qa successfully with production build 7Tz1KBMCjc_dO3PhMwePO (includes current stock-emblem and energy fixes). Packaged artwork check: zero retired paths, 161 retained portraits. Reconciliation: 1,502 public/license/NOTICE files, zero changed source bytes, 3,113 source assets absent at those archive paths. The new Barlow notice accounts for the additional file. Relocated portraits are correctly classified as portraits, not marketing branding. L31-REMAINING-ASSET-RECORDS.csv lists 1,497 still-pending packaged records in this scope; these are missing documentation, not a finding that every file is third-party content.

Launched actual QA executable with isolated userData and Steam disabled. Renderer logged Boot success at /main-menu. Confirmed archive BUILD_ID matches the current production build, then stopped only the created QA process. Logs: L31-RECORDS-QA-STARTUP.log and L31-RECORDS-QA-STDERR.log. This verifies local startup only, not Steam installation or full packaged-career acceptance.

Release gate remains blocked by unresolved records (including imported map permission). No release upload, new Steam Build ID, or review submission occurred. Remaining action requires applicable source/creator permissions or documented replacement assets; fictional names and edit histories cannot supply missing permission evidence.

## Owner map confirmation and original-asset preservation — 2026-09-16
Recorded the owner's explicit map-use confirmation for 54 exact map assets (L31-OWNER-MAP-CONFIRMATION.json). Ledger basis is owner-attested, not independent license verification; original source attribution remains unchanged. Map images/geometry/nav are no longer waiting for owner confirmation. External lineup collections and mixed drafts are outside this statement. Verified 2,878 legacy portraits and 220 logo.original reference files remain locally; their paths are absent from the current QA package. Awaiting clarification whether user meant originals should now be included in Steam or should NOT be included. No packaging filters changed and no upload performed.

## Original photos and logos — confirmed exclusion, 16 September 2026
Owner clarified: "Do notninclude them in the steam build." Preserve original real-player photographs and team-logo references locally; do not bundle them. Existing legacy-player-folder and logo.original exclusions remain. Added exclusions for regular logo.png/webp/jpg/jpeg/gif/avif files under legacy team directories, since 220 raster logo paths were still present in the previous QA package. Runtime team-logo fallback rejects those retired paths while preserving fictional SVG marks and explicit mod uploads elsewhere. No original assets were deleted. Seven targeted tests pass. Rebuild/archive validation pending below.
- Exclusion rebuild completed: production build ocNCpziWmBdKJRukRsTrv and worker verification pass; QA packaging succeeds. Actual archive contains zero retired artwork paths and all 161 retained fictional portrait-pool files. Removed 220 additional legacy raster-logo paths compared with previous package. Current scoped archive has 1,282 public/license/NOTICE files, all matching source bytes. Reconfirmed 2,878 legacy portrait files and 220 logo.original references remain locally. Reconciliation and remaining-asset CSV refreshed. No Steam upload performed; QA artifact remains marked local-only.
