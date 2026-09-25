# L05 — Preferences, audio, exit and desktop lifecycle

Status: **partial; source fixes and isolated native lifecycle checks pass, packaged acceptance remains open**. Dependencies L03 and L04 remain partial.

## Changes

- Both settings surfaces now edit the loaded career's difficulty, including Legendary. The compact panel previously changed an unused device preference. The control states its career scope and is disabled without a career. Device volume, autosave, speed and display preferences retain their shared settings store.
- Persisted device data is merged through known fields and bounded values; it cannot replace store actions. Invalid volume, scale and autosave intervals are normalized. Runtime scale applies the same bounded value to store state and document styling. Existing stored autosave values, including false, retain priority over the legacy game-store migration.
- The shared native display action treats borderless as fullscreen consistently with the main settings page. This is the application's existing Electron fullscreen behavior, not a new exclusive-fullscreen implementation.
- Both delete actions explicitly identify all local careers and backups as their scope, and identify device preferences, manager profile and Map Studio drafts as retained. The developer panel previously said it erased only the current game. Delete waits for pending manual writes, rejects during an active operation, and propagates storage failure through the existing retry/cancel dialog instead of navigating away as though deletion succeeded. A partial filesystem deletion cannot be rolled back automatically; its failure message says some careers may remain.
- The desktop close lifecycle waits for an already running manual save even when autosave is disabled. Existing close receipt acknowledgement, retries, cancel, explicit discard choice and lifecycle disposal are retained.
- Audio reads canonical stored volumes before creating and connecting its gain buses on the first gesture. GameShell waits for legacy preference hydration before enabling audio. Studio and all nested lab routes suppress both music and effects. Hidden-document transitions stop active sounds and suspend the context; remembered music resumes when foreground returns. Live-match round cues retain their existing scene ownership; no new match soundtrack is enabled.

## Native evidence

`scripts/launch/lifecycle-native.cjs` creates a hidden sandboxed Electron window with an isolated profile and real electron-store. The harness loads actual production IPC registrations and extracts the exact current main-window close handler from `electron/main.js`. Real window-close events send the production close-intent message; the renderer acknowledges, confirms or cancels through the actual trusted-frame IPC handlers. The renderer runs `createSessionPersistence` with controlled dialog choices and write delays. Startup/Steam services and the visual dialog are substituted; this is not the packaged GameShell UI.

The sequence exhausts three injected save failures, cancels close, verifies the native close-pending flag is cleared, leaves the actual one-minute autosave timer running, observes the fourth attempt write through IPC to disk, then closes again with a 17-second delayed save. At 16 seconds the native window must still exist; it closes only after the fifth attempt is present in electron-store. No physical disk-full condition or OS force-kill is claimed.

The same Chromium fixture creates a real AudioContext and verifies zero master gain on first initialization, no oscillators for muted clicks or Studio/lab activity, background sound suppression, and remembered menu/match scene scheduling. Any scheduled restoration is tested at zero output volume. A separate Electron process reopens the same profile and verifies stored mute and 110% scale before modifying preferences. These are objective Web Audio and persistence checks, not an acoustic device measurement.

Helper/store tests additionally cover tick-in-progress cancel and explicit discard, manual save waiting, repeated close requests, retry and failed flush, disposal/remount with one timer, autosave disabled, and failed delete preservation. Native lifecycle assertions complement those tests rather than substituting for the packaged acceptance below.

The updated production preview was restarted on localhost:3210. A manual browser check of the existing QA tab could not be completed: both attempts to select that tab through the browser automation bridge timed out after 30 seconds. No settings or career data were changed through that failed UI check. Cross-screen visual/interaction acceptance remains unclaimed.

## Migration and preservation

No career schema bump or cross-backend migration. `game-settings` remains the device store. The legacy stored difficulty value is retained for compatibility but no longer controls the compact career setting. Malformed device fields fall back to supported values, while existing career difficulty is loaded from the career. Unknown stored fields cannot overwrite functions. No owner settings were reset and no careers/drafts were deleted for testing. Fault injection uses only isolated QA profiles.

## Remaining acceptance

1. Run the actual packaged React dialog through close during a tick, manual/auto/slow writes, retry, cancel and explicit discard, including remounts and an unresponsive renderer. The source-native harness substitutes the visual dialog and startup services.
2. Verify the release candidate across supported fullscreen/windowed/borderless settings, Windows display scaling, resize, minimize/restore, real focus changes, sleep/resume, audio devices and single-instance launch. Programmatically toggling audio foreground state does not establish OS lifecycle acceptance.
3. Recheck both settings surfaces after a packaged restart, with legacy preferences and older player-authored careers. Test read-only/full disk failures on that artifact.
4. Close L03/L04 prerequisites and provide the real Steam App ID plus L08 content disposition. Current native tooling must not be relabeled as a release package.

L05.4 and all release acceptance boxes remain open; source preparation is reviewable. **Next: L09 — validate and register the preserved Mirage annotations, spawn areas and bombsites before extending movement/combat integration.**

## Final verification

- Full regression: **1347 tests / 141 suites pass**. Fresh TypeScript: **0 errors**. Production build, lint/types and actual compiled worker startup: **pass**; existing lint warnings remain.
- Real Chromium coordinator: **10 comparisons pass** across five transport/reload modes and two weeks, with exactly one final write per week.
- Native close/cancel/autosave/17-second-save sequence and separate-process device preference reload: **pass**.
- Build ID: `hMUQghgW8R_3VLc9MvSG5`. [Source/build receipt](L04-L05-checks.json), [regression log](L04-L05-regression.txt), [production build log](L04-L05-build.txt), [native replay](L04-native-replay.json), [versioned input](L04-replay-input.json), [native lifecycle](L05-native-lifecycle.json), [fresh-process preferences](L05-native-preferences-read.json).
