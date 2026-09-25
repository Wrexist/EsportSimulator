# Map Studio: utility and spawn areas

Open **Settings & Tools > Map Studio**, or `/map-editor` on the running game server. No career is needed.

The researched multi-map library is now available: see [coverage, sources and backup behavior](MAP-STUDIO-LIBRARY.md).

## Your unfinished Mirage draft

The [original upload](../public/map-studio/drafts/mirage-user-draft-2026-09-12.json) is preserved byte for byte: 14 wall markings, with coordinates, IDs and notes unchanged. It is not completed or validated geometry.

Choose **Saved drafts > Continue saved Mirage** to reopen that snapshot. This downloads a backup of your current nonempty draft first. **Download original** retrieves the untouched upload. **Open project** reads exported version 1 or version 2 projects.

## Drawing tools

| Group | Tools | Drawing |
|---|---|---|
| Geometry | Wall (W), Passage (G), Window/cover (B), Route (R) | Walls/routes: click corners, then Enter or Finish. Passages/windows: two clicks. |
| Utility | Smoke (S), Flashbang (F), HE (N), Molotov/incendiary (M), Decoy (D) | First click = throw position. Second click = landing or detonation. |
| Areas | CT spawn (C), T spawn (T), Bombsite (A), Callout (L) | Trace at least three corners, then Finish to close an area. Callouts need one click. |

For grenades, enable **Add bounce / path points** before drawing to place intermediate points. Press Enter or Finish when done; the last point is the landing or airburst. Hollow circles identify throws; filled letter markers identify landings. Path points show your intended trajectory, not simulated physics.

The Utility group includes 13 common Mirage templates. Selecting one fills in the type, team, name and purpose. You place the coordinates yourself. Templates cover mid window, Ticket, Stairs, Jungle, Market, Short, entry/retake flashes, fire and a default HE.

## Refine and organize

- **Select (V):** drag a line, filled area or pin to move it. Drag individual handles to reshape it. Grenade handles distinguish Throw, Bounce and Landing. Arrow keys nudge a focused handle by 0.1 map unit; Shift makes it 1 unit.
- **Details:** labels, four label positions, notes, team and Draft / Checked by me status. Utility adds throw technique, aim instructions and effect-guide radius (0.5-15% of map width).
- **Focus:** zoom to a selected marking. **Duplicate:** make an editable copy. **Lock:** prevent accidental dragging, deleting and detail edits. Unlock to revise it.
- **Layers & visibility:** toggle individual types, show all or hide all. Search names, types and notes. Team filtering includes shared markings alongside the selected side.
- **Pan (H):** drag the canvas. Space + drag and middle-button drag also pan. Scroll to zoom; + and - zoom; 0 or Fit restores the map.
- **Undo/redo:** Ctrl/Cmd+Z; Ctrl/Cmd+Shift+Z or Ctrl+Y. Up to 100 completed edits, reset when loading another map or reloading.
- **Cancel:** Escape. Backspace removes the last unfinished point. **Erase (E)** or Delete removes an unlocked marking; Undo restores it.

Snap finds nearby points. With both grid and snap enabled, other points round to one-map-unit divisions. Desktop side panels scroll independently; compact layouts put Details below the map.

## Save and share

Completed markings autosave per map/floor in this browser and origin. Finish a stroke before exporting or changing maps. In-progress strokes are not saved. Browser storage is not a portable backup: **Save project** downloads coordinates and metadata as editable JSON. New exports use version 2; version 1 drafts migrate without changing coordinates. Old editor builds cannot read version 2.

**Export PNG** produces a 1536 x 1660 image including every layer and spawn polygon. Imported lineups use compact target dots unless Show all imported paths is enabled; manual utility paths remain expanded. View filters and label visibility only affect the editing preview. Aim instructions, notes, locks and review status remain in the JSON. Import is undoable and downloads backups of nonempty drafts before replacing them. Storage failures are reported; invalid stored drafts have a recovery download.

## Research and limits

The [GetReplay Mirage guide](https://getreplay.gg/en/articles/cs2-mirage-lineups), updated 27 July 2026, informed template names and purposes. Its mid-control, site-entry and defensive examples support the initial library. These manual templates do not supply coordinates. The separately researched CS2Nades library now imports source coordinates with radar alignment; see the library guide.

[Fastnades](https://fastnades.com/maps/mirage) separates throw positions and landings and tracks lineup verification; this informed distinct endpoint markers and manual review status. [Valve's responsive-smoke overview](https://www.youtube.com/watch?v=_y9MpNcAitQ) explains that smoke interacts with its environment. Effect circles are therefore adjustable planning guides, not exact smoke footprints, flash visibility or damage radii. Height, bounce behavior, wall openings and grenade physics need separate validation.

Green passages do not erase crossing red walls automatically. Spawn polygons identify authored starting areas but do not place live players. No annotations change live matches yet. The uploaded wall draft remains unfinished.

## Earlier utility-tool verification

Final checks: production build and type checking passed, compiled worker startup passed, and 43 targeted tests across three suites passed (39 annotation tests). Focused lint is clean; the full build retains the existing lint warning backlog. Production was reopened successfully with the user's original 14 markings. A separate browser-draft backup was downloaded before refresh and its markings match the upload. No commit, push or release was performed.

The original upload has a SHA-256 regression check. Tests cover old-project migration, all 13 tools, tactical metadata, import rejection, undo/redo, snapping and shared canvas/export primitives. Browser checks covered restoring the supplied draft, all five utility types, bounce points, CT/T polygons, callouts, endpoint nudging, locks, duplicate/undo, team/search filters, reload persistence and PNG/JSON downloads. Layout inspected at 1920px and 1024px; temporary viewport override reset afterward.

Native file-picker automation remains blocked by the Chrome extension's file-access setting. Saved-draft import works through the same parser and project-opening function; native file selection still needs a manual check. No extension settings were changed.

[Editor preview](audit-2026-09-12/map-studio-v2-evidence/editor.png), [PNG example](audit-2026-09-12/map-studio-v2-evidence/utility-and-areas.png) and [editable example](audit-2026-09-12/map-studio-v2-evidence/example.map-project.json) illustrate the tools with deliberately labeled test placements. These utility/spawn positions are not validated Mirage lineups.
