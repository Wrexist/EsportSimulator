# Map Studio researched library

Snapshot: 12 September 2026. Source: [CS2Nades](https://cs2nades.gg/en/).

The editor adds 628 coordinate-bearing lineup records to the eight supported maps and traces the outer radar silhouette on all ten floors. Sandstone uses the Dust2 source map. This is the complete usable snapshot from this provider for these maps, not a claim to contain every lineup on the internet.

| Map | Mapped lineups | Records needing placement |
| --- | ---: | ---: |
| Sandstone / Dust2 | 108 | 5 |
| Mirage | 116 | 2 |
| Inferno | 87 | 1 |
| Anubis | 63 | 2 |
| Ancient | 76 | 3 |
| Overpass | 61 | 2 |
| Nuke | 60 | 1 |
| Vertigo | 57 | 0 |
| Total | 628 | 16 |

The source snapshot contains smoke, flash and Molotov/incendiary lineups. It does not provide HE or decoy records for these maps; those drawing tools remain available. All current Nuke and Vertigo source records are assigned to the upper radar. Lower floors receive outlines and support manual drawing, without invented lineups.

## Use the library

1. Open Map Studio and choose **Utility**. The library is already merged into each map/floor's draft.
2. Imported lineups appear as compact landing dots. Select a dot or search a destination in **Find a marking** to reveal its throw path. Multiple lineups can share one destination; the list exposes every variant.
3. **Open source lineup** opens the corresponding technique and video page. Notes retain the source technique; aim instructions retain the source's position command where supplied.
4. Filter by collection, marking type or team. Outer boundaries stay visible through these filters; the Walls layer can hide them deliberately.
5. **Show all imported paths** reveals the full library and controls PNG export. The selected imported path is also expanded in the PNG. Your manually drawn paths remain expanded. JSON always retains all coordinates and metadata.
6. Expand **need placement** for records with missing target coordinates or placeholder origins. Their source links remain available, but no coordinates were invented.

## Preserve unfinished work

The first merge backs up a nonempty existing draft under its own storage key before adding anything. **Saved drafts > Download pre-import backup** retrieves that version. Existing marks, IDs, coordinates and notes remain unchanged. A library version stamp prevents deleted imports from reappearing on reload. Existing imported IDs are preserved if a project is imported again. Capacity or storage errors preserve the original draft.

The user's current 21-mark Mirage draft was downloaded before upgrading and stored in [the audit folder](audit-2026-09-12/map-library/user-before-import.json). It contains the original 14 walls and seven later smoke markings. The older original upload remains separately preserved. Continuing the old saved snapshot intentionally opens those 14 original markings plus the new library, after backing up the current project.

## Coordinates and boundaries

Source origins and target points use percentages of different radar images. The importer registers each source radar against the exact local asset using matched image features and a similarity transform; copying the percentages directly would misplace throws. The [import report](audit-2026-09-12/map-library/import-report.json) records source URLs, transforms, inlier counts, median registration error, local image hashes and per-floor counts. Nuke lower uses the upper transform after checking the shared frame; it contains no source lineups.

Targets are source-authored destination spots, sometimes shared by several throws. The straight line connects throw and target; it is not a solved airborne trajectory. Guide circles are illustrative, not physical smoke volumes or flash visibility. All imports start as **Draft - needs checking**.

Red outlines follow the visible map silhouette, including separate islands where present. They are locked to prevent accidental movement and can be unlocked for refinement. They do not establish internal walls, wall height, penetration, ledges or grenade collision. Those details still need authoring and in-game validation. Nothing in Map Studio changes live match simulation yet.

## Reproduce and maintain

Run `scripts/import-map-studio-library.py` with Python, NumPy and opencv-python-headless. Dependencies may be installed into an isolated temporary directory; no game dependency was added. Public source pages and source radar images are cached under the OS temporary directory `esim-lineup-import`. Review or remove those cached source files before deliberately fetching a newer snapshot, and change the bundle version when shipping an updated library.

The importer reads public page data without executing remote code. It stores factual names, coordinates, technique metadata and source links. Source videos and source radar images are not redistributed. The generated JSON is offline at runtime; external guides open only when clicked. Recheck alignment and coverage after source or local radar updates.

Research also checked [CSNADES](https://csnades.gg/), [CSDB](https://csdb.gg/nades/) and [GetReplay](https://getreplay.gg/en/utility/mirage). CS2Nades exposed both origin and target coordinates across all eight maps. Incomplete location descriptions from other catalogues were not converted into guessed positions.

## Verification

49 targeted tests pass across the annotation, library, radar-control and logo suites. Tests cover all ten portable floor projects, complete snapshot counts, exact preservation of the 21-mark browser draft, idempotent merging, retained edits/deletions, capacity failure, source URL rejection and compact/selected/full-path exports. Focused lint is clean. The production build and worker startup check pass; unrelated existing lint warnings remain.

Browser checks confirmed all eight map counts, Nuke lower-floor behavior, destination search, source links and technique metadata, personal-work filtering, and the downloadable pre-import backup. The downloaded upgraded Mirage JSON was compared with the original: all 21 marks match exactly, with 116 lineups and one boundary added. The backup downloaded through Saved drafts equals the pre-upgrade browser download. All ten silhouette outlines were visually reviewed against the local radars.

Final production recheck: Utility opens in Select mode, changing categories keeps Select active, and the 138-mark Mirage draft persists after reload. PNG export completed and was visually inspected: [current Mirage PNG](audit-2026-09-12/map-library/mirage-library.png). The [ten-floor outline review](audit-2026-09-12/map-library/outlines.svg) is retained with the audit evidence.
