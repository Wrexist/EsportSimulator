# Mirage v12 — updated drawing audit and route import

13 September 2026. **Review draft; L09/L10 remain partial.** This report supersedes the earlier 142-mark findings for the latest upload, without rewriting their historical evidence.

## Preserved update

The attached v12 file is preserved byte-for-byte as `public/map-studio/drafts/mirage-user-v12-2026-09-13.json`, SHA-256 `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2` (143,496 bytes). An additional copy is outside the repository at `C:\Users\IsacC\EsportSimulator-backups\mirage-v12`. Both older owner uploads and the earlier registered review are retained.

V12 has **169 marks**. Compared with the registered review: **27 additions, no removed marks, and no edited existing marks**. It contains 17 walls, 18 passages, 7 windows, CT/T spawns, A/B sites and 123 utility markings (79 smokes, 20 flashes, 24 fire). Registration remains pinned to 2000908 and provisional. The four zone polygons/ranges are unchanged. There are no authored routes or callout pins. All seven blue marks use the default Window subtype; none is classified as Low cover or Jump / climb. All 25 blue/green openings lack names, notes and height bindings; all 17 red walls lack height bindings.

## What needs attention

| Priority | Finding | Action |
|---|---|---|
| 1 | Blue **148** and green **156** have identical endpoints at approximately (27.164, 20.264)–(28.309, 20.391). | Describe whether these represent different heights/behaviors, or keep the intended type in the working copy. Do not delete automatically. |
| 1 | Blue **151** and green **152** have identical endpoints at (36.616, 51.245)–(36.916, 53.792). | Review Window versus walkable passage versus jump/climb. |
| 1 | Blue **146** spans about 537 world units along the right side of the drawing. | Verify whether this is one long cover edge or several individual openings. The validator flags length, not a proven placement error. |
| 1 | Blue **148/149** and green **153/156/157** overlap red segments in 2D. | Check floor identity and leave intended openings clear when binding walls. Overlap in projection is not proof of a collision on the same floor. |
| 1 | CT spawn and A/B polygons still include samples outside the selected ground range. | Refine CT's 18, A's 22 and B's 25 unsupported samples; do not expand the height range onto crates just to remove warnings. |
| 2 | Wall and opening height/behavior metadata is missing. | Bind reviewed wall bottoms/tops. Name openings and record walking, crouching, jumping, one-way use and shooting behavior. Leave uncertain values Draft. |
| 2 | No explicit reviewed underpass/window/ladder traversal fixtures. | Use height-aware lab tests at each transition, including reverse and blocked cases. A 2D line cannot establish underground connectivity. |
| 3 | No named tactical callouts or observed route timings. | Add useful landmark names and use suitable match-demo samples later for calibration. HE/decoy guides are optional; the existing utility library does not establish simulated grenade physics. |

Numbers are positions in this exact uploaded marking list; they can change if markings are reordered. Issue buttons now show the marking's name or type and ordinal, then close validation to expose its editable details. The machine-readable audit includes stable IDs. No geometry was automatically cut, relabeled or marked accepted.

The updated validator reports **20 errors / 87 review notes**: 17 unbound walls and three floor-coverage errors; the notes include missing opening descriptions/heights, two overlapping blue/green pairs (reported on both markings), five possible red-line conflicts and one unusually long opening. These notes are review tasks, not 87 proven gameplay defects.

## Online route data and what was imported

