# Tactical simulation audit and import roadmap

13 September 2026. Research and code audit. The first spatial foundation milestone is now implemented in the [Simulation lab](SPATIAL-LAB.md); the controlled combat milestone is also implemented in the lab (see [L11](launch-readiness/evidence/L11-REPORT.md)); utility, team behavior and live-match integration remain later work.

## Findings in the current project

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Radar positions are reconstructed from events | `lib/radar-position-engine.ts`, module description and `buildDotsAtTime` | Visible movement is not the authoritative cause of kills. |
| Round outcome generation receives a chosen winner | `engine/match-simulation.ts:1018`, `engine/match/round-outcome.ts:192` | Spatial combat needs a new outcome-producing simulation, rather than more visual adjustments. |
| Floor assignment depends on attack site, timestamps and player index | `lib/radar-position-engine.ts:361`, `getPlayerLevel` | Upper/lower transitions do not prove that a player used a staircase, ramp, ladder or vent. |
| Navigation starts from radar pixel brightness | `scripts/generate-radar-nav-data.ts:48`, `isWalkablePixel`; 128-cell grid | Artwork cannot reliably establish walkable surfaces, headroom, obstacle height or passage connectivity. |
| Navigation projects invalid positions to nearby walkable cells | `lib/radar-nav.ts`, `projectToWalkable` | Nearest-position recovery is not a connected route planner. Existing motion safeguards can stall a player instead of finding a route. |
| Kill lines crossing authored walls are omitted | `lib/radar-position-engine.ts:797` | This protects the display, but does not invalidate the underlying kill. |
| Radar smoke visuals are generated using seeded round heuristics | `lib/radar-position-engine.ts:821` | Visual smoke placement is not an authoritative inventory/throw/visibility event. |
| Map Studio is a separate draft authoring system | `lib/map-annotations.ts`, `components/maps/MapAnnotationEditor.tsx` | Its geometry, spawns and 628 imported lineups do not yet change live matches. |

The existing deterministic RNG, event logs, economy state and draft backups are useful foundations. Preserve them while introducing one authoritative spatial engine. Keep the 2D radar as a projection of that engine.

## Highest-value imports

| Data | Candidate source | Intended use | Validation before use |
| --- | --- | --- | --- |
| Navigation areas, elevation and directed connections | CS2 `.nav` assets, parsed with Awpy | Connected routes through actual surfaces | Check map version, directed links, stairs and player clearance; nav data is not complete collision geometry. |
| Static collision geometry and world/radar transforms | Awpy map assets or extraction from a matching local installation | Sight-line queries, floor/ceiling separation, coordinate calibration | Verify critical occluders and mesh simplification against map landmarks. |
| Replay positions, view angles and events | CS2 `.dem` files via demoparser2/Awpy | Measure travel times, routes, engagements, grenade tracks and utility timing | Match demo/map version and recorded tick/event timestamps; separate observations from inferred intent. |
| Spawn and plant volumes, doors, breakables, ladders and vents | Matching map entity data where exposed, plus authored corrections | Legal starting positions, objectives and changing connectivity | Confirm entity extraction support and manually review volumes; do not promise automatic completeness. |
| Weapon and movement parameters | Versioned game data plus controlled practice measurements | Speed, stopping, recoil/spread, range and damage behavior | Record provenance and units; import only understood fields. Missing values remain explicit. |
| More utility records | Existing CS2Nades snapshot plus observed demo throws | Actual use frequency, team timing, HE/fire/flash observations and alternate throws | Preserve source identity; do not label every observed throw a reliable reusable lineup. |

