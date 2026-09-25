# Mirage v13 review

The uploaded v13 is preserved byte-for-byte at `public/map-studio/drafts/mirage-user-v13-2026-09-22.json` (SHA-256 `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`). All 142 original point arrays and all 116 utility records are unchanged in the repaired edition.

## Repairs and additions

- Restored CT spawn ground binding: -312 to -240. The uploaded 0–72 binding misses the sampled floor near -266.
- Bound T spawn ground: -180 to -145.
- Assigned B plant zone and bound ground: -174 to -140.
- Assigned A plant zone and bound ground: -190 to -145, excluding the raised -106 surface observed inside the drawn region.
- All four remain Draft: navigation samples establish available ground, not official spawn/plant trigger extents.
- Generated ten directional routes between both spawns and both sites, plus site-to-site rotations and reverse paths. Every route completed sampled body movement against the pinned collision mesh. These are navigation examples, not imported pro tactics; unbound red drawings do not participate in these checks.
- Added `public/map-studio/reviews/mirage-v13/review.html`: self-contained numbered map and per-mark issue checklist. W identifies walls; O identifies blue openings.
- Map Studio's saved-draft library now offers v13 and its repaired route edition. Existing local work is backed up through the existing import flow; it is not silently overwritten.

## Results

Raw upload: **28 errors / 37 warnings**. Repaired: **19 errors / 41 warnings**. The extra warnings expose actual edge/body clearance after the missing floors become testable.

| Area | Clear samples | Unsupported samples | Edge/obstruction samples | Separated spawn positions |
|---|---:|---:|---:|---:|
| CT spawn | 63 | 3 | 33 | 5 |
| T spawn | 91 | 2 | 26 | 5 |
| B plant zone | 56 | 20 | 14 | — |
| A plant zone | 42 | 9 | 15 | — |

These are grid samples, not percentages of the true area. Do not expand floor ranges to include crates merely to silence coverage errors.

Compared with v12, this upload removes all 18 green passage annotations and seven smoke records. These removals were preserved rather than undone. The collision reference still contains physical doorways; missing green labels do not themselves close those doors. Confirm whether the passage annotations were intentionally removed.

## Remaining work, in priority order

1. **15 wall markings have no height binding.** Long multi-region polylines may need splitting by floor/height, especially at overlapping levels. The pinned mesh supplies collision today; making every drawn wall infinitely tall would introduce incorrect barriers and shooting occlusion.
2. **Seven blue markings need intent and height.** O1 spans more than 7% of the radar along the eastern corridor; establish whether it represents a cover edge or several separate features. O4/O5 and O6/O7 are closely spaced pairs around B apartments; clarify whether each pair is intentional. Two blue marks intersect red segments in 2D. Blue does not cut openings out of red walls automatically.
3. **Four area boundaries need refinement.** Both spawns now fit five players and have sampled exits, but their borders include unsupported points. A/B polygons also include unsupported or obstructed points. Preserve legitimate planting space when checking against in-game plant boundaries; navigation alone cannot certify bomb-trigger extents.
4. **Review vertical connections:** Underpass to low Mid/B apartments, Ladder Room connections, Mid Window/vent, and raised Palace/B-apartment exits. Green walk-through, blue window, low cover, crouch, jump and drop are different behaviors. No new traversal link was invented from a flat image.
5. **Utility remains uncalibrated.** The 72 smoke, 20 flash and 24 fire records were preserved, not certified. There are no HE or decoy markings in this upload; that is optional content, not a broken map requirement.

For orientation, [Total CS's Mirage callout guide](https://totalcsgo.com/callouts/mirage) describes Underpass between B Apartments and low Mid, Ladder Room and the raised Palace balcony. It is used as a naming/topology reference only, not an authority for coordinates, heights, collision or plant boundaries. Measurements and route checks use the repository's hash-pinned reference version `2000908`.

## Artifacts and reproduction

- Original: `public/map-studio/drafts/mirage-user-v13-2026-09-22.json`
- Repaired, no extra routes: `public/map-studio/drafts/mirage-v13-repaired.json`
- Repaired + 10 routes: `public/map-studio/drafts/mirage-v13-with-reference-routes.json`
- Machine audit and individual route lab files: `public/map-studio/reviews/mirage-v13/`
- Re-run: `npx tsx scripts/launch/review-mirage-v13.ts` (verifies attachment, radar and mesh hashes).

This is an audited draft, not a claim of perfect or release-certified Mirage geometry. The production career engine remains unchanged.

## Verification

- 57 tests across map annotations, registration and library passed (`tmp/mirage-v13-tests.log`).
- Production build, lint/type validation, page generation and worker startup passed (`tmp/mirage-v13-build.log`); existing repository warnings remain.
- All ten generated routes completed sampled collision-tested movement. All original points and utility records were compared with the attachment and preserved.
- No browser click-through or live CS2 plant-trigger certification is claimed.
