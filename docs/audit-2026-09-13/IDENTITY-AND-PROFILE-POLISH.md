# Identity and profile polish ? 13 September 2026

Owner direction: closer original-inspired fictional handles and club names; calmer, more professional presentation. This follows the L01/L02/L34 foundation work and does not close the Windows release gate.

## Implemented

- Refreshed 1,368 stock player handles and 198 club names using the original records already in `raw-data/snapshot`. Examples: donk ? dunk, ZywOo ? Zywou, m0NESY ? m0nesi; Spirit ? Spiryt, FaZe ? Phaze, Vitality ? Vitalis.
- Validated player correspondence by record count, nationality, skills, source rank and the existing age floor. Matched club correspondence by roster IDs. Compared complete before/after records: only display names, nicknames and club short tags changed. IDs, rosters, portraits, stats, contracts and finances stay stable.
- Added a stock-name manifest and a load-time refresh on the cloned career. Unknown/mod IDs and custom labels stay intact. Existing historical text is preserved as recorded. Backups of both pre-change snapshots are in `tmp/identity-refresh-original`.
- Replaced purple profile lighting and the rainbow XP bar with quiet navy surfaces and one progress accent. Removed reflections over portrait frames. Kept glass shell controls.
- Replaced five nested summary cards with a compact metric row, enlarged small labels, shortened the header, simplified contract actions and removed duplicate player handles from the subtitle.
- Skill values display as whole numbers; large transfer values use the existing currency formatter; roles use readable labels. Simulation precision is unchanged.
- Reduced profile entry motion; repaired smaller-width stat grids. Main-menu copy now says fictional players. Training copy uses plain language. Manager-mode introduction accurately says Amateur.
- A real refresh exposed a premature profile 404: settings hydration completes before career loading. The profile now waits for the active load and still returns not-found for an absent player after loading.

## Validation

- Full suite: **1,306 tests, 131 suites passed** before the final profile-loading fix. Final focused checks: **6 tests in 2 suites passed**, covering load-in-progress, loaded profile, genuine missing player, background simulation and stock/custom identity handling. These counts are separate runs.
- Fresh TypeScript check passed. Scoped lint passed with existing warnings. Production build and actual compiled-worker startup check passed after the loading fix; the final currency/role formatting build also passed, recorded in `tmp/profile-polish-final-build.log`. Final build ID: `bb5Jt5y1hFR2xu1LwhTIJ`. Hidden preview process: 382256 on port 3210.
- Browser: existing QA career reloaded with its five starters and HyperDragon on the bench, Week 2/day 1 and $501,400. Stock club Pulsar became WETERMELON; Fryphr9 became LEKSHERi. Confirmed the corrected direct profile refresh, Technical/Mental tabs, rounded ratings, and dunk/Spiryt profile, including the final Entry label and $10.1M value. No saves were cleared.
- The supplied Mirage draft still has SHA-256 `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65`.
- Strict release scans still fail: readiness 1 HIGH/1 MEDIUM; expanded content scan 1 MEDIUM. No Windows artifact was packaged or published.

## Portrait edges - completed after owner approval

The owner explicitly approved local cleanup after the image editor failed to retain transparency. Reviewed the 24 highest-scoring images from the 161-image audit, then cleaned the 11 confirmed candidates. Their shared paths serve 88 stock players, including the former lex5en (now HiCkBNk).

`scripts/clean-portrait-edges.cjs` stages previews and backups, removes bright neutral remnants connected to existing transparency, and softens the new boundary. Enclosed white details remain. For each PNG, every original RGB pixel is byte-identical; only alpha changes. The protected central face region stays byte-identical including opacity. Removed opaque-equivalent area is below 2% per image. This is a specific reviewed batch, not an automatic approval of arbitrary future images.

Applied all 11 PNGs and regenerated their 11 existing WebP siblings using the established quality setting. Existing asset paths are unchanged. No application rebuild or career migration was needed. Verified all 22 served files against staged SHA-256 hashes, and inspected the repaired portrait in the live player profile. The targeted regression test passes, including enclosed white-highlight preservation and unchanged input/RGB checks.

- [Before/after PNG](portrait-edges-before-after.png): each pair is original left, cleaned right.
- Durable originals and hash manifest: `C:/Users/IsacC/EsportSimulator-backups/portrait-edges-jYw20o/` (outside shipped project).
- Staging and per-file report: `tmp/portrait-review/cleanup-jYw20o/manifest.json`.
- To restore an individual asset, use its manifest `backup` path under the durable backup folder and its `file` path under the project; verify the current hash first. The batch applier refuses changed inputs and has no automatic reapply mode.

## Next

1. Portrait-edge cleanup is complete for the reviewed candidates. Continue L06 next.
2. L06?L08: dependency/runtime security, Electron boundaries and content provenance/distribution decisions.
3. L03: complete save migration, recovery and failure acceptance. Extend L02 with the remaining scenario/fault journeys.
4. L34: produce and identify the actual Windows candidate, then run its complete release gate. L01 is verified; L02 and L34 remain partial.