Awpy documents versioned collision meshes, nav meshes, radars and coordinate transforms, with height-aware line-of-sight queries: [visibility and map data](https://awpy.readthedocs.io/en/stable/visibility.html), [navigation](https://awpy.readthedocs.io/en/stable/nav.html). Its [asset pipeline](https://github.com/pnxenopoulos/awpy-data) distinguishes tool code from extracted game assets. Track provenance and permitted distribution separately when deciding what to bundle.

[demoparser2](https://github.com/LaihoE/demoparser) provides Python/JavaScript access to CS2 replay data. Use an offline preprocessing pipeline that emits compact versioned runtime data; the game should not depend on remote sites or Python while simulating a round. Confirm asset availability for each supported map before claiming coverage.

## Implementation order and completion gates

### 1. Shared map model and Map Studio validation

Define world-space x/y/z, explicit units and radar transforms; support multiple walkable surfaces at the same x/y. Preserve the user's 2D annotation coordinates and convert them through a versioned transform. Distinguish movement blockers, sight blockers, cover height, penetrable materials, floor/ceiling slabs and dynamic objects.

Add named height layers and linked endpoints for stairs, ramps, ladders, vents, jumps, drops and assisted boosts. Connections specify direction, traversal action, clearance and cost. A drop need not be reversible. Tunnels need floor/ceiling separation even on a radar with one image.

Add spawn-volume and plant-volume validation, disconnected-area highlighting, missing-link checks, geometry version/source status, and a reviewed snapshot action. Unfinished drafts remain editable; only an explicitly selected validated snapshot feeds simulation.

Gate: a Mirage route/visibility inspector correctly distinguishes overlapping elevated and underground positions, finds a legal path through authored passages, rejects disconnected destinations, and preserves all existing draft markings.

### 2. Authoritative player movement

Introduce fixed-step seeded round state with actual position, velocity, facing, stance, weapon, health and inventory. Plan routes on connected surfaces, smooth them within the valid corridor, and collision-check the entire movement segment with player clearance. Model acceleration, braking, walk/run/crouch, ladders, jump/drop actions and slower movement where appropriate.

Add local teammate avoidance and narrow-doorway queuing. Detect lack of progress, then replan, wait or abandon the route with an explanation; avoid teleport recovery. Change height/floor only through legal motion or a linked traversal action. Interpolate only the display between simulation snapshots.

Gate: repeatable traversal tests have no wall crossings, forbidden corner cuts, unsupported floor changes or unexplained teleports. Measure travel times against reference recordings, including Mirage's underpass. Report failures rather than projecting them out of view.

### 3. Visibility, perception and spatial combat

Separate world truth from each player's knowledge. Track field of view, eye height, occlusion, visible body samples, last-seen positions with uncertainty, audible events and delayed teammate information. Hidden opponents must not enter decision scoring through their exact current coordinates.

Shots require a firing state, ammunition and a resolved trajectory. Evaluate obstruction and modeled penetration, range, armor/hit location, stance, movement accuracy, recoil/spread, aim adjustment, reaction and reload timing. Blind suppressive shots can occur without a visible target; their success still follows physical shot resolution. Kill events are produced by damage, and round results follow elimination, time or bomb resolution.

Gate: a solid nonpenetrable wall or intervening floor prevents the modeled bullet from reaching the target. Legal openings allow shots. Outcomes, health, ammunition, kill feed and radar all derive from the same event stream. Skill changes decisions and execution, never permission to violate geometry.

### 4. Utility with real consequences

Throw only owned utility from a reachable throw position. Start with verified prerecorded trajectories for known throws and clearly scoped fallback physics, rather than claiming a perfect general CS2 grenade solver. Track flight, bounces, detonation and expiry. Smokes alter visibility; flashes use facing, exposure and occlusion; fire affects route choice and damage; HE evaluates blast obstruction and distance.

Add a trajectory preview, timeline scrubber, bounce-height editing, smoke visibility probe and flash exposure probe to Map Studio. Give source targets, measured trajectories and user-authored estimates different review states. Preserve the current 16 unresolved source records for correction.

Gate: inventory decreases exactly once per throw; detonation corresponds to a valid trajectory and location; utility effect tests respond to walls, height and expiry; no decorative smoke clouds are generated independently of player actions in the new simulation.

### 5. Player decisions and team coordination

Use explainable action scoring for holding, peeking, clearing, supporting, trading, rotating, executing, retreating, saving and retaking. Include role, weapon, health, clock, known threats, route exposure and utility. Coordinate entry/trade spacing, flashes before peeks, crossfires, anchor responsibilities, bomb ownership and post-plant positions.

Model imperfect information and bounded human mistakes: reaction variation, missed shots, stale callouts and over/under-aggression. Demo observations can calibrate distributions; they do not directly reveal a player's intention or provide an importable intelligence system.

Gate: scripted information tests show bots reacting only to evidence they have received. A decision inspector identifies the chosen action and relevant evidence. Repeated seeds reproduce decisions and outcomes, and stronger teams retain a measured advantage without becoming omniscient.

### 6. Replay comparison, regression and rollout

Create a simulation lab: two draggable players, route preview, sight ray, hearing preview, utility preview, slow motion, pause/step and an event timeline. Include a "Why did this happen?" inspector for movement, perception, shots, damage and decisions.

Maintain at least 20 curated geometry/combat/utility scenarios plus batch seeded rounds. Track invalid movement segments, illegal transitions, stuck episodes, obstructed shot errors, utility failures, deterministic replay equality and simulation cost. Compare route timing, encounter locations, trade delays and utility timing against held-out demos; choose accuracy tolerances from measured data.

Run the new engine behind a feature flag and preserve the existing save/economy interfaces. Validate live and accelerated simulation against the same seeded events. Introduce Mirage first, Nuke second for overlapping floors and vents, then expand through the remaining maps. Benchmark CPU/memory on the target machine before selecting update rates and season-simulation budgets.

## First bounded milestone

Build the Mirage map/route/visibility inspector and import a version-matched navigation/collision reference. Cover underpass elevation, tunnel ceilings, stairs, openings and CT/T spawn areas. Run two test players through explicit routes and verify shots at selected positions. This establishes the geometry and tooling needed for the later combat engine without treating unfinished user annotations as final game rules.

This audit added a roadmap only. No new geometry assets, demo files, player AI or live-simulation changes were imported in this step.
