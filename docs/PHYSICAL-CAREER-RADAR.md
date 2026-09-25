# Physical career radar integration — 2026-09-23

The live match page now offers **Review physical rehearsal** when the loaded career owns a saved, settled physical round for that match. Opening it pauses normal match playback. It uses the existing MapRadarPanel in a separate, labelled dialog; it does not substitute an unrelated physical round for the legacy career result.

## Delivered

- `engine/spatial/career-radar.ts`: verifies sealed replay integrity and explicit actor/player/team binding, checks reference version and mesh checksum, projects recorded world coordinates onto their paired reference radar. Heading follows the world-to-image Y inversion; floors follow actual altitude sections.
- Recorded snapshot positions are held at 8 Hz. They are not straight-line interpolated across unverified corners or floors. Health/death follows 64 Hz damage events; displayed hit segments use recorded muzzle/impact endpoints. Cross-floor hit segments are omitted from a single-floor view.
- `components/match/PhysicalReplayPlayer.tsx`: play/pause, restart, 0.5–4× speed, keyboard-accessible seeking, end stop, CT/T health/KD summaries, verified loading/error states, paired radar images and recorded-position labels. Smoke circles are explicitly labelled model-radius guides.
- `components/match/CareerPhysicalReplay.tsx` and the live match page connect the viewer to the currently loaded career. Wrong save/session/match bindings are rejected. Current career nicknames use explicit player IDs.
- The saved journal retains the round binding and settlement receipt across map changes. Older journals can recover identities from an existing exact receipt; identities are never guessed from a later side assignment.
- Seek/pause/close updates a replay-specific checkpoint in the canonical save state. **Save replay position** persists it explicitly, including while playback is running. Stale bookmarks start at zero; stale career/session/replay updates cannot mutate another replay. No per-frame IndexedDB writes.
- The existing lab verification script exports a temporary sealed Mirage fixture. `/dev/physical-replay` displays it with test actors, without modifying a career. The route remains disabled in production and the temporary recording is absent from the production route trace.

## Evidence

- `tmp/physical-radar-full-tests.log`: **185 suites, 1,749 tests passed**. New regressions cover identity mapping, exact hit endpoints, event-time death, seek consistency, reference mismatch, cross-floor hits, save/session ownership, checkpoint round-trip, older journals and retained receipts after map changes.
- `tmp/physical-radar-types.log`: type check passed.
- `tmp/physical-radar-lint.log`: targeted lint passed without warnings/errors.
- `tmp/physical-radar-build.log`: production build and bundled worker startup passed. Existing unrelated lint warnings remain.
- Chrome: verified reference loading, 4× play through the 45-second ending, disabled play at the end, backward seek to 15 seconds, restored health/KD, map and roster rendering. A development chunk initially timed out; a fresh reload after compilation recovered. Full career dialog/save/reload click-through was **not** exercised against an owner career; store/save recovery is covered by tests.
- [Actual replay screenshot](previews/physical-radar-2026-09-23/mirage-recorded-replay.png). Local preview: `http://localhost:3371/dev/physical-replay` while the isolated dev server is running.

## Still unfinished

The normal career engine remains `legacy-v2` and its ordinary radar is still estimated. This integration displays an existing physical rehearsal; it does not generate physical rounds automatically or award career money/XP.

The reviewed Mirage fixture is the existing provisional test scenario, not a certification of the latest user drawing. It again records 300 shots, one elimination and no plant in 45 seconds. Real-map tactics, collision-mask/height calibration, shooting accuracy and utility tuning need further work before production result/reward activation. Objective positions/progress remain sampled with the recorded frames; smoke artwork does not represent exact 3D occupancy. Full match-dialog UI recovery and Windows/Steam testing also remain open.

Next: diagnose the Mirage attackers' route/spacing and firing outcomes, then repeat multi-seed physical-round acceptance before enabling authoritative career outcomes. No new drawing is required from the user for this step.
