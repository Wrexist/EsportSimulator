# L29 ? community imports and optional Workshop

Status: **partial; release NO-GO**. Windows 1.0, App ID **4326170**. The owner requested optional Workshop support and a separate real-identity mod intended for release. Workshop is therefore a required verification gate for that scope. No Steam upload, item creation, subscription change or publication was performed or scheduled.

## Delivered locally

- Audited the existing JSON overlay and Workshop implementation; retained its player/team/tournament format. Schema 1, 16 MiB per complete JSON database, at most 10,000 players / 2,000 teams / 2,000 tournaments, bounded text/depth, finite player stats 0?100, roster ownership/reference checks and safe image paths. Archives and executable mod code are unsupported.
- Import preview shows counts and supplied author; matching IDs replace the base and new IDs append. Installation replaces all sections in one atomic `database.json` commit, with `database.previous.json` retained before replacement. Omitted sections cannot leak in from the previous import. Restore and removal use the same representation; removal masks legacy files without deleting original data or images. A failed live rename leaves the old database and backup readable.
- Validation runs at the renderer, actual desktop IPC and runtime loading boundaries. Partial imports resolve against the complete base before desktop installation; incompatible merged data falls back to the bundled snapshot. Invalid files reject the whole overlay. Legacy fixed JSON files remain readable when no atomic database exists. Modern imports do not use legacy per-file writes.
- Added explicit **Use base game**, **Use imported database** and **Restore previous import** actions. Missing selected Workshop content no longer activates an unrelated stale community import. Workshop activation requires this game's schema and structurally valid content. Pending-update/incompatible items cannot be activated from the UI. Removed claims that a published real-data subscription already exists.
- Rebuilt the real-identity builder around a unique source team number, nationality and 20 retained stats, independent of array order. Verified every selected team against original roster links. Unknown/ambiguous mappings abort. Existing output folders are retained; choose a new name for another build.
- Original images are copied unchanged, decoded for metadata, bounded to 8 MiB / 4,096 px / a single frame, and receive extensions matching their bytes. Missing or corrupt originals are excluded rather than replaced with another person's face. Local inventory includes SHA-256 and source paths; source metadata is retained as review material, not licensing proof.
- Publisher now performs local preflight by default. It rejects changed inventory, unlisted files, invalid media/data and wrong App IDs. Any Steam call requires an explicit `--publish`, documented rights and packaged Workshop evidence tied to the inventory, and release timing attestation. Default upload visibility is private. This is a technical review gate, not a legal certification.

## Separate real-identity draft

Local folder: `dist-mod/real-teams-2026/` (git-ignored; outside the base build allowlist).

| Item | Result |
|---|---:|
| Compatible teams / original logos | 198 / 198 |
| Player identities | 1,368 |
| Original usable portraits | 1,323 |
| Missing/corrupt portraits | 45: 41 absent, 4 corrupt |
| Raw team records not represented in the base overlay | 19 |
| Inventoried files | 1,528 |
| Inventoried bytes | 231,307,727 (about 221 MiB) |

All raw players mapped uniquely. The 19 extra team records are listed instead of appending incompatible/duplicate rosters. Four `.webp` sources contained web-page markup and were excluded. The local donk portrait was visually inspected as an original photograph; this is not visual approval of all 1,323 portraits. A check against the stock identity refresh found zero mod player/team names that would be overwritten on hydration.

Package files: `manifest.json`, `database.json`, compatibility `players.json` / `teams.json`, `identity-map.json`, `asset-review.json`, `source-records.json`, `inventory.json`, `release-review.json`, `README.md`, and `assets/`. The README describes desktop installation and release review. Full images require the accompanying assets directory; JSON upload alone cannot copy media. Missing images currently use the game's normal generated fallback and must be reviewed before claiming a complete real-portrait pack.

The package is project-authored optional content, not portrayed as an independently authored community contribution. It reflects retained historical local data, not a verified current roster feed. `release-review.json` remains **blocked**. Nothing is installed into the owner's careers, and nothing has been posted online.

## Evidence

