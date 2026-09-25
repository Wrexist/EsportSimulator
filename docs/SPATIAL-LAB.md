# Simulation lab: height, routes and visibility

13 September 2026. Open **Map Studio → Simulation lab** (`/map-editor/lab`).

The lab is the first implementation milestone from the [tactical simulation roadmap](TACTICAL-SIMULATION-ROADMAP.md). It tests spatial rules independently of career saves. It does not yet produce live match outcomes.

## What works

- **Controlled encounter (L11):** use the header's Encounter lab shortcut. Load one of five Mirage examples (the previous lab test is downloaded as a backup), then Run encounter. Inspect individual player knowledge or world truth, focus the camera on the starting positions, play at quarter/half/full speed, step and scrub events. Perception, reaction, shot rays, ammo, armor and health determine the duel. Save test retains setup; Export replay includes diagnostic inputs and results. [Rules, original provisional weapon tuning and remaining acceptance](launch-readiness/evidence/L11-REPORT.md). This is separate from live career match outcomes.

- Eight supported maps have imported world-space navigation polygons, directed connections, ladder references and static visibility triangles. Coordinates retain height; two overlapping floors are distinct surfaces.
- The radar stays 2D. Pick A and B, choose their surfaces by height, and inspect a connected route. Nuke and Vertigo also have lower radar backgrounds. Elevation filters are independent of the background.
- Routes respect blocked surfaces, directed links, stance and ladder availability. Unsupported gaps and ambiguous portals are excluded. Red visibility markers show the first static triangle hit, including floors and ceilings.
- Fixed 64 Hz movement accelerates, brakes and sweeps a sampled player body against geometry. Obstructions stop the player. Short navigation segments consume the remaining timestep instead of adding pauses at every tile. Ladders have a separate speed cap.
- Playback supports pause, restart and scrubbing. Zoom, pan and Fit map support close inspection. Geometry queries run in a background worker; surface rendering is memoized during playback.
- Map Studio and all its nested lab pages stop menu music, including music queued before the first click. Entering the studio clears the previous music scene without changing the game's saved volume preferences.
- Save/Open test and per-map autosave retain endpoints, stance, pace, ladder setting, blocked surfaces and authored walk/ladder/jump/drop connections, stationary teammate reservations and registered Studio geometry. Undo restores previous edits. Older lab drafts receive default settings; incompatible/corrupt drafts are preserved for recovery. Map Studio annotation drafts use separate storage and remain untouched.

## Registered Mirage review (L09/L10)

Open **Map Studio → Saved drafts → Continue latest Mirage** for the preserved 169-mark v12 drawing, or **Open latest + 10 routes** for its separate 179-mark review copy. Ten generated navigation routes have portable height-aware lab tests, including both directions of site rotations. Download links are in Saved drafts. The earlier 142-mark registered review remains available separately. Opening a built-in draft uses backup/import and Undo. [V12 audit and findings](launch-readiness/evidence/MIRAGE-V12-REPORT.md).

Select **Validate map geometry** in the inspector. Overlay the reference radar to compare landmarks, inspect each issue, and choose a floor and height range for a marking. Red walls affect the lab only after registration and height binding. Their range must describe the actual obstacle; an unbound outline stays a drawing. Green passages do not erase the static collision reference. Editing vertices resets that marking to Draft; editing project content invalidates the saved check. Undo restores the previous content and check.

The earlier 142-mark derived copy reported **18 errors / 25 review notes**: 15 unbound walls and missing selected-floor coverage in CT spawn and both plant polygons. It finds clear representative points for CT/T and A/B, and completes all four spawn-to-site movements. This does not certify every point inside those polygons or prove that the polygon is an exact plant trigger. Refine the unsupported edges and check underpass/window/ladder heights before treating the areas as accepted.

In **Simulation lab**, select **Load Studio geometry**, then **Check spawn/site zones**. Start/Go buttons use the validator's safe representative point at its chosen height. The lab saves an independent copy of the geometry with its endpoints, links and settings. Add explicit one-way jump/drop links and enable the corresponding experimental arc toggle to test them. **Reserve A for teammate** adds a stationary body obstruction; it is not a moving crowd simulation. Failed movement stops with a reason, without teleporting to another surface.

All eight maps / ten radar floors have measured registration and a release-held coverage row in `public/map-studio/registration.json`. Download coverage from Saved drafts. These rows record alignment evidence and missing review; they do not approve a map or replace the L08 content gate.

## What to annotate next

Stay on Mirage for the first acceptance pass:

