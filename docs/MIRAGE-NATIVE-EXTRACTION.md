# Local Mirage extraction — 2026-09-22

Read-only source: installed Counter-Strike Global Offensive/game/csgo/maps/de_mirage.vpk.
Tool: ValveResourceFormat / Source 2 Viewer 20.0 CLI, official release ZIP SHA256 d32ab327b8bbb42a2528866afb03bb582bdb779d0005488da32b90292afd3ff5.
Documentation: https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/docs/guides/command-line.md

## Delivered
- Preserved v13 original and all non-bombsite drawings, utility and spawn-area polygons.
- New native-sites draft replaces A/B polygons with projected native convex trigger footprints and adds 33 enabled spawn-origin review pins.
- Installed static hull-zero navigation: all 2,544 areas and ladders match the existing reference exactly.
- Extracted world physics: 1,933 hulls and eight mesh descriptors. Kept collision categories separate; did not flatten player, bullet, grenade or sky clipping into one wall set.
- Saved hashes, native site vertices, spawn origins/priorities and limitations in the native review audit.
- Map Studio Saved drafts has an Open native reference draft action; existing backup-before-open behavior remains.

## Reproduction
Raw extracts remain under tmp/mirage-local; CLI block dump at tmp/mirage-entities.txt. They are not bundled as game assets.
Build scripts/map-physics-importer with dotnet build -c Release. Its two arguments are input compiled model and output inspection JSON. Export the A/B trigger models and world_physics to tmp/mirage-native-a.json, tmp/mirage-native-b.json and tmp/mirage-native-world.json. Export installed nav with scripts/map-nav-importer to tmp/mirage-installed-nav.json. Run npx tsx scripts/launch/import-mirage-native.ts.

## Remaining engine work
This is a native-data-backed editor draft, not a certified CS2 simulation. Exact trigger/player overlap, native spawn priority and grounding, collision-query masks, breakable/dynamic entities and runtime adoption remain unfinished. Native trigger vertical extent is not the same thing as navigable standing-floor range. No guessed wall heights were added. Original unbound walls remain annotations until a properly masked native collision adapter is validated. The earlier ten route tests use the existing pinned reference mesh, not these new sites.

Validation: 48 targeted Jest tests passed; TypeScript passed; production build and worker startup check passed. Local production server on port 3370 serves the 175-mark draft with HTTP 200. Browser click-through was not performed.
