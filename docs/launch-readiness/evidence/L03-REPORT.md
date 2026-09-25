# L03 — Save, migration and recovery trust

Status: **partial; source and isolated native recovery improved, release acceptance open**.

## Changes

- Browser storage errors now propagate instead of silently acknowledging volatile memory. IndexedDB is selected once when supported; transaction failures do not switch the career to a different backend. An open failure can be retried. Writes/deletes/clear resolve on transaction completion, and aborts reject even after request success. Reads no longer perform a quota-consuming probe write.
- Electron storage rejects failed disk acknowledgements instead of writing a separate browser fallback. Read/list failures are distinguishable from a missing save. Save staging uses explicitly allowed literal `.tmp` keys. Main-process storage operations avoid electron-store's dot-property interpretation, preserving the primary while a candidate is staged.

The exact existing `esports-sim-storage` bootstrap key is also admitted explicitly. It uses hyphens and did not match the prior career-key prefix rule. Its persistence is verified through real IPC and fresh-process reload; unrelated private keys stay inaccessible.
- SaveManager queues concurrent saves and captures the requested snapshot before waiting. It validates the current envelope before writing, protects a future-version primary, retains validated last-good backups, and never promotes unvalidated missing-primary backup or Cloud bytes. Interrupted staging stays out of the slot list. Rollback validates backups before restoring and does not clear its transaction when nothing was recovered.
- The canonical snapshot now includes custom loadouts, scouting watchlists and the existing live-match checkpoint, including used tactical timeouts. Schema 7 gains backward-compatible optional fields; versions 0–7 receive fresh defaults. Career loading clears absent optional values instead of inheriting a previous career's game-over, pending reward, watchlist or match state. RNG zero remains zero.
- Default loadouts moved into `engine/default-tactics.ts` so each new/older career gets an independent object. Both new-career creation paths check their first save result. Coalesced preference writes wait for the actual write and propagate failure through flush.
- `L03-save-fields.json` inventories 62 durable top-level fields and classifies other store state. Nested entity data is carried by its parent. Device settings, derived equipment catalog, bootstrap tutorial flags, transient reveal state, manager career profile, Map Studio and spatial lab storage are explicitly separate. This does not assert semantic acceptance of every nested field.

## Real environment evidence

`scripts/launch/save-recovery-native.cjs` creates hidden sandboxed Electron 44 windows on an isolated localhost origin and profile. Its bundled fixture uses the actual SaveManager and three actual adapters: Chromium localStorage, Chromium IndexedDB, and electron-store through the actual production IPC registrations. The native harness substitutes application startup and Steam services; it uses no live Steam account or owner storage.

The fault phase injects a quota exception at the real localStorage API, aborts a real IndexedDB transaction after its request succeeds, and rejects writes at a proxy around a real electron-store instance. It verifies failure acknowledgement, unchanged last-good primary bytes, retry, corrupt-primary backup recovery, stale staging cleanup and ordered duplicate saves. A separate Electron process reopens the same isolated data and verifies week, custom tactic, committed marker, watchlist and live-match checkpoint. These are controlled fault injections, not a physically full disk or killed packaged game.

Automated tests additionally cover malformed backup/migration failure, future-version refusal with an older backup present, snapshot defaults for every supported version, career switching, all native IPC boundaries, coalesced failures, and the existing single-final-week-commit/manual-retry contract.

The initial full run exposed a late-season performance regression (9.54× against an unchanged 8× ceiling). Removed a duplicate snapshot clone and cached only the exact bytes of the latest verified primary to avoid repeatedly migrating unchanged backups. The isolated performance rerun passed at 2.70×; the assertion was not relaxed. The first build caught a displaced `use client` directive after extracting loadouts; it was corrected before final verification. See final receipts for the latest full-suite/build results.

## Migration, preservation and rollback

No schema version bump: all added fields are optional for older schema-7 saves; existing 0–7 migration steps still run before defaults. Old files are only rewritten on a successful save or validated recovery. Unknown future formats are not downgraded automatically. Original imported saves get separate IDs through the existing import path.

No owner career storage was cleared or fault-injected. The existing QA export and all map drafts remain untouched. The canonical Mirage draft SHA-256 remains `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65`; an additional copy is retained outside the repository under `EsportSimulator-backups/launch-L08-L03/`.

Before a binary rollback, export the current save and retain its rolling backups. An older writer can discard these new optional fields even though it accepts schema 7. Do not roll back storage fixes alone while keeping code that relies on literal staging keys and truthful write acknowledgements. Browser and Electron stores remain separate; no automatic cross-backend migration was introduced.

## Still required for acceptance

1. L02 prerequisite fixture and journey acceptance; historical player-authored saves for every supported old format, including nested match/tactic data beyond synthetic fixtures.
2. Full manual/auto/week/export/import/Cloud field comparison on the release candidate and live-match resume through the actual game UI. The source now retains the checkpoint, but no complete played-match continuation was accepted here.
3. Actual packaged Windows disk-full/read-only failures, force-kill before/during/after week commit, native close/retry/cancel, and exactly-once ledger/reward comparison across a fresh process. Current native probes exercise storage and staging, not a killed production match/week UI.
4. Real Steam Cloud and two-PC conflicts. Local commit is independent of Cloud availability; L29 owns account-side acceptance.
5. Build and test a releasable Windows artifact once the real Steam App ID and L08 content disposition are available. No App ID was fabricated and no content gate was bypassed.

None of the three release acceptance criteria is checked off. Next package: **L04 — deterministic simulation and worker ownership**, then L05 lifecycle, alongside closing the listed L03/L08 external acceptance gaps.

## Final verification

- Full regression: **1,331 tests / 137 suites pass**. Final native-key follow-up: **11 tests / 2 suites pass**.
- Fresh TypeScript check: **0 errors**. Production build including lint/types and actual compiled week worker: **pass**; existing lint warnings remain.
- Latest native fault and separate-process phases: **all three adapters pass**, including the bootstrap key.
- Build ID, changed-source hashes and limits: [L03-checks.json](L03-checks.json). [Regression log](L03-regression.txt), [build log](L03-build.txt), [native faults](L03-native-faults.json), [fresh process](L03-native-read.json).