[Awpy's navigation documentation](https://awpy.readthedocs.io/en/stable/nav.html) describes CS2 navigation areas, their connections, floor lookup and shortest-path queries. [Its map-data documentation](https://awpy.readthedocs.io/en/stable/visibility.html) describes version-pinned radars, navigation and collision files. The project already contains the [2000908 reference](https://github.com/pnxenopoulos/awpy-data/releases/tag/2000908): Mirage has 2,544 navigation surfaces, 2 ladder references and 73,286 static triangles. No newer radar or unrelated third-party route diagram was substituted.

Ten routes were generated from this existing reference: CT→A, CT→B, T→A, T→B; the four return paths; and A→B/B→A. Each direction was solved and executed independently, not invented by reversing the other path. Every generated route completed supported fixed-step movement. Their provisional running times are 9.125, 15.422, 19.156, 25.484 and 23.375 seconds for the respective route pairs. They are connected reference paths, not claims of common professional tactics, measured CS2 timings or tactically optimal rotations.

The separate **179-mark route project** preserves every one of the 169 owner marks and adds ten Draft yellow routes. Every route retains its portal vertices. A companion bundle stores full 3D points, navigation areas, traversal kinds, source/reference/mesh hashes, replay hashes and an independent lab test per route. Height is not inferred from the yellow projection. Editing the drawing does not automatically refresh these generated routes; rerun generation after reviewed geometry changes.

Open **Map Studio → Saved drafts → Open latest + 10 routes**. **Continue latest Mirage** opens the exact 169-mark drawing through the normal backup/undo flow. Downloads include the route project, 3D route bundle and audit. Individual `*.lab.json` files under `public/map-studio/reviews/mirage-v12` can be opened with the lab's existing Open test command.

The routes use the pinned static collision reference. Unbound authored red walls, green passages and blue openings do not modify that collision. Release remains held for manual geometry review and L08 content disposition; availability online does not establish distribution clearance.

## Best next imports and improvements

1. **Observed movement and timing from suitable demos.** [Awpy's dataset documentation](https://awpy.readthedocs.io/en/stable/datasets.html) exposes time-indexed player state plus grenade trajectories, bomb events, shots, smoke/fire lifetimes and flash effects. Select a version-compatible, attributable sample and compare it against the reference before admitting derived data. No demo data was imported in this pass.
2. **Reviewed traversal fixtures:** underpass, connector stairs, ladder/window access, crouch clearances and one-way drops. The imported navigation graph is a starting point; each transition still needs a physical check.
3. **Exact spawn/plant semantics:** investigate version-matched spawn entities and plant-trigger volumes instead of treating hand-drawn tactical areas or successful demo plant points as complete volumes. Current sampled representative points are not a five-player spawn allocator.
4. **L11 encounter integration:** visibility, reaction, aim and collision-tested shots; then L12 grenade physics and L13/L14 team decisions/live-match integration. Keep moving-teammate coordination and measured L10 calibration open.

## Reproduction and implementation

`node node_modules/tsx/dist/cli.mjs scripts/launch/review-mirage-v12.ts` verifies the immutable source/radar/mesh hashes, audits the update, generates each route through the existing navigator and movement runner, and writes only the separate review outputs. Geometry diagnostics are in `engine/spatial/annotations.ts`; editor changes are in `MapAnnotationEditor.tsx` and `MapValidationPanel.tsx`. Optional opening height metadata uses the existing serializer; changing a blue subtype resets its review status to Draft. No career schema or owner draft migration is needed.

Run the portable fixture and synthetic regression cases in `__tests__/mirage-v12-review.test.ts`. Full route execution/replay runs in the production-native probe rather than inside Jest's slower virtualized environment: build `scripts/launch/build-spatial-review-probe.cjs mirage-v12`, then run its isolated profile with `spatial-review-native.cjs`. Existing synthetic movement cases remain in Jest.

Rollback: export the current working drawing and lab tests before switching application versions. The original v12 and older uploads remain separate files. Older clients may discard optional height fields on export. Do not replace the immutable upload with the generated route copy.

## Verification and remaining acceptance

- **90 targeted tests / 5 suites pass**, including 13 new opening/preservation/portable-fixture cases. [Test log](MIRAGE-V12-tests.txt). The full suite was not rerun for this follow-up; earlier 1,362/143 results are historical.
- Fresh TypeScript check passes. [Type log](MIRAGE-V12-types.txt). Production build and compiled week-worker startup pass with existing lint warnings. [Build log](MIRAGE-V12-build.txt). Application build `TOHLRVL-wzKGt4qeOGrk6`, spatial worker `2063.54ca90839e2b8698.js`.
- The actual compiled spatial worker in sandboxed Electron 44.3.0 completes all ten routes, round-trips all ten lab files in an isolated profile, and reproduces identical full frame hashes on a second query for every route. Route geometry and all movement state fields except display heading exactly match the Node generator. [Native result](MIRAGE-V12-native.json), [source and check receipt](MIRAGE-V12-checks.json).
- Full frame equality across Node and Chromium **does not pass** because facing angles differ at floating-point precision. A diagnostic on CT-to-A found 62 heading differences, maximum `2.220446049250313e-16` radians, with identical position, speed, time and state. No physics values were rounded to hide differences. Both full and motion-only hashes are retained; cross-runtime full-frame replay acceptance remains open.
- Browser QA verified the 179-mark import through backup/undo, all ten route entries, updated validation totals, and issue selection closing validation and focusing the long blue mark. A later browser reconnection returned `Debugger unattached`, so a final reload/overview recheck was not completed.

The navigator conservatively excludes 817 ambiguous portals; generated routes can therefore detour. Their arrival checks establish behavior on the pinned reference, not perfect Mirage movement. L09/L10 remain partial for authored wall heights, CT/A/B boundaries, physical vertical transitions, measured calibration and moving-team coordination. L11 perception and collision-tested shots can proceed alongside those reviews. Packaged Windows testing, the real Steam App ID, content clearance and earlier launch prerequisites remain open.
