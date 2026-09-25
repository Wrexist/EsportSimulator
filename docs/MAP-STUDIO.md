# Map Studio

**Latest:** [Utility, spawn areas and saved Mirage draft guide](MAP-STUDIO-TACTICAL.md). The editor now includes 13 drawing tools, common utility templates, locking, filters and version 1 project migration. The original four-tool instructions below remain useful for drawing geometry.

Open **Settings & Tools > Map Studio**, or `/map-editor` on the running game server. The editor starts on Mirage and remembers your last map and floor. It works without starting a career.

## Draw

| Tool | Key | How it works |
|---|---|---|
| Red wall | W | Click each corner. Press Enter or Finish to complete the line. |
| Green passage | G | Click the two edges of a doorway or passage. The second click completes it. |
| Blue window / cover | B | Click two endpoints, then choose Window, Low cover or Jump / climb in the details panel. |
| Yellow route | R | Click each waypoint, then Enter or Finish. The arrow follows the direction you drew. |
| Select | V | Select a line, drag the line to move it, or drag individual points to reshape it. |
| Pan | H | Drag to move around the canvas. Space + drag also works with another tool selected. |
| Erase | E | Click a marking to delete it. Undo restores it. |

Escape cancels an unfinished line. Backspace removes its last point. Click near an existing endpoint to snap to it; turn snapping off for independent placement. Turning on the grid also snaps to its one-unit divisions when snapping is enabled. A closed wall outline can be made by clicking its starting point again before finishing.

Scroll to zoom, or use + / -. Fit map (0) resets the view. Selected points can also be moved with arrow keys: 0.1 map units per press, or 1 unit with Shift. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes. Undo history holds the latest 100 edits for the open draft and resets when reopening the tool or switching maps.

## Refine

The right panel lists every marking. Select one to add a label and notes. For blue markings, specify whether it is a window, low cover or a jump. Record special cases such as one-way drops or shooting over a railing in Notes. Routes have a Reverse direction button.

Eye buttons hide layers temporarily. Hiding a layer does not delete it. Exports contain all layers. Map brightness and grid settings are editing aids; PNG export uses the original map image and all labels.

## Save and share

- **Autosave** keeps completed markings on this device, separately for each map and floor. Check the status under the title. An unfinished line must be completed before it becomes a saved marking.
- **Save project** downloads an editable `.map-project.json` file with coordinates, labels, notes and floor information. Keep this as your backup and send it for game-geometry work.
- **Open project** opens an exported JSON file. Invalid or oversized files are rejected before replacing a draft. Importing over a valid draft can be undone during the same session.
- **Export PNG** downloads a 1536 x 1660 image including the map, colored markings, labels and legend. Notes remain in the editable project.

Nuke and Vertigo have separate upper/lower canvases. Other maps use one canvas. The map background comes directly from the game's radar assets, so coordinates remain in the same 0-100 space.

Drawings are review drafts. Registered, height-bound red walls can affect independent Simulation lab checks; drawings do not yet alter live match outcomes. Blue/green height fields document review intent and do not create or cut collision openings. A green marking records an opening; it does not automatically cut a crossing red wall. Keep wall endpoints clear of passages when annotating. The next simulation integration must resolve collision boundaries, openings, visibility and height rules from reviewed geometry.

## Local verification

The development browser check covered all four tools, connected wall/route completion, point dragging, undo/redo, saved notes after reload, layer visibility, zoom, map/floor switching, and PNG/project downloads. Layout was checked at 1920px and 1024px widths. Test markings were removed before handoff.

Automated native-file import was blocked by the Chrome extension's file access setting. The import parser and exact coordinate/note round-trip are covered by unit tests; a human file-picker check remains. No browser console errors were captured during the editor checks.

Evidence: [editor screenshot](audit-2026-09-12/map-studio-evidence/editor.png), [exported example PNG](audit-2026-09-12/map-studio-evidence/export-example.png), [editable example](audit-2026-09-12/map-studio-evidence/example.map-project.json). These are deliberately labeled examples, not validated Mirage geometry.

Production build, fresh type checking and compiled-worker startup passed. All 16 targeted tests passed; focused lint for the new editor/model had no warnings or errors. The full build retains the pre-existing 154-warning lint backlog. The production editor was reopened successfully with a clean Mirage draft. No commit, push or release was performed.
