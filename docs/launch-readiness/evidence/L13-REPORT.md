# L13 â€” Team knowledge and tactical coordination

Implementation pass: 13 September 2026. **Partial; launch acceptance remains open.** L11/L12 and the spatial calibration dependencies are still partial. This implementation runs in the independent simulation lab; it does not replace the career match generator.

## Implemented behavior

- A bounded, seeded 64 Hz team simulation supports one to five players per side. Roles include entry, support, lurk and anchor; replay intent also explains defaults, executes, rotations, retakes, trades, clutches, saves, planting, defusing, blocked movement and death.
- Direct field-of-view/body samples create local knowledge. Radio observations arrive after configurable delay, retain their original observation time, accumulate uncertainty and expire. Team policy accepts friendly resources, public objective state and delivered evidence; it has no hidden-enemy-position input. Rotation changes once rather than bouncing between objectives. A decision to save persists for the scenario.
- Supported navigation and collision sweeps check movement. Rotating movement priority and swept 32-unit horizontal body separation prevent overlapping players and same-tick swaps; genuinely separate floors remain distinct. Repeatedly blocked movement stops safely after bounded attempts and records why. This is a conservative hold, not a general congestion solver.
- Entry/support spacing, a separate lurk assignment, anchor holds, public-plant retakes and a nominated defuser provide the initial coordination policy. Non-defusing CT teammates cover their assigned stations. A nearby teammate death opens a short trade opportunity only against a currently visible target; reaction, aim, ammunition and physical ray checks still apply.
- Seeded execution skill controls reaction and spread. Gun rays resolve against geometry and the first body using the same live-body snapshot for simultaneous shots. Teammate bodies block gunfire; friendly gun damage is disabled in this lab. Utility retains its existing friendly/self effects. Reloads can finish after contact is lost. Sound cues are uncertain and reaction-delayed.
- A living carrier must reach a clear, same-floor objective radius and hold still for the full plant duration. Death drops the bomb; recovery requires physical proximity. Defuses also require clear reach and uninterrupted time. The bomb deadline wins an exact-time tie. Travel estimates use checked movement duration; an impossible deadline produces an explained save unless the scenario explicitly selects commit.
- Utility shares the L12 flight/effect implementation, now with validated per-player inventories. Each authored throw waits for evidence or an execute/retake trigger and objective proximity. A save or dead owner preserves unspent inventory. Throws cannot repeatedly spend the same plan; stock and plan-count bounds remain intact.

## Review tools

`/map-editor/lab#team-lab` adds six pinned Mirage examples: delayed radio, execute/plant, retake/defuse, deadline save, support smoke, and live-fire trade/clutch. These are original **2v2 diagnostic points**, not approved competitive starts or bombsites.

The team panel provides seed, timing, skill, economy and role controls. Existing A/B map markers can assign player starts, hold positions and test objectives. Opening an example downloads the current lab setup first. The canonical lab serializer preserves optional team settings in Save/Open; older tests remain valid without them. Each worker result is correlated to its request and discarded after setup changes.

Replay samples every eight simulation ticks and uses actual frame timestamps for playback. T/CT views show friendly state and delivered shared reports, excluding private live sightings, hidden enemy resources, hidden carrier position and unobserved utility. Observer view exposes physical state and grenade paths for debugging. Exported replay JSON includes the scenario, source version, mesh identity, frames and explanations.

## Verification

- Full Jest suite: **1,435 tests / 147 suites pass** (`tmp/l13-full-tests.log`).
- Focused team, encounter and utility regression: **60 tests / 3 suites pass**, including 17 new team tests (`tmp/l13-focused.log`). Coverage includes delayed/no-knowledge behavior, hidden relocation, stale reports, reaction timing, deterministic ordering, role changes, objective interruptions, exact timers, obstructed objective reach, bounded congestion, utility isolation and serializer round-trips.
- TypeScript: zero errors (`tmp/l13-types.log`). Final targeted team lint: zero warnings/errors (`tmp/l13-lint-final.log`).
- Six fixture generation checks pass against reference **2000908**, mesh SHA `0e320dbed9141215f7bd2c7e10cb7c616ec188ad963546fd3fcbf1c820f2290f`. Fixture byte/full/discrete identities are recorded in `public/map-studio/teams/l13/index.json`.
- [Calibration diagnostics](L13-calibration.json): smoke, flash, HE, fire and decoy each release once and detonate in a team scenario. Their generated landing checkpoints match their own model; a 64-unit target shift is detected as a mismatch. This does not certify real-game accuracy.
- The recorded 24-seed 2v2 batch produces 19 T wins at skill 0.2 and 24 at both 0.65 and 0.8, against CT skill 0.65. This is evidence that execution parameters change results, and also evidence of a favorable starting layout. Broader, mirrored and all-map balance distributions remain required.

