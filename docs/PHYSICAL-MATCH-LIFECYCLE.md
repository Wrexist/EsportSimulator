# Physical match lifecycle — 2026-09-21

The saved physical rehearsal now runs a complete BO1/BO3/BO5 lifecycle. Normal careers still use `legacy-v2`; this work does not enable experimental career rewards or alter existing saves/drawings.

## Implemented

- A series starts at the first selected map with the actual ten career players, frozen combat attributes/roles, canonical map order and deterministic starting sides. It begins afresh; it does not splice an incomplete physical result into a running legacy match.
- Home/away buy choices use the existing purchase engine. The manager's custom loadouts apply only to their team. Purchases are charged once, use a stable round seed, retain surviving gear, and consume utility through the existing physical round settlement.
- Exact damaged armor is repaired for a vest purchase. A retained helmet is not charged again when the vest is exhausted. Unknown utility IDs cannot be obtained for zero cost. The shared buyer accepts the minimal identity/role input rather than requiring unrelated player fields.
- After round 12, sides swap, both economies reset to the existing $800 pistol start, and loss streaks clear. Score and player identity persist; identities bind to the new side's geometry slots.
- At 12–12, MR3 overtime starts with the existing $10,000 reset. Every three overtime rounds swaps sides and resets equipment/cash. Tied six-round sets advance the win threshold (16, 19, 22…). A clinching round ends the map before a side/reset transition.
- Maps advance explicitly, clear overtime and map-local receipts, and reset economy/score. The next round requires the next map's actual project/reference and five actor slots on each side; missing geometry is not substituted.
- Series stop as soon as the required map wins are reached. Final settlement records the winner, map scores, round receipts and physical player summaries, is idempotent after JSON reload, and remains `mode: preview`, `careerEligible: false`.
- Store transitions check career, session, revision, scheduled match, format, seed and map ownership again after asynchronous work. Pending rounds retain their exact purchased request for retries. Changed sides/rosters cannot accept a previously reserved result.

## Files

- `engine/spatial/match-lifecycle.ts`: pure purchase, side/reset, map and final-series transitions; request identity binding.
- `engine/spatial/career-round-journal.ts`: verifies the series binding when reserving and committing; advances only after verified round settlement.
- `engine/match/buy-phase.ts`: armor repair, retained-helmet cost, unknown-utility guard and minimal player input.
- `store/slices/physical-preview-slice.ts`: compare-and-swap series actions and scheduled-series ownership.
- `engine/save-schema.ts`: optional series validation, preserving older single-round journals.
- `components/maps/CareerRoundRehearsal.tsx`: buy choices, current map/score/side/overtime, continue-map and settle-series controls.
- `__tests__/physical-match-lifecycle.test.ts` and `__tests__/physical-career-loadouts.test.ts`: lifecycle boundaries, real physical resolution, save recovery and ownership regressions.

## Verification

- Full suite: **181 suites / 1,712 tests passed**, `tmp/physical-lifecycle-full-tests.log`.
- Final focused run, including an additional complete physical 5v5 BO1: **29 tests passed**, `tmp/physical-lifecycle-tests.log`. This BO1 goes through real purchases, reservation, physical simulation, sealed replay verification and settlement for every round. Each iteration reloads JSON state. It verifies unique round hashes, halftime identities and final idempotency. The floor and uneven skill levels are controlled test fixtures, not balance evidence.
- Boundary tests cover repeated overtime, an overtime clinch on a reset boundary, BO1/BO3/BO5 early finishes, split BO3 decider, fresh-map resets, retained equipment, armor repairs, and denied duplicate/cross-career purchases.
- Type-check: passed, `tmp/physical-lifecycle-types.log`.
- Production build: passed, including lint/type checks, page generation and production week-worker startup; existing repository warnings remain (`tmp/physical-lifecycle-build.log`). No reported warnings in the changed runtime modules.
- Actual bundled geometry worker: passed deterministic repeated-request/hash checks (`tmp/physical-lifecycle-worker.log`); isolated two-player worker fixture, separate from the complete 5v5 lifecycle test.
- Rebuilt local production server: http://localhost:3370. Spatial Lab, Map Studio and main menu return HTTP 200 (`tmp/physical-lifecycle-http.json`). This is not a visual/click-through acceptance test.

## How to use it

1. Open a saved career match at a buy-phase decision, then open Spatial Lab on that series' first map with five actor slots per side.
2. Open **Career series rehearsal** and start it. Regulation half starts automatically use pistol purchases. Later rounds use the selected home/away buy choices.
3. Reopen the same career/map after interruption and retry the saved request. An older single-round rehearsal can still be viewed; clear it to start the new series flow.
4. When a map ends, continue to the next map and load that map's authored setup. At the series finish, use **Settle rehearsal series**.

## Remaining acceptance / next step

The lifecycle is implemented and covered by deterministic tests. Live browser click-through, full-match radar presentation, production `MatchResult`/reward activation, real-map balance and Windows/Steam acceptance are not established by these tests. No Steam build was uploaded in this step.

Next development step: connect and validate the full physical lifecycle in the live match UI, including radar replay/resume and a gated production result adapter. Keep normal careers on the existing engine until geometry, calibration and career reward parity pass.

Owner task: finish the flagged Mirage wall heights, openings, spawn and bombsite geometry, then export the latest Map Studio JSON. Other maps can wait. Original drawings and portraits remain unchanged.
