# Physical map acceptance — engine v13 campaign and v14 objective fixes

Physical matches remain rehearsal-only. No collision, floor-support, body-clearance or stance rule changed; no teleporting, floor snapping or forced outcomes were added. User drawings and the original Mirage drawing are untouched (`public/map-studio/drafts/mirage-user-v13-2026-09-22.json` SHA-256 `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`).

## Campaign

`scripts/launch/calibrate-map-pool.ts <Map> --acceptance --combat-only|--movement-only --trace-failures` runs, per active map:

- **Combat:** seeds 4326170, 4326171 (recorded) and 4326180, 4326181 (new) on both A and B, plus Mirage's recorded 4326174 A — 57 rounds.
- **No-gun:** one case per seed, alternating sites (4326170 A, 4326171 B, 4326180 A, 4326181 B) — 28 rounds.
- Same fixtures, round rules (115 s round, 40 s bomb, 3.2 s plant) and receipt format as the v9–v13 campaigns. Failures are kept as rows; traces of failing rows go to `tmp/`. `--case=<seed>:<A|B>:<combat|movement>` reruns one row.

Receipts: `docs/ui-review/map-pool/<map>-spatial-round-v13-acceptance-{combat,movement}.json` (baseline before the fixes) and `...-v14-acceptance-...` (after). `npx tsx scripts/launch/summarize-map-campaign.ts --acceptance` checks every v14 receipt against the current source and fixture hashes and writes `spatial-round-v14-acceptance-summary.json`.

Seed only feeds weapon spread, so no-gun rounds are seed-independent: the new-seed no-gun rows reproduce the recorded rows byte-for-byte (same `outputSha256`). This shows determinism; it is not extra coverage. The no-gun B-site rows (4326171/4326181) are new coverage; earlier campaigns only ran no-gun A.

| | v13 (baseline) | v14 (after fixes) |
|---|---|---|
| Rounds | 85 | 85 |
| Route failures | 0 | 0 |
| Combat rounds with blocked survivors | 0 | 0 |
| No-gun blocked survivors (rows) | 20 (10) | 16 (10) |
| Time-outs without a plant | 5: Overpass B combat 4326171; Overpass B no-gun ×2; Inferno B no-gun ×2 | 2: Inferno B no-gun ×2 |
| Minimum swept separation | ≥ 32.0004 | 32.000387 |

Engine source fingerprints (eight simulator files): v13 `a94a7f9aeccccfea66327881d16fe7d36781dc4b754a495bd30f772b621ab001`, v14 `ec609799584c0aabf880cf2f7687c8f79526147d2e4e53024a1380d2e3c0f47b`. The v14 campaign took 92 CPU-minutes over 85 rounds (longest single round 249 s, Vertigo A no-gun) with four processes in parallel on a shared host. This is correctness evidence, not a performance pass.

## Fixes (engine `spatial-round-v14`)

### 1. A plant in progress was abandoned by a site rotation (Overpass B, seed 4326171)

The trace showed carrier T2 starting the plant inside the B zone at 21.42 s. At 23.50 s, two delivered radio reports placed defenders within 600 units of B, and `chooseTeamPlan` rotated the T side to A. The planter condition requires the current plan's site, so `objective-interrupted` reset the plant 1.1 s before it would have finished. T2 then walked to A and died there at 54.2 s. Floor support, route planning and deadlines were not involved; the earlier v13 fix already gave zero route failures.

