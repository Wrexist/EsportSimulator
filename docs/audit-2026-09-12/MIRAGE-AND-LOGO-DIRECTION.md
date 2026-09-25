# Individual identities and believable 2D rounds

User decisions: retain fictional team names, use preserved original logos as design references, keep the radar 2D, and start geometry validation with Mirage.

## Completed in this pass

- Removed the 2.5D/3D selector, perspective layers and WebGL import from the live radar component. The standalone unused renderer remains in the repository.
- Removed the separate half-second CSS position lag from dots and names; positions and event endpoints now render on the same update clock. This does not change simulated movement or claim physical accuracy.
- Added three individually authored vector studies: Ironspire (bird profile), Skypulse (split directional mark), Zenith (intersected peak). They use the current fictional names and palettes and preserve source assets. Existing custom uploads and replacement mod paths retain priority. Other clubs still use the previous renderer.
- Added reference comparisons in the gated development radar preview and captured [the first three studies](asset-evidence/logo-redesign-study.png).
- Added a reproducible source audit, `npx tsx scripts/audit-team-logo-references.ts`, covering every current roster entry. [Results](logo-reference-audit.json): 115 small candidate images, 21 larger candidate images, 29 missing files, 33 ambiguous/unmatched entries. Source matching uses the preserved rank prefix, not an assumption that every `logo.original.webp` belongs to the current club. Candidate mappings still need visual review; the 220 files in the asset tree are not 220 verified current-team originals.

## Why the radar is not physically believable yet

`scripts/generate-radar-nav-data.ts` derives walkability from pixel brightness/alpha. `lib/radar-nav.ts` projects points onto that mask; it is not a route planner. `lib/radar-position-engine.ts` steers toward phase-dependent targets and can stall or cut across obstacles. Every current map JSON has zero authored wall segments.

Round kills originate separately in `engine/match/round-outcome.ts`. The radar reconstructs positions afterward and suppresses some implausible tracers. Correcting the display alone cannot make a spatially impossible kill valid.

## Mirage annotation handoff

Use [this exact, unchanged 1024px radar PNG](asset-evidence/mirage-markup-base.png). Start with Mid and its A/B connections; a partial, precise annotation is useful.

| Mark | Meaning |
|---|---|
| Red line | Solid wall: blocks walking and ordinary direct shots |
| Green gap/arrow | Doorway or passage players can walk through |
| Blue line + note | Window, railing or low cover: describe whether players can shoot, jump or see across |
| Yellow arrow | Common route or rotation |
| Number + note | Height change, one-way drop, climb, or ambiguous obstacle |

Keep the image orientation and size unchanged. Name Window, Connector, Short/Catwalk and Underpass if those labels help identify the connections. Mark gaps deliberately so doorways are not accidentally closed by wall segments. The existing `/dev/map-builder` supports walls and paths, but its current wall tool does not distinguish movement from visibility and shows only the upper-floor image. PNG markup is the simplest first review format.

## Implementation sequence after geometry review

1. **Geometry contract:** separate walkable surfaces, collision boundaries, sight blockers, cover height/material and explicit floor links. A window is not automatically a walkable opening. Preserve current coordinate space and version the layout schema.
2. **Route planning:** use A* or a navigation mesh over validated walkable regions; prevent diagonal corner cutting and swept movement through walls. Route distance determines travel time. Invalid/unreachable destinations must produce a stable fallback, not a teleport.
3. **Spatial round simulation:** player location, facing, visibility and cover determine which encounters can happen. Resolve aim/reaction/weapon outcomes only after an eligible encounter. Record attacker/victim positions with each shot and death; use the same positions for the live radar and replay.
4. **Tactical behavior:** staged entry, angle clearing, stationary firing where appropriate, trade spacing, site holds and rotations. Add smoke occlusion and material-dependent penetration as explicit rules after ordinary movement and sight tests work.
5. **Mirage acceptance:** fixed-seed rounds through Mid, A and B; no solid-wall traversal; no shots through solid walls; valid window shots; consistent path speed; no dead-player movement; same seed reproduces positions and events; seeking replay does not change outcomes. Compare a complete live round with the user before applying the schema to the other maps.
6. **Identity rollout:** resolve missing/ambiguous reference mappings, then redraw each club individually. Verify every mark at 24/36/80px on dark and light surfaces. Complete the remaining 195 clubs rather than extending the generic seed-based shapes and calling them individual redesigns.

## Verification and limits

Seven targeted tests passed for 2D control markup, existing crest rendering, authored-logo selection and custom-logo precedence. Browser preview showed the three new marks beside their references and no 3D controls; no browser console errors were captured. Fresh type checking and targeted lint results are recorded in the evidence folder. No match-engine or map-geometry edits were made in this pass. Full-roster redesign, accurate route planning and spatial combat remain work in progress pending source/geometry review.
