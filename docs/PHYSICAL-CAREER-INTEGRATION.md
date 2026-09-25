# Physical career integration — 21 September 2026

## Delivered

**Follow-up:** [Physical combat v2](PHYSICAL-COMBAT-V2.md) adds purchased loadouts, attributes, objective polygons and a worker-driven settlement preview. The evidence and development list below describe the earlier v1 milestone; consult the follow-up for current scope and remaining gates.

`engine/spatial/career-round-adapter.ts` is the first read-only adapter between a sealed physical round and career-shaped round results. It verifies replay integrity, snapshots its inputs, requires explicit unique player/team bindings, handles halftime side assignments, maps damage/deaths/kills/objective events and preserves TIME as a timeout outcome. It rejects unresolved rounds, map mismatches and invalid identities. Its output explicitly has `careerEligible: false`; it grants no money or XP and does not write to saves. Spatial Lab can export this adapter check using clearly named lab identities.

Physical navigation corrections:

- Failed partial movement tracks are discarded instead of being executed and then remaining silently exhausted. The existing three-attempt retry limit now works for that failure mode, and diagnostics preserve the actual movement rejection reason.
- Support players ahead of their entry player can yield to clear supported space beside the route. The old behavior held them directly in front of their own attack. Clearance, body separation and visibility checks remain in force. No teleportation or movement through bodies was introduced.
- The new support-yield regression failed before the fix and passes afterward. Other tests cover failed-track retries, player identity conversion, side swaps, tampered/unresolved replays and timeout conversion.

Map Studio now checks whether a spawn contains five separated, supported player positions and displays the count. Old validation receipts are invalidated when parsed under the stricter model; drawings and raw project files are preserved. A stale receipt is not silently upgraded to a pass.

## Mirage evidence

Source: `public/map-studio/drafts/mirage-user-v12-2026-09-13.json`, SHA-256 `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2`. This is the latest supplied v12 file on disk, not an inspection of potentially newer browser-local edits.

Read-only revalidation found 20 errors and 87 warnings:

- 17 walls lack physical height bindings; zero authored walls currently contribute additional collision. The static reference mesh still supplies its own collision.
- 25 openings lack descriptions and height bindings, including overlapping blue/green marks and crossings requiring review.
- CT spawn has 18 sampled points outside the bound floor range; A has 22 and B has 25. Refine those polygons or their intended floor ranges.
- Both spawns nevertheless contain at least five clear, separated positions. That is capacity evidence, not confirmation that every polygon vertex is correct.

Artifacts under `docs/ui-review/physical-career/`:

- `YOUR-NEXT-STEPS.md`: issue-by-issue author checklist with marking labels, indices and IDs.
- `map-review.json`: complete diagnostic output, source hash and unchanged marking identities.
- `mirage-5v5-review.lab.json`: separate full-team lab fixture using sampled clear positions, provisional opening assignments and short lab timers.
- `5v5-before-yield.json`: blocked opening baseline, 0 shots and 0 damage.
- `5v5-integration-check.json`: after the support fix, 300 shots, 100 health removed, 170 delivered reports and minimum body separation 32.04035 units. One player dies and the CT side wins by the 45-second lab timeout. The adapter preserves this as TIME.

The new run reaches combat, but 300 shots for one elimination and failure to plant are reasons to continue calibration. This is not evidence of production-quality tactics, weapon accuracy or map certification. Runtime measurements from these checks were taken alongside tests/builds and are not controlled performance benchmarks.

## Verification

- Full Jest: **178 suites / 1,680 tests passed**, `tmp/physical-career-full-tests.log`.
- TypeScript: passed without diagnostics, `tmp/physical-career-types.log`.
- Two identical Mirage runs produced replay SHA-256 `273155c8d96fe69369c0e6124f32ccb9662e92225328c6f1ed176905270ae796` (875 events, 361 frames). This verifies repeatability for this seed and fixture, not all scenarios.
- Production build passed, including type/lint checks, page generation and production worker startup. Existing warnings remain (`tmp/physical-career-build.log`).
- Chrome dedicated-tab creation timed out again. No fresh visual/click-through verification or real-browser resume-to-results completion is claimed.
- No career state, source drawings, portraits or Steam build were overwritten.

## Exact division of remaining work

### Map author

1. Open `/map-editor` and your latest Mirage project. If you have newer unsent edits, export that newer JSON instead of replacing it with v12.
2. Click **Validate map geometry**, then **Overlay reference radar**. Compare spawn/site corners and mid alignment.
3. Use each issue's **Show marking** button. Review CT spawn and A/B plant boundaries; choose the intended surface with **Bind ground height** where appropriate. Do not widen a floor range to include an unintended raised surface merely to reduce errors.
4. Review the 17 red walls and 25 green/blue openings. Name the location, choose Window / Low cover / Jump correctly and describe walking, crouching, jumping and shooting in Notes. Use **Set height range manually** only when the world heights are known; otherwise leave it Draft and describe the intended floor/obstacle so we can finish the binding from the reference.
5. Mark only reviewed items Checked. Save project and send the exported JSON. Focus on Mirage before other maps.
6. While automated browser control is unavailable, use a separate test career to start a match, reload partway through, resume and finish to the results screen. Report a stuck round, duplicate score/reward or screenshot of any layout problem. Do not overwrite a valued career for testing.

### Development

Purchased weapons, armor and helmet behavior, defuse kits, individual player attributes, plant polygons, authored traversal links, full round timers, utility loadout accounting, worker ownership and exactly-once career settlement still need integration. Continue from the verified adapter; do not flip career `engineVersion` to the lab engine prematurely. Preserve old replay/save readers. Then calibrate multiple seeds and side swaps, complete UI recovery tests and perform packaged Windows/Steam installation testing and release content reconciliation.

## Reproduce

```powershell
npx tsx scripts/launch/review-physical-career.ts
# Optional: pass a newer exported map-project JSON as the argument above.
npx tsx scripts/launch/check-physical-career.ts
npm test -- --runInBand
npm run type-check
npm run build
```

The physical smoke-check script targets the generated Mirage fixture. The review script reads its input and writes separate diagnostic artifacts; it does not edit the supplied drawing.