- Final production build **`fnqGLOHcgCejWPb_-7-HO`** passes, including compiled week-worker validation. Spatial worker: **`2063.536af38005ec1c05.js`**. Existing repository-wide lint warnings remain; targeted new team files are clean.
- [Native worker evidence](L13-native.json): all six scenarios run twice through the actual production worker in sandboxed Electron 44.3.0/Chromium. Full outputs repeat and match Node for all six; this establishes parity only for these fixtures, not every floating-point case.
- [L12 native regression](L13-l12-regression-native.json): all five original utility scenarios repeat; authoritative state/events match the existing Node expectations. Existing last-bit continuous-value differences remain recorded, without rounding the engine.
- Visible Chrome QA: opening an example backed up the previous lab test; initial T view withheld enemies; the first radio report arrived at 1.000s with the original observation age. Observer view exposed all four actors. Changing communication to 250ms invalidated the replay and survived page reload. Support smoke rendered at 3s, one step advanced to 3.125s/tick 200, and timed playback advanced normally. [Screenshot](L13-team-lab.png), [visible diagnostics](L13-browser-ui.txt).
- [Browser export check](L13-browser-replay-check.json): the downloaded support-smoke replay fully reproduces in Node (71 frames, 64 events). The exported replay is retained as `L13-browser-replay.json`.

Exact commands, identities and retained check outputs: [L13-checks.json](L13-checks.json).

## Mirage review

[Read-only review](L13-mirage-review.json) preserves both owner uploads byte-for-byte. V12 SHA remains `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2`; all 169 marks remain present. The current review still reports **20 errors / 87 notes**, with **zero authored walls admitted** because all 17 lack reviewed height bindings.

Required owner/map review remains: the seven default windows, the two coincident blue/green pairs, the long blue corridor-edge marking, named opening heights, CT/T spawn and A/B ground extents, and explicit window/underpass/ladder floor transitions. The lab does not invent heights or silently shrink those polygons. Utility parameters and the 123 authored utility marks still require actual lineup/height/landing review.

## Remaining acceptance

L13.1/2 are implemented at the declared lab scope. L13.3/4 and every launch acceptance criterion remain open for broader scenario evidence. In particular:

1. Validate full 5v5 behavior, all launch maps, mirrored skill distributions and difficult chokes. Conservative blocked holds need better yielding/alternate routes before they can be accepted as production tactics.
2. Add reviewed angle assignments, moving crossfires, coordinated multi-player executes, robust dropped-bomb recovery assignments and richer equipment/round-economy evaluation. Current save policy uses the chosen scenario economy mode, not career money.
3. Integrate reviewed bombsite polygons/spawns and explicit vertical transitions. This slice uses standing walking and test circles; team traversal does not consume the lab's optional authored jump/ladder links.
4. Calibrate perception, reaction, rifle/body model and utility against measurements. Current armor is a simplified rifle model without a separate team helmet setting; dynamic doors, breakables and penetration remain held.
5. Complete L11/L12 dependencies and Windows packaged acceptance. Cross-runtime floating-point parity must be assessed separately from authoritative event/resource parity.
6. **Next development package: L14**, a versioned authoritative match/replay path with old-career compatibility and duplicate-commit prevention. Prepare this without switching careers to the new engine until its controlled acceptance gates pass.

The real Steam App ID and content distribution clearance remain release requirements. The transfer-popup portrait fix, compact results screen and Hall of Fame cleanup/aliases are still queued; the owner's latest instruction returned priority to L13 and those UI fixes have not been applied in this pass.

## Files and rollback

Core: `engine/spatial/team-model.ts`, `team-simulation.ts`, `team-view.ts`, `lab-teams.ts`; worker transport in `spatial-lab.worker.ts`; shared utility ownership in `utility.ts` and the bounded A/B casts in `encounter.ts`. Portable settings: `lib/spatial-lab-project.ts`. UI: `components/maps/TeamLab.tsx`, `SpatialLab.tsx`, shared `UtilityReplay.tsx` and inventory typing in `UtilityControls.tsx`. Regression: `__tests__/spatial-teams.test.ts`. Fixture/native/calibration tooling: `scripts/launch/*l13*`, the probe selector, and the existing read-only Mirage reviewer with a package-specific output option.

No career schema migration, persistent career write, Steam change or owner-map rewrite was needed. Rollback can remove the optional team panel/worker branch and optional `teams` field together, retaining the original A/B lab. Before changing any lab setup, retain its exported backup. Do not reset the dirty worktree or remove unrelated previous launch work.