1. Keep the existing **A site** and **B site** labels. Trace plantable ground, not the whole tactical site. Keep spawn polygons limited to the starting area; optional individual spawn points can be added later.
2. Use callout pins and notes at both ends of underpass and other height changes. Describe stairs, ladders, jumps and one-way drops. Use route arrows when direction matters. These notes are review input; they do not automatically create a physical link.
3. Mark suspect walls, passages and low cover. Specify whether a player can walk, crouch, jump or shoot across them. Do not assume every red wall blocks every bullet or grenade trajectory: material and height still need verification.
4. In the lab, place A and B around a questionable connection, select the correct heights, and save the test. A missing route can be a conservative rejection, not proof that the real game blocks it.
5. Leave uncertain markings as Draft. Once Mirage's main rotations, height transitions and blocked sight lines are checked, repeat on another map. No need to redraw every navigation surface or manually re-enter the existing utility library.

## User draft preservation

The earlier 142-mark attachment is preserved byte-for-byte at `public/map-studio/drafts/mirage-user-areas-2026-09-13.json`:

- 142 marks: 15 walls, 79 smokes, 20 flashes, 24 fire grenades, 1 CT spawn, 1 T spawn and 2 bombsites.
- SHA-256: `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65`.
- Both sites currently retain the generic label “Bombsite area.” Their geometry has not been changed or certified.
- **Saved drafts → Continue latest Mirage** uses the existing import/backup flow. The original 12 September upload remains downloadable.

## Reference and reproducibility

Pinned source: [Awpy data release 2000908](https://github.com/pnxenopoulos/awpy-data/releases/tag/2000908). Radar images, transforms, navigation and static meshes come from the same release. `scripts/import-spatial-reference.py` verifies archive hashes from its manifest and imports all eight maps. The browser also verifies the collision file hash before creating its spatial index.

The small .NET importer uses the pinned [ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat) NuGet package to read navigation version 36. Import provenance and per-map counts are in [the import report](audit-2026-09-13/spatial-import.json).

## Limits and next work

The collision source is a decimated static visibility mesh, not full game physics. Body sweeps sample several rays; they are not a complete capsule solver. Route smoothing removes safe detours within a navigation polygon without bypassing directed portals. Planning can still reject a valid narrow or alternative passage. Physical floor rays supplement inset navigation borders; sampled support is not a full solid-volume proof. Ladder references are imported, but each real connection still needs acceptance testing. Movement speeds and dimensions are provisional simulator settings.

Jump/drop movement and controlled perception, reaction, aim, damage and utility effects now execute in the lab at original provisional tuning. L12 adds smoke, facing-aware flash, covered HE, supported fire and uncertain decoy cues, with world-space trajectory and target diagnostics. [Utility guide and limits](launch-readiness/evidence/L12-REPORT.md). Measured calibration, moving-team coordination, boosts, reviewed dynamic entities/materials and authoritative live-career integration remain unfinished. Imported lineups remain draft reference instructions; they do not establish verified launch parameters. Registered, height-bound walls can be previewed against the static mesh; unbound drawings never silently become collision.

Team knowledge and versioned round replay are now available in the independent lab. Full spatial career-match integration, 5v5 acceptance and manual Mirage/utility calibration remain unfinished.

## Verification

The newer L09/L10 execution evidence and limitations are recorded in [L09-REPORT](launch-readiness/evidence/L09-REPORT.md) and [L10-REPORT](launch-readiness/evidence/L10-REPORT.md). New production browser checks also verified review-copy import, check persistence, lab geometry reload and CT-to-A arrival. The earlier browser acceptance below remains historical.

### Initial lab milestone

Full suite: **1,283 tests / 127 suites passed**, including 68 targeted spatial, annotation and utility-library tests. Coverage includes floor separation, slopes, one-way links, ladders, wall/ceiling sight checks, body clearance, collision stopping, deterministic playback, tile-boundary timing, saved-setting migration and all eight reference checksums. TypeScript and focused lint pass. Production build and worker verification pass, with existing repository lint warnings.

Production browser checks verified a seven-surface Mirage route (560 units, heights -271 to -178), movement playback, crouching (6.6 seconds versus 2.7 running), persistence across reload, Nuke's lower radar and imported surfaces, zoom/pan without moving endpoints, and the latest 142-mark draft through the normal backup/import flow. Browser QA uses `localhost` storage separately from the user's `127.0.0.1` draft. The native file chooser remains manually unverified because of the previously encountered extension file-access restriction; built-in saved-draft import and parser tests are verified.

The subsequent quiet-studio fix passed all seven audio tests, including studio route ownership and cancellation of music queued before audio context creation. The full-suite count above predates the five added audio cases.


## L14 round replay

Run a team scenario to create a versioned replay. The round scoreboard and 2D observer radar use its recorded physical output, including collision-resolved shot endpoints. Save replay position stores the current tick on this device; run the identical test and choose Resume replay position to return to it. Changing the seed, setup, map/reference or output invalidates that saved position. Export round replay downloads the complete diagnostic record. Skip to round result changes playback position without rerunning gameplay.

The reward column is a round delta using existing rules, zero starting cash and zero loss streak. It is not a purchased loadout or a career payout. Positions/bomb are recorded at 8 Hz; combat events retain their 64 Hz ticks. Career activation and full-match mode parity remain held. [L14 report](launch-readiness/evidence/L14-REPORT.md).
