# L10 — Movement and navigation integration

13 September 2026. **Partial: registered geometry now feeds the simulation lab; measured traversal, moving teammates and manual Mirage acceptance remain open.** Dependencies L04/L09 are partial. Live career matches do not use this spatial engine yet.

## Changes

- The existing 64 Hz runner now checks starting body clearance and supported feet, retaining continuous time across short segments, acceleration, braking and collision stopping. Floor checks distinguish overlapping levels; there is no snap-to-nearby-floor recovery. Heading turns at a bounded rate for preview display; tactical steering and weapon aim remain separate future work.
- Navigation polygons are often inset from the physical floor. Foot-ring checks use nearby navigation support or downward static-floor rays within the provisional step envelope, while the center still needs the correct navigation surface. A synthetic regression distinguishes real floor extension from a void or another floor. This fixed valid Mirage border movement without removing support checks.
- Custom walk links cannot bridge a void. Step/ladder links need valid source/destination surfaces, supported approaches and bounded transition distances. Smoothing only removes safe detours within the current polygon; it does not skip directed portals or floor changes.
- Explicit one-way jump/drop arcs have takeoff, trajectory, body-sweep and landing validation. The runner executes their time-parametrized arc rather than linearly interpolating through empty space. Toggles are off by default. Gravity 800, impulse 280, maximum horizontal speed 220 and maximum drop 128 are provisional simulator values, not calibrated CS2 claims. Crouch and ceiling restrictions remain enforced.
- Up to ten stationary teammate reservations add body obstacles for route/overlap tests. Removing a reservation or changing the route rechecks from the authored start; no teleport fallback. This is not dynamic congestion management, reciprocal avoidance, replan-from-live-position or deadlock recovery.
- Lab saves retain geometry copies, reservations, experimental traversal settings and links. The inspector offers safe spawn/site endpoints and visible failure reasons; the radar remains 2D and Studio remains quiet.

Primary files: `engine/spatial/navigation.ts`, `geometry.ts`, `movement.ts`, new `airborne.ts`, `spatial-lab.worker.ts`, `lib/spatial-lab-project.ts` and `components/maps/SpatialLab.tsx`.

## Evidence and limits

All four reviewed-copy Mirage spawn/site paths complete execution (31, 72, 79 and 104 route points). The actual production worker is exercised separately by `scripts/launch/build-spatial-review-probe.cjs` and `spatial-review-native.cjs` with an isolated Electron profile. The probe is an integration harness using the real compiled worker and local reference files; it is not a packaged application acceptance test.

Regression cases cover overlapping floors, inset physical support, unsupported custom walks, standing/crouch ceiling clearance, authored wall height, teammate overlap, deterministic jump landing, direction/toggle restrictions, ceilings/walls, impossible reach and one-way drops. Existing spatial tests retain ramp, step, ladder, replay and tile-boundary timing coverage. Final check identities and counts are recorded below.

Static collision is a decimated visibility mesh and the body solver uses sampled rays, not exact capsule contact or complete solid-volume containment. The planner can conservatively reject narrow or alternate paths and representative spawn points do not establish full polygon coverage. The current map ranges still contain unsupported samples. Therefore L10.2/L10.3/L10.4 and release acceptance remain open for measured floor/ladder fixtures, blocked-path recovery, moving-player coordination and calibration.

## Next

Review Mirage underpass, window, connector and ladder transitions with measured positive/negative/reverse cases. Add moving-teammate scheduling and bounded recovery, then implement **L11 — a controlled encounter with perception, reaction, aiming and collision-tested damage**. L12 utility physics and L13/L14 team decisions/live-match integration follow that proof. Packaged Windows testing, the real Steam App ID and content clearance remain required.

## Browser acceptance in this pass

Chrome on `localhost:3210` used the existing QA storage origin, separate from the owner's `127.0.0.1` drafts. Opening **Saved drafts ? Open registered review copy** displayed the backup/undo acknowledgement and all 142 marks. Validation completed with 18 errors / 25 notes and the expected four zone counts; the reference overlay rendered on the 2D radar. **Save check with project**, then reload, retained the 18-issue receipt and 142 marks.

The lab's **Load Studio geometry** retained an independent geometry copy. **Check spawn / site zones** showed all four counts, with its busy state disabling duplicate validation requests. CT **Start here** and A **Go here**, standing/run, produced 1,966 units across 28 surfaces, blocked direct visibility, and playback arrived at height -173 after 9.125 seconds. Reload retained endpoints at heights -264/-173, the geometry copy and the same 9.1-second route. These are real production browser checks, not mocked DOM tests.

The first visual check found an inline heading and stale text claiming jumps/drops were unavailable; the final build corrects spacing and copy. Native file chooser, packaged Windows rendering and full keyboard/viewport coverage remain open. The first native harness attempt incorrectly loaded a shared Webpack module and timed out; the harness now discovers the actual worker bootstrap and runs it with its generated dependencies. The application browser worker itself loaded normally.

## Final verification

- Full regression: **1,362 tests / 143 suites pass** (`npm test -- --runInBand`, 98.908 seconds). The final subsequent changes were panel spacing and guidance text; no engine behavior changed afterward.
- Fresh TypeScript: **0 errors**. Final production build and compiled week-worker verification: **pass**, with existing repository lint warnings.
- Actual spatial worker in sandboxed Electron 44.3.0: **all eight probe checks pass**. Four spawn/site movements complete; repeated CT?A output is identical (585 frames, 9.125 seconds, replay SHA-256 `6b4752c73b3336f65925b7046d2db6188872a1f755a64683f3a1f617cfe5b670`). Changed radar hashes and teammate-overlapping starts are rejected.
- Final build ID: `19OP8siEFUQKAXfnUSrn4`. Spatial bootstrap: `2063.be6e889d5e877b24.js`; SHA-256 `fc3f47086db7a3e3f5c93379f60918d582c691b6cdddd53ae6323ec211eb44d4`. Generated dependencies and source identities are in the receipt.
- Final browser reload verified the corrected traversal text, retained project/check and improved panel layout; validation still reports 18 errors. The review tab remains open and the production preview runs at localhost:3210.
- Launch-plan structure validation passes for 36 packages, 144 tasks, 108 acceptance criteria and 40 routes. This is not release acceptance.

[Source/build receipt](L09-L10-checks.json), [full regression](L09-L10-regression.txt), [production build](L09-L10-build.txt), [fresh types](L09-L10-types.txt), [native worker report](L09-native-spatial.json), [original drawing analysis after image registration](L09-original-analysis.json), [derived review analysis](L09-registered-analysis.json), [all-map registration/coverage](L09-registration.json).

L09.A2/A3 now have persistence and coverage evidence. L09.A1 and all L10 release acceptance remain open. No release artifact, Steam submission, content clearance, commit or push was performed.
