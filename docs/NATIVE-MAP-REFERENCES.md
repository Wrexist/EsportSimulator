# Native map reference drafts ? 2026-09-22

Completed the same read-only native-reference workflow as Mirage for all seven remaining maps supported by the game. Sandstone maps to installed de_dust2. Other installed maps are outside the current game map pool and were not silently added.

| Map | Enabled CT spawns | Enabled T spawns | Convex plant pieces | Matching navigation areas |
|---|---:|---:|---:|---:|
| Ancient | 12 | 12 | 3 | 1970 |
| Anubis | 16 | 16 | 2 | 2633 |
| Inferno | 16 | 16 | 5 | 2738 |
| Nuke | 16 | 16 | 7 | 3040 |
| Overpass | 16 | 20 | 2 | 3936 |
| Sandstone | 15 | 15 | 3 | 2242 |
| Vertigo | 15 | 15 | 2 | 2105 |

Nine portable floor projects are indexed in data/native-map-drafts.json. Nuke A is upstairs and B consists of six separate downstairs pieces. Vertigo CT spawns and A/B are upstairs; T spawn origins are downstairs. Disabled spawn entities remain in the audit but are not added as pins.

Each native trigger hull is projected independently. Anubis, Inferno, Overpass and Vertigo require entity translations; importing their model vertices as world coordinates would misplace the sites. Unsupported rotations, complex triangle-mesh triggers, cross-floor hulls, changed navigation and stale registration hashes fail closed. Existing convex pieces are never merged into a bounding rectangle that fills non-plantable gaps.

## Use
Map Studio ? Saved drafts ? Installed-map references: all other maps ? choose map/floor ? Open native map draft. Download links provide each portable project and its extraction audit. Opening uses the existing backup and Undo flow; no local storage or career saves are rewritten by the extraction scripts. Mirage's owner drawing and its separate native draft remain untouched.

## Reproduce
1. Install the previously verified Source 2 Viewer CLI under tmp/vrf-20 (official source: https://github.com/ValveResourceFormat/ValveResourceFormat).
2. Run `python scripts/launch/extract-native-maps.py`. Optional `--maps` and `--cli` override local paths. This builds the .NET readers and records hashes of each VPK, CLI, nav, physics and entity resource. Raw extracted assets stay under tmp.
3. Run `npx tsx scripts/launch/import-native-maps.ts` to validate reference compatibility and generate drafts/audits.

The existing spatial reference meshes and production simulation were not replaced. Base library walls/utilities are preserved but not certified. New native marks stay Draft, with no guessed standing-floor bindings. Spawn grounding/priority selection, collision masks, breakables, trigger/player overlap and runtime integration remain engine work. Radar alignment remains provisional even when navigation matches exactly.

## Validation
66 targeted tests passed across four suites; TypeScript passed. Tests cover every floor project, baseline preservation, enabled/disabled spawns, per-hull site geometry, floor placement, model offsets, radar round trips and rejection of unsupported transforms. Initial production build passed; final label-polish build is recorded below after completion. Chrome click-through checked the native map selector and Nuke upper/lower plus Anubis drafts. Screenshots are in docs/previews/native-maps-2026-09-22. The existing game radar component was captured using its explicit mock test round. Dense native labels were repaired after visual inspection.

Final verification: production build and bundled-worker startup passed after label polish (existing repository lint warnings remain). All nine native floor drafts served successfully from the rebuilt production server on port 3370.
