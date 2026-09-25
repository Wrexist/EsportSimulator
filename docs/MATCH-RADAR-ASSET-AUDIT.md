# Match, radar and asset review — 20 September 2026

Follow-up: see `docs/PHYSICAL-CAREER-INTEGRATION.md` for the 21 September adapter, full-team spawn checks, movement fixes and measured Mirage review.

## Scope and architecture

The current career match is still `legacy-v2`: it resolves events in `engine/match-simulation.ts`, then `lib/radar-position-engine.ts` estimates positions for presentation. Those positions do not determine career damage or wins. The collision/perception/utility/team engine in `engine/spatial/` is a separate laboratory implementation. Its sealed replay format explicitly remains `lab-only`.

This distinction is the main remaining simulation issue. Improving estimated animation cannot make it an authoritative physical match. Do not present the current work as a completed CS2-equivalent simulation, a pixel-perfect UI review, content clearance or a Steam release.

## Implemented corrections

- Radar movement now sweeps every crossed navigation cell and authored wall segment. Clear endpoints alone no longer permit travel through a wall. Blocked movement can slide along an axis or stop. The sweep conservatively disallows diagonal corner cutting.
- Fixed integration at time zero and fractional time steps; floor changes no longer project players to distant walkable cells on another floor. Actual stair/ladder portal enforcement remains open.
- Removed randomly invented smoke and the advance defuse-progress ring: legacy events do not supply the necessary throw/start/kit information. Future and cross-floor shot lines are suppressed.
- Radar dots retain their actual edge coordinates. Names use deterministic collision-avoiding labels and leader lines; dense labels can be omitted without relocating players. Added keyboard-accessible 100/150/200% zoom and a scrollable map region.
- The career radar now identifies its positions as estimated. Existing event outcomes, player identities and save data remain intact.
- Physical engine damage statistics/events now record health actually removed, including utility damage, instead of counting overkill. Existing sealed replay projection already clamps health loss and continues to support stored data.
- Replaced side-selection raster coins with original scalable SVG emblems; side choices are native keyboard-operable buttons.
- Unified desktop Facilities with the approved campus interiors. All 18 equipment catalogue image references and six category fallbacks now resolve to the distinct transparent Standard/Pro/Elite artwork. No prices, IDs or equipment effects changed.
- Replaced four references to missing `grid.svg` with a CSS grid texture. Existing portraits, club identities, source artwork, careers and map drawings were not removed.

## Verification

- Full Jest run: **177 suites, 1,673 tests passed** (`tmp/match-radar-full-tests.log`). Includes frozen checkpoint recovery, repeated resume data ownership, segment collision, time-zero behavior, no invented utilities, label placement, radar rendering and physical overkill regression checks.
- Standalone TypeScript check completed without diagnostics (`tmp/match-radar-final-types.log`).
- Static asset audit: **124 literal references, zero missing files**. Run `node scripts/branding/audit-ui-assets.cjs`; machine-readable inventory: `docs/ui-review/asset-reference-audit.json`. Dynamic paths, saved/mod content and visual suitability still require runtime review; this is not a licensing audit.
- Production build passed, including type/lint validation, generation of 40 pages and production worker startup verification (`tmp/match-radar-build.log`). Existing lint and build-time storage warnings remain; the command exited successfully.
- Chrome automation still times out when creating/selecting the dedicated review tab. No fresh screenshots, post-fix click-through match completion, zoom inspection or exact viewport validation are claimed for this pass. Existing screenshots are not evidence of the latest changes.

## Remaining work, in priority order

1. **Physical career adapter:** define one authoritative round result for the career worker, scoreboard, radar and replay. Map career roster/loadout/tactics into validated spatial inputs; convert physical events into existing statistics and economy exactly once. Retain the legacy reader for old saves. Do not enable the lab engine by simply replacing a UI animation function.
2. **One validated map first:** verify Mirage walkable polygons, body clearance, closed perimeter, wall height/penetration behavior, CT/T spawn zones, bombsite polygons and connected routes. Underpass and other vertically overlapping spaces need floor/height definitions and explicit connecting portals. A 2D wall drawing alone cannot describe these correctly.
3. **Tactical calibration:** compare seeded batches for travel time, reaction/perception, team information delays, trading, aim/movement accuracy, utility visibility/damage, plant/defuse interruptions and round endings. Establish tolerances from the intended game design before tuning. Geometry must be reliable before interpreting win-rate results.
4. **Replay and recovery acceptance:** seek and resume at buy phase, first damage, plant, defuse interruption, halftime and final round; verify identical outcomes and no duplicate payouts/XP. Test reload-to-results through the real UI once browser control works. Never reuse a previously corrupted test checkpoint as proof of a fresh match.
5. **Visual acceptance:** inspect live match, radar zoom/labels/floor switching, veto and equipment/campus at 1280x720, 1440x900 and 1920x1080. Check reduced motion, keyboard focus, overflow and asset loading. Complete remaining route/branch checks.
6. **Release follow-through:** reconcile newly generated equipment masters/exports with release content inventory, rebuild/package Windows, install/test through Steam and recheck gallery/build alignment. No upload was performed in this pass.

## Map author checklist

Continue Mirage before doing every other map. Mark blocked edges red; walkable connections green; mark cover/window height and whether it blocks movement, sight and bullets separately. Draw full spawn and plant areas, not single points. Supply stairs/ladders/underpass connections explicitly. Keep uncertain markings in draft. Routes are useful after walkability and connections are verified; they cannot repair invalid walls. Existing project files remain the source for the user's drawings.

## Originality boundary

Use original code, interface, emblems and commissioned/project-created artwork. Familiar tactical concepts are a design target; renamed copied assets are not a clearance method. Keep the previously excluded real-player photos and original team logos out of the release. User map-source confirmation remains recorded elsewhere; this pass does not expand it or resolve redistribution rights for other collections.
