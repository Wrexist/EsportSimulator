# Anubis interior boundaries and moving-radar review

22 September 2026. Local development only; no Steam upload or career-result migration.

## Fixed

- The previous outline importer used `RETR_EXTERNAL`, deliberately dropping interior holes. The Anubis supplement traces all 18 substantial interior voids into 19 editable wall-guide polylines. One void splits around protected navigation. Tiny raster specks are ignored.
- Native navigation at every elevation is protected. Boundaries are inset two source pixels; an independent segment/polygon test finds no crossings of any of the 2,633 native walkable polygons. They remain draft 2D guides, with no invented wall heights or penetration rules.
- Existing Anubis drafts receive only the new guides, with an independent import receipt and a pre-update local backup. User edits and deletions survive subsequent opens. The update does not resurrect deleted utility guides. Original Mirage drawings are untouched.
- All new competitive vetoes, fallback series and FPL map choices use one seven-map pool. Nuke is retired; Sandstone remains the open alternative. Archived Nuke matches, assets and Map Studio projects remain readable.
- The estimated career radar now follows deterministic A* routes around blocked cells instead of relying solely on straight-line steering and wall sliding. Route shortcuts use the same supercover sweep as player movement; disconnected targets fail without teleportation. Exact-input caching is bounded to 1,024 routes and returns independent arrays.
- Players hold their spawn positions during the radar's existing three-second freeze phase. Estimated shot links crossing radar voids or floors are suppressed; recorded match outcomes are not changed.
- `/dev/radar-preview` now has Play/Pause, Restart, 1x/2x speed and fractional scrubbing for inspecting motion through the actual game radar component. This page uses a labelled mock round, not a career or an authoritative physical replay.

## Installed data inspected

The installed `de_anubis.vpk` still matches the extraction: SHA-256 `bca91cee11592c65c2869c599769232f29335458376ed90431a013b58c938e07`.

The improved local physics reader exports collision categories and optional complete mesh geometry. Anubis contains 15,055 hulls and 9 meshes. Between 87% and 100% of each traced hole's original edge lies within eight source pixels of a projected default-solid vertical mesh face. This supports the outlines but does not certify solid volumes, heights, or bullet penetration. Native vertices/triangles remain under `tmp`, not in the shipping asset tree.

Collision categories found: player/npc clip, default solid, player-excluded geometry, grenade-excluded geometry, nav clip, pass-bullets, grenade clip, window and sky. The reader follows the category access pattern in [VRF's collision renderer](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/Renderer/Renderer/Rubikon.cs). Do not merge these into a single universal wall mask.

Entity inventory across the seven non-Mirage extractions is saved in `docs/previews/native-maps-2026-09-22/gameplay-entity-inventory.json`. Examples: Anubis has four water volumes; Inferno has one rotating door and five navigation blockers; Overpass has one rotating door and four blockers; Vertigo has six bomb-reset triggers. Counts include inactive entities where present and do not imply those behaviors have been implemented.

## Remaining work, in order

1. Native collision queries that distinguish player movement, vision, bullet penetration and grenade impacts, including native material/surface data. Handle doors and breakables as stateful geometry.
2. Ground native spawn origins, preserve connected floors at bridges/stairs and bind plant triggers to actual standing surfaces. Do not flatten Anubis's canal/bridge elevations into universal 2D walls.
3. Connect sealed physical 5v5 frames and event positions to match radar playback/resume. Keep career reward/result ownership gated until real-map lifecycle and reward parity pass.
4. Measure and calibrate movement speeds, body separation, sight/reaction, routes, utility and engagement outcomes over multiple seeds and both sides. Local demos and resolved weapon data can support comparisons, not replace validation.
5. Full browser/career recovery and packaged Windows/Steam acceptance.

The career radar still estimates positions from legacy round events. These fixes improve its presentation; they do not make those inferred positions physical ground truth. The existing 3D engine remains available in Spatial Lab/rehearsal. No additional manual wall drawing is required to inspect this Anubis repair.

## Reproduce

```powershell
dotnet build scripts/map-physics-importer -c Release
dotnet scripts/map-physics-importer/bin/Release/net10.0/MapPhysicsImporter.dll tmp/native-maps/Anubis/maps/de_anubis/world_physics.vmdl_c tmp/native-maps/Anubis/world-detailed.json --geometry
python scripts/launch/import-anubis-interiors.py
npx tsx scripts/launch/import-native-maps.ts
npx jest --runInBand
npm run build
```

The Python tracing command uses the existing isolated OpenCV/numpy installation in `tmp/l09-python`. Raw native extraction must exist first; see `NATIVE-MAP-REFERENCES.md`.

## Verification

- 84 focused tests passed: outlines, preservation, native drafts, retired-map selection and saved-map compatibility, route validity, freeze, shot-link plausibility and cross-map position continuity.
- Full Jest suite: **185 suites / 1,746 tests passed**, `tmp/anubis-radar-full-tests.log`.
- Production build, lint/type checks and bundled week-worker startup passed, `tmp/anubis-radar-build.log`. Existing project warnings remain.
- Browser: automatic Anubis outline merge, native draft backup/import, My work filtering, Play/Pause, Restart, 2x selector and fractional scrubbing verified in Chrome. Production Map Studio runs on port 3370; the isolated dev radar preview runs on 3371 with its build under `tmp/anubis-radar-dev-build`. The production dev-route gate correctly remains closed.
- New screenshots: `docs/previews/native-maps-2026-09-22/05-anubis-interior-boundaries.png` and `06-anubis-moving-radar.png`. The second is a mock round at 30.4 seconds, not physical 5v5 acceptance.
- Illustrative Node timing on Anubis at 35-38 seconds: first sample 34 ms, subsequent exact-prefix-cache samples 7-9 ms. Not a controlled performance benchmark.
