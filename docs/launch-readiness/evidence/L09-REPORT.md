# L09 — Registered Mirage geometry review

13 September 2026. **Partial: implementation and sampled reference checks are available; manual geometry acceptance and L02/L08 prerequisites remain open.**

## Preservation and findings

The original upload remains byte-for-byte unchanged at `public/map-studio/drafts/mirage-user-areas-2026-09-13.json`, SHA-256 `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65`. Its 142 marks comprise 15 walls, 79 smokes, 20 flashes, 24 fire grenades, two spawns and two sites. The four original area notes are empty and both original site labels are generic. No owner browser draft or career was overwritten.

The separate `mirage-registered-review.json` retains every marking ID, kind and vertex. It assigns A/B labels from the radar's bottom/upper-left sites and adds provisional ground ranges derived from reference surfaces, explicitly excluding elevated crates. Those labels and ranges still need author review. All four areas remain Draft. Wall heights were not guessed; all 15 walls, including the outer outline, remain unbound drawings until reviewed.

| Zone | Ground range | Clear inset samples | Missing selected floor | Edge/obstruction samples | Sampled exits |
|---|---:|---:|---:|---:|---:|
| CT spawn | -312 to -240 | 85 / 113 | 18 | 10 | 1 |
| T spawn | -180 to -145 | 86 / 121 | 0 | 35 | 2 |
| A plant zone | -190 to -145 | 55 / 88 | 22 | 11 | — |
| B plant zone | -174 to -140 | 52 / 88 | 25 | 11 | — |

The registered review reports **18 errors and 25 review notes**: 15 missing wall height bindings and three floor-coverage errors, plus provisional alignment, draft and clearance notes. Each of CT→A, CT→B, T→A and T→B completes full fixed-step movement between the selected safe representative points. This proves those sampled paths in this reference model; it does not approve every point of a spawn polygon, actual five-player spawn selection, plant-trigger boundaries or the original red walls.

## Implementation

- Versioned affine registration maps original radar percentages into the pinned world reference, retaining both image SHA-256 values, mesh/version identity, method, evidence and confidence. Production worker validation rejects changed radar hashes. Local image-feature alignment uses 660 Mirage SIFT/RANSAC inliers, median residual 0.250 px and p95 1.288 px. These are image correspondences, not measurements of gameplay accuracy.
- `registration.json` covers eight maps / ten radar floors, with explicit unreviewed wall, spawn, plant and vertical-traversal coverage. Every row remains release-held; see the [map/floor coverage sheet](L09-map-coverage.md). No map was silently removed from the promised launch pool and no content clearance was granted.
- Polygon validation accepts implicit or explicit closure and rejects self-crossings, repeated edges and collapsed areas. Height-aware samples inspect support, body/head clearance, multiple floors, connected exits and complete spawn/site movement. Registered height-bound wall segments add vertical collision planes to the lab reference only. Green passages do not erase static geometry.
- Map Studio exposes measured alignment, reference overlay, bounded affine correction, landmark review, floor/height binding, explicit A/B assignment, issue focus and portable check receipts. Moving vertices restores Draft status; content edits invalidate cached checks; undo restores the prior check. A check receipt is a cache identity, never a release approval or security signature.
- The lab copies registered wall/spawn/site drawings through **Load Studio geometry**, validates zones and uses their clear representative points as endpoints. The copy is saved independently; career match generation is unchanged.

Primary files: `engine/spatial/registration.ts`, `annotations.ts`, `spatial-lab.worker.ts`, `lib/map-annotations.ts`, `lib/spatial-lab-project.ts`, `components/maps/MapValidationPanel.tsx`, `MapAnnotationEditor.tsx`, `SpatialLab.tsx`, and the registration/audit scripts.

## Reproduction and migration

Run `npx tsx scripts/launch/audit-mirage-annotations.ts` to regenerate the separate review copy and `tmp/l09` reports. The script asserts the original SHA before proceeding. `scripts/register-annotation-radars.py` measures the existing local image pairs using OpenCV; this run used isolated temporary OpenCV 5.0.0.93 / NumPy 2.5.3 dependencies, not a global Python change or new map download.

Annotation schema v2 and lab schema v1 retain optional new fields; older valid drafts load with their prior behavior. Invalid registration, incompatible reference identity and unsupported custom links fail parsing. Recovery retains unreadable drafts. Older application writers can drop the added optional fields, so export the current project before rollback and reopen that export after upgrading. The immutable original upload remains a separate recovery source. No career schema migration is required.

## Remaining acceptance

1. Review matching landmarks, each wall's bottom/top height, the CT boundary, exact plantable A/B ground and underpass/window/ladder transitions. Test the actual outer boundary at each relevant elevation rather than extending it through all floors.
2. Validate runtime multi-player spawn placement and exact plant triggers when the controlled encounter is integrated. Current representative samples do not implement either feature.
3. Review all release-map coverage rows and resolve L08 distribution rights. The current static source is approximate; a green sample report cannot certify full solid-volume collision.
4. Finish packaged UI/file-picker/recovery acceptance and L02 prerequisites. See the final verification record below for the checks actually executed.

Next implementation: finish L10's measured traversal and moving-teammate acceptance, then **L11 — perception, reaction and collision-tested shots**. Keep the Mirage manual review open in parallel.

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