Fix: `DecisionEvidence.carrierOnSite` (a friendly-resource fact: the team's own carrier is alive, grounded and inside the planned plant zone). With the carrier committed, the T plan does not rotate. Contacts away from the site and every other rule are unchanged. Overpass B 4326171 combat now plants at 24.625 s and the bomb detonates at 64.625 s. Overpass B no-gun 4326171/4326181 now plant and defuse at 35.375 s with zero blocked survivors (v13: time-out with three blocked).

### 2. A bomb recovery could be held by a stationary teammate (same trace, 54.2–115 s)

After T2 died on the narrow Overpass A-long stairs, T1 stood on the stairs 38 units from the bomb. Its earlier rotate goal had retired as blocked. Recovery nomination runs before the per-player goal reset in each 16-tick block, so retired T1 was excluded and T5 was nominated. T5 was then held by T1's body. Its body-reserved replan found only a ~60 s loop around the map, and the bomb was never recovered.

Fix (two parts, no movement rule changed):
- A bomb drop changes the team objective, so it now clears `retiredGoal`/`failures` for living Ts (the same reset a plan change already does). Teammates whose old goals failed can be nominated.
- `recoveryHandoff` (`engine/spatial/recovery-support.ts`): if the nominated recoverer has been held for ≥ 32 ticks by a living, grounded teammate that stands closer to the bomb and has its own checked route there, that teammate takes over the pickup (`recovery-assigned` names both players). Distance to the bomb strictly decreases with each handoff, so recovery cannot oscillate.

Fix 1 alone changes the Overpass B outcome, because the bomb is planted before T2 dies. Fix 2 is a latent defect seen in the same trace. It did not fire in the 85 v14 rounds, so the evidence for it is the regression test, not a campaign row.

### Outcome changes v13 → v14

75 of 85 rows are byte-identical. The 10 changed rows are the T-side rotation decisions affected by fix 1:
- Overpass B combat (4 seeds): all now plant at 24.625 s and detonate at 64.625 s. Before the fix: one time-out, two T eliminations and one CT elimination. The four outputs still differ (shots 59–102), but the plant is completed before first contact on every seed. The CT side then saves rather than retaking. This is a balance observation, not a correctness failure.
- Overpass B no-gun (2): time-out → plant/defuse, 0 blocked.
- Inferno A no-gun (2): T detonation at 108.5 s → plant then CT defuse at 40.875 s; one T (T5) is left blocked by an opposing body (see limits).
- Ancient A combat 4326171/4326180: still T eliminations, at different times.

## Regression tests

`__tests__/spatial-objective-commit.test.ts` (4 tests; each failed on the v13 engine before the fix):
- policy: a carrier on site keeps the plan despite two defender reports; without it the existing rotate rule still fires;
- simulation: two reported defenders during a plant do not interrupt it (plant completes after exactly `plantSeconds`, no rotate, planter stays in range, separation ≥ 32);
- `recoveryHandoff` on the recorded Overpass positions, including refusals (no route, not closer, not a teammate);
- simulation: a teammate whose goal retired before the drop is nominated ahead of a farther teammate and picks up the bomb.

`__tests__/physical-career-loadouts.test.ts` now expects `spatial-round-v14` and checks that v13 recordings stay readable while pending v13 rehearsals cannot silently adopt v14 rules.

## Results (v14, with v13 outcome for the same row)

Duration is the simulated round length in seconds. "Plant / defuse" counts completed actions. Blocked survivors are living players whose final intent is `blocked`.

| Map | Site | Mode | Seed | Outcome | Plant / defuse | Blocked survivors | Route failures | Duration (s) | v13 outcome |
|---|---|---|---|---|---|---|---|---|---|
| Mirage | A | combat | 4326170 | T elimination | 1/0 | 0 | 0 | 75.03125 | T elimination (identical) |
| Mirage | A | combat | 4326171 | T elimination | 1/0 | 0 | 0 | 54.84375 | T elimination (identical) |
| Mirage | A | combat | 4326174 | T elimination | 1/0 | 0 | 0 | 70.390625 | T elimination (identical) |
| Mirage | A | combat | 4326180 | T elimination | 1/0 | 0 | 0 | 48.9375 | T elimination (identical) |
| Mirage | A | combat | 4326181 | T elimination | 0/0 | 0 | 0 | 47.140625 | T elimination (identical) |
| Mirage | B | combat | 4326170 | T detonation | 1/0 | 0 | 0 | 71.78125 | T detonation (identical) |
| Mirage | B | combat | 4326171 | T detonation | 1/0 | 0 | 0 | 73.53125 | T detonation (identical) |
| Mirage | B | combat | 4326180 | T detonation | 1/0 | 0 | 0 | 81.03125 | T detonation (identical) |
| Mirage | B | combat | 4326181 | T detonation | 1/0 | 0 | 0 | 76.53125 | T detonation (identical) |
| Mirage | A | no-gun | 4326170 | CT defuse | 1/1 | 0 | 0 | 57.25 | CT defuse (identical) |
| Mirage | A | no-gun | 4326180 | CT defuse | 1/1 | 0 | 0 | 57.25 | CT defuse (identical) |
| Mirage | B | no-gun | 4326171 | CT defuse | 1/1 | 0 | 0 | 60.5 | CT defuse (identical) |
| Mirage | B | no-gun | 4326181 | CT defuse | 1/1 | 0 | 0 | 60.5 | CT defuse (identical) |
| Inferno | A | combat | 4326170 | T elimination | 0/0 | 0 | 0 | 45 | T elimination (identical) |
| Inferno | A | combat | 4326171 | T elimination | 0/0 | 0 | 0 | 47.40625 | T elimination (identical) |
| Inferno | A | combat | 4326180 | CT elimination | 0/0 | 0 | 0 | 51.21875 | CT elimination (identical) |
| Inferno | A | combat | 4326181 | T elimination | 0/0 | 0 | 0 | 46.890625 | T elimination (identical) |
| Inferno | B | combat | 4326170 | T elimination | 1/0 | 0 | 0 | 51.375 | T elimination (identical) |
| Inferno | B | combat | 4326171 | T elimination | 0/0 | 0 | 0 | 43.421875 | T elimination (identical) |
| Inferno | B | combat | 4326180 | T elimination | 1/0 | 0 | 0 | 53.75 | T elimination (identical) |
| Inferno | B | combat | 4326181 | T elimination | 0/0 | 0 | 0 | 45.375 | T elimination (identical) |
| Inferno | A | no-gun | 4326170 | CT defuse | 1/1 | 1 (T5) | 0 | 40.875 | T detonation |
| Inferno | A | no-gun | 4326180 | CT defuse | 1/1 | 1 (T5) | 0 | 40.875 | T detonation |
| Inferno | B | no-gun | 4326171 | CT time, no plant | 0/0 | 1 (T2) | 0 | 115 | CT time, no plant (identical) |
| Inferno | B | no-gun | 4326181 | CT time, no plant | 0/0 | 1 (T2) | 0 | 115 | CT time, no plant (identical) |
| Overpass | A | combat | 4326170 | CT elimination | 0/0 | 0 | 0 | 64.046875 | CT elimination (identical) |
| Overpass | A | combat | 4326171 | CT elimination | 0/0 | 0 | 0 | 69.28125 | CT elimination (identical) |
| Overpass | A | combat | 4326180 | T elimination | 0/0 | 0 | 0 | 87.640625 | T elimination (identical) |
| Overpass | A | combat | 4326181 | T elimination | 0/0 | 0 | 0 | 84.703125 | T elimination (identical) |
| Overpass | B | combat | 4326170 | T detonation | 1/0 | 0 | 0 | 64.625 | T elimination |
| Overpass | B | combat | 4326171 | T detonation | 1/0 | 0 | 0 | 64.625 | CT time, no plant |
| Overpass | B | combat | 4326180 | T detonation | 1/0 | 0 | 0 | 64.625 | T elimination |
| Overpass | B | combat | 4326181 | T detonation | 1/0 | 0 | 0 | 64.625 | CT elimination |
| Overpass | A | no-gun | 4326170 | CT defuse | 1/1 | 0 | 0 | 76.203125 | CT defuse (identical) |
| Overpass | A | no-gun | 4326180 | CT defuse | 1/1 | 0 | 0 | 76.203125 | CT defuse (identical) |
| Overpass | B | no-gun | 4326171 | CT defuse | 1/1 | 0 | 0 | 35.375 | CT time, no plant |
| Overpass | B | no-gun | 4326181 | CT defuse | 1/1 | 0 | 0 | 35.375 | CT time, no plant |
| Vertigo | A | combat | 4326170 | T elimination | 0/0 | 0 | 0 | 41.640625 | T elimination (identical) |
| Vertigo | A | combat | 4326171 | T elimination | 0/0 | 0 | 0 | 51.875 | T elimination (identical) |
| Vertigo | A | combat | 4326180 | T elimination | 0/0 | 0 | 0 | 41.53125 | T elimination (identical) |
| Vertigo | A | combat | 4326181 | T elimination | 0/0 | 0 | 0 | 38.171875 | T elimination (identical) |
| Vertigo | B | combat | 4326170 | T elimination | 1/0 | 0 | 0 | 61.578125 | T elimination (identical) |
| Vertigo | B | combat | 4326171 | CT defuse | 1/1 | 0 | 0 | 77.765625 | CT defuse (identical) |
| Vertigo | B | combat | 4326180 | T elimination | 0/0 | 0 | 0 | 42.65625 | T elimination (identical) |
| Vertigo | B | combat | 4326181 | CT defuse | 1/1 | 0 | 0 | 77.90625 | CT defuse (identical) |
| Vertigo | A | no-gun | 4326170 | T detonation | 1/0 | 3 (CT2, CT4, T4) | 0 | 84.65625 | T detonation (identical) |
| Vertigo | A | no-gun | 4326180 | T detonation | 1/0 | 3 (CT2, CT4, T4) | 0 | 84.65625 | T detonation (identical) |
| Vertigo | B | no-gun | 4326171 | CT defuse | 1/1 | 0 | 0 | 57.203125 | CT defuse (identical) |
| Vertigo | B | no-gun | 4326181 | CT defuse | 1/1 | 0 | 0 | 57.203125 | CT defuse (identical) |
| Ancient | A | combat | 4326170 | T elimination | 0/0 | 0 | 0 | 43.3125 | T elimination (identical) |
| Ancient | A | combat | 4326171 | T elimination | 0/0 | 0 | 0 | 56.359375 | T elimination |
| Ancient | A | combat | 4326180 | T elimination | 0/0 | 0 | 0 | 59.234375 | T elimination |
| Ancient | A | combat | 4326181 | T elimination | 0/0 | 0 | 0 | 49.671875 | T elimination (identical) |
| Ancient | B | combat | 4326170 | CT elimination | 0/0 | 0 | 0 | 40.296875 | CT elimination (identical) |
| Ancient | B | combat | 4326171 | CT elimination | 0/0 | 0 | 0 | 40.1875 | CT elimination (identical) |
| Ancient | B | combat | 4326180 | CT elimination | 0/0 | 0 | 0 | 40.1875 | CT elimination (identical) |
| Ancient | B | combat | 4326181 | CT elimination | 0/0 | 0 | 0 | 40.953125 | CT elimination (identical) |
| Ancient | A | no-gun | 4326170 | CT defuse | 1/1 | 0 | 0 | 69.9375 | CT defuse (identical) |
| Ancient | A | no-gun | 4326180 | CT defuse | 1/1 | 0 | 0 | 69.9375 | CT defuse (identical) |
| Ancient | B | no-gun | 4326171 | T detonation | 1/0 | 2 (CT3, CT4) | 0 | 64.203125 | T detonation (identical) |
| Ancient | B | no-gun | 4326181 | T detonation | 1/0 | 2 (CT3, CT4) | 0 | 64.203125 | T detonation (identical) |
| Anubis | A | combat | 4326170 | T elimination | 1/0 | 0 | 0 | 62.8125 | T elimination (identical) |
| Anubis | A | combat | 4326171 | CT defuse | 1/1 | 0 | 0 | 85.4375 | CT defuse (identical) |
| Anubis | A | combat | 4326180 | T elimination | 1/0 | 0 | 0 | 63.46875 | T elimination (identical) |
| Anubis | A | combat | 4326181 | T elimination | 1/0 | 0 | 0 | 67.0625 | T elimination (identical) |
| Anubis | B | combat | 4326170 | T detonation | 1/0 | 0 | 0 | 63.421875 | T detonation (identical) |
| Anubis | B | combat | 4326171 | T elimination | 1/0 | 0 | 0 | 50.765625 | T elimination (identical) |
| Anubis | B | combat | 4326180 | CT defuse | 1/1 | 0 | 0 | 63.796875 | CT defuse (identical) |
| Anubis | B | combat | 4326181 | T detonation | 1/0 | 0 | 0 | 65.453125 | T detonation (identical) |
| Anubis | A | no-gun | 4326170 | CT defuse | 1/1 | 0 | 0 | 71 | CT defuse (identical) |
| Anubis | A | no-gun | 4326180 | CT defuse | 1/1 | 0 | 0 | 71 | CT defuse (identical) |
| Anubis | B | no-gun | 4326171 | CT defuse | 1/1 | 0 | 0 | 33.3125 | CT defuse (identical) |
| Anubis | B | no-gun | 4326181 | CT defuse | 1/1 | 0 | 0 | 33.3125 | CT defuse (identical) |
| Sandstone | A | combat | 4326170 | CT defuse | 1/1 | 0 | 0 | 91.78125 | CT defuse (identical) |
| Sandstone | A | combat | 4326171 | T elimination | 1/0 | 0 | 0 | 64 | T elimination (identical) |
| Sandstone | A | combat | 4326180 | CT defuse | 1/1 | 0 | 0 | 86.53125 | CT defuse (identical) |
| Sandstone | A | combat | 4326181 | T elimination | 1/0 | 0 | 0 | 64.34375 | T elimination (identical) |
| Sandstone | B | combat | 4326170 | T elimination | 0/0 | 0 | 0 | 58.53125 | T elimination (identical) |
| Sandstone | B | combat | 4326171 | T elimination | 0/0 | 0 | 0 | 60.03125 | T elimination (identical) |
| Sandstone | B | combat | 4326180 | T elimination | 1/0 | 0 | 0 | 92.015625 | T elimination (identical) |
| Sandstone | B | combat | 4326181 | T elimination | 1/0 | 0 | 0 | 72.859375 | T elimination (identical) |
| Sandstone | A | no-gun | 4326170 | CT defuse | 1/1 | 0 | 0 | 78.921875 | CT defuse (identical) |
| Sandstone | A | no-gun | 4326180 | CT defuse | 1/1 | 0 | 0 | 78.921875 | CT defuse (identical) |
| Sandstone | B | no-gun | 4326171 | CT defuse | 1/1 | 1 (T5) | 0 | 59.515625 | CT defuse (identical) |
| Sandstone | B | no-gun | 4326181 | CT defuse | 1/1 | 1 (T5) | 0 | 59.515625 | CT defuse (identical) |

## Remaining limits (honest)

- **All remaining blocked survivors (16, in 10 no-gun rows) are opposing-body stand-offs with gunfire disabled.** Every one ends `spacing-wait: Body <enemy> occupies the swept path`: Vertigo A (CT2, CT4, T4; the known three), Ancient B (CT3, CT4 held by post-plant T anchors), Sandstone B (T5 held by CT1), Inferno A (T5 held by CT1) and Inferno B (carrier T2 held by CT5 standing in the A doorway, so B no-gun still times out without a plant). Resolving these would require opponents to step aside for each other or a forced outcome. Neither is acceptable, so they are documented, not "fixed". With gunfire enabled, all 57 combat rounds end with zero blocked survivors and zero route failures.
- **Inferno B no-gun times out without a plant.** The T side rotates from B to A on two reports while the carrier is still ~640 units from B (not committed, so fix 1 correctly does not apply). In the A approach, the carrier is then held by an anchoring CT it cannot shoot. This is the stand-off class above, not a tactical bug.
- **Coverage is still bounded.** 4 seeds × 2 sites per map with gunfire, and no-gun only on seed-independent paths (effectively one A and one B case per map). Overtime, halftime, economy/buys, interrupted defuse under fire, smoke timing on real lineups and side-swapped full series are not covered by this campaign. Real-map BO3 evidence remains the v12 43-round Vertigo/Anubis series.
- Fix 2 (recovery handoff) has unit/simulation coverage but did not fire in these 85 real-map rounds.
- Overpass B with gunfire now ends in a T detonation on all four seeds (plant before first contact, CT save). Tactical balance is not assessed here.
- Performance: individual rounds took 10–249 s wall time on a loaded host. Real-time playback readiness is not established (E8).