- [Builder output](L29-mod-build.json); [package preflight](L29-mod-preflight.txt): all inventory/image/reference checks pass; release-ready false.
- [Isolated mod/new-career integration](L29-mod-smoke.json): actual import handlers and snapshot loader pass all 198 team / 1,368 player identities, 1,323 mod art paths, stock-name hydration and explicit base fallback. In-memory career only; no owner storage or Steam calls.
- [Full tests](L29-tests-final.txt): **1,638 tests / 170 suites pass**. New cases cover unsafe paths, malformed/versioned payloads, duplicate/unknown roster references, omitted-section replacement, rollback after a failed rename, base fallback, manifest inventory tampering, unlisted code, stale release evidence and reordered/ambiguous identity mapping.
- [Final production build](L29-build-final.txt): build and TypeScript pass; build ID `oLnHAm-kha__OkZyd5b_s`; local preview port 3210, PID 381840. Production worker startup passes (`3816.fa2b0e0097846f89.js`). Existing lint warnings remain; no build errors.
- [Real Electron IPC probe](L29-native-ipc.json): Electron 44.3.0, real sandboxed renderer/preload transport, actual handlers, isolated temporary storage and synthetic Steam services. Replacement/restore and foreign-renderer rejection pass. This is **not packaged Windows or live Steam acceptance**. First attempt inherited `ELECTRON_RUN_AS_NODE=1` and failed before the probe; retry removed the flag for the child process and passed.
- [UI availability](L29-ui-availability.json): no enabled browser or native surface; visual/UI acceptance **NOT_RUN**. No screenshots presented as proof.
- [Preserved data hashes](L29-preserved-data.json): both Mirage drafts and base players/teams unchanged. No owner career was opened, advanced or rewritten.
- [Content gate](L29-content-gate.txt): still blocked on **4,988 unresolved/changed items**. No allowlist expansion or cleanup deletion.

## Remaining required work

1. **Pin mod assets to careers/package versions.** `/mod-assets/` still resolves the selected active folder: changing/removing a package can alter or remove images in existing modded careers. Names/stats in saved careers are preserved, but image retention is not accepted. Keep the matching package active when testing these drafts.
2. Custom tournament JSON remains schema-validated but the runtime season calendar is built from the canonical tournament database, not these snapshot entries. Tournament scheduling overrides are not delivered; document or reject that unsupported content in the next import UX pass. Add validated media-folder installation and full-package rollback UX. Current JSON UI is atomic for database sections, not an asset-folder installer; copying package assets locally is a documented manual step. Add better missing-media and incompatible-baseline previews, and test recovery from hand-corrupted legacy input.
3. Verify actual Steamworks Workshop configuration for 4326170, legal agreement state and preview; exercise subscribe/download/activate/update/unsubscribe/restart/offline through an authorized test item. Offline currently falls back to the base when Steam cannot locate the selected installation; a retained offline package and update pinning still need implementation/testing.
4. Verify the real Windows package excludes `raw-data` and `dist-mod`, including traced files; smoke-test the mod inside that exact package. The source allowlist excludes those directories, but this turn did not produce a packaged release.
5. Resolve the 45 portraits, verify current/historical roster claims and visually review every imported asset. Obtain/record adequate redistribution permission and attribution for logos, photographs and underlying content. Do not treat a separate or community label as clearance.
6. Run visual/keyboard/screen-reader import/preview/rollback tests and new-career/save reload/removal cases. Earlier player testing, identities, full 5v5, balance calibration and Windows/content gates remain open.

## Source guidance and release timing

[Valve's Workshop implementation guide](https://partner.steamgames.com/doc/features/workshop/implementation) describes item creation/update, installed content and Workshop visibility configuration. [Steam Subscriber Agreement, section 6](https://store.steampowered.com/subscriber_agreement/) governs submitted user-generated content and the rights the submitter must have. Reviewed 2026-09-14. Those sources do not establish rights to these local assets or confirm this app's partner configuration.

Local verification: `npm run workshop:upload -- --verify-only`. Rebuilding requires a new `--name` to retain the existing package. Publication remains a future release task, contingent on the above review; no automatic publication is configured.

**Next: L30 ? Steam identity, Cloud, achievements and stats**, alongside the remaining L29 work. Real-client and two-machine Cloud testing need separate evidence; App ID configuration alone is not acceptance.


## L30 follow-up ? 14 September 2026

See [L30 report](L30-REPORT.md) for implemented media-folder preview, retained image bundles, explicit Workshop version pinning and isolated real-data package retest. These supersede the earlier image-retention/folder-install implementation gaps. Real Workshop lifecycle/UI, legacy URL migration, cross-device mod art and content approval remain open. No mod was uploaded.
