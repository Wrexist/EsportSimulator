# L21 — Match management and tactical decisions

Reviewed 3 October 2026 (branch `claude/match-agency`, based on `origin/claude/release-todo-sweep-2026-10-03` at `b837352e`). **Partial.** A1, A2 and A3 now have source-level evidence (paired engine runs and contract tests). No browser or packaged-Electron playthrough was performed in this pass, so the package stays open. Dependencies L14 (spatial engine, rehearsal-only), L16 and L19 are unchanged.

The production career engine is still `legacy-v2` (aggregate round model). Nothing under `engine/spatial/**` or `electron/**` was changed.

## 1. One canonical series runner (L14.A1/A3 for legacy-v2)

**Finding.** Live play re-implemented the round loop inside `hooks/useLiveMatch.ts`. The same seeded fixture therefore produced different results depending on whether it was watched, skipped or simulated instantly:

- Live had no playstyle counter, no stage-pressure penalty and no clutch momentum.
- Per-round staff were rebuilt without anti-strat talents.
- The knife-round side came from a different stream.
- Economy entries had no player IDs, so weapon-mastery bonuses were silently skipped.
- Recorded rounds had no `playerEconomy`.
- Map MVPs were copied from a discarded instant simulation.
- Statistics used a different RNG position.
- "Simulate match" used `pickAutoStrategy` on the home economy, which was also wrong when the manager was the away team.

**Fix.** The new `engine/match/legacy-series.ts` provides a pure step, `playLegacyRound`, over a serializable `SimState` and the recorded map results. `runLegacySeries` and `finalizeLegacySeries` sit on top of it. The following paths all drive that same step:

- `SimulationEngineV2.simulateMatch`, which is also used by the AI and tournament adapters
- the store's quick simulation
- live playback
- live skip
- resume

`engine/match/legacy-prepare.ts` is the single match-day preparation for both the store and the live screen. It clones the starters, applies talents and anti-strat, builds staff, resolves maps (saved veto, else an engine veto from the match seed) and computes strengths.

Rules made explicit (rules v2, still engine tag `legacy-v2`):

- Round RNG is `seed + mapIndex*1000 + round`.
- Sides come from the forced veto side, otherwise a seed/map hash.
- Rounds 1 and 13 are pistol rounds for both teams. Overtime defaults to FULL.
- Halftime, 12-12 and every MR3 overtime half swap sides, reset economy (overtime resets to $10k with default weapons) and clear streaks and momentum.
- After three tied overtime sets, the next decided round wins the map. This replaces the instant path's weighted coin flip and the live path's unlimited sets.
- Statistics use a dedicated stream (`seed + 7,777,777`).

**Live screen changes.**

- The live screen now only reveals what the step already computed at ROUND_END.
- A round-in-flight guard stops a queued pistol start, the auto timer or a click from playing two rounds off one decision.
- The radar and kill feed use the side the round was actually played on (`roundHomeIsCT`). The series score updates on playback, not on computation.
- "Simulate match" now makes no manager call, so a skipped match equals an instant one.
- The strategy panel and loadout editor show the managed team's own budget, side and roster. Previously they showed home-team data when you managed the away team.

**Checkpoints.** `SimState.rulesVersion = 2` and `lastRound` are persisted. If a pre-v2 checkpoint is restored while its ROUND_END was still pending, the deferred halftime/overtime/map transition is applied exactly once (`normalizeRestoredSim`). Restoring between rounds now always offers the next decision instead of stalling on a lost pistol-start timer.

**Rewards.** These are still committed only by `saveMatchResult`, which is guarded by the completed-match ID. `saveMatchResult` now keeps the engine's match-time `lineups` when they are valid; previously it overwrote them with the roster at commit time.

## 2. Paired-scenario proof (L21.A1)

**Method** (`scripts/launch/l21-paired-scenarios.ts`, output in [L21-paired-scenarios.json](L21-paired-scenarios.json) and [L21-paired-scenarios.txt](L21-paired-scenarios.txt)):

- Fixture: `first-week` 3921. The managed team's ratings are mirrored onto the opponent so the baseline is an even matchup. The opponent plays `balanced`.
- 200 identical seeds per comparison (20000–20199), BO1.
- Both arms use the career default loadouts. Exactly one decision differs between them.
- Effects are paired differences with a 95% CI (mean ± 1.96·sd/√n).
- **measurable**: the CI of the round share, or of the decision's own economy metric, excludes 0.
- **bounded**: |Δ match win| ≤ 30 pp and the variant neither always wins nor always loses.

Baseline match win: **49.5%**.

| Decision | Kind | Win % (base→variant) | Δ match win, pp [95% CI] | Δ round share, pp [95% CI] | Δ cash/round, $ [95% CI] | Verdict |
|---|---|---|---|---|---|---|
| Playstyle → structured (counters scouted balanced) | pre | 49.5→60.0 | +10.5 [6.2, 14.8] | +4.0 [2.8, 5.2] | +305 [198, 412] | bounded |
| Playstyle → aggressive (countered) | pre | 49.5→37.5 | −12.0 [−16.5, −7.5] | −5.1 [−6.5, −3.7] | −349 [−477, −220] | bounded |
| Economy plan → force | pre | 49.5→56.5 | +7.0 [2.7, 11.3] | +4.0 [2.4, 5.7] | +240 [89, 391] | bounded |
| Economy plan → eco | pre | 49.5→45.0 | −4.5 [−9.4, 0.4] | −1.8 [−3.6, −0.1] | +212 [56, 368] | bounded |
| Roles → IGL/entry/AWP/support/rifler | pre | 49.5→62.0 | +12.5 [7.9, 17.1] | +5.2 [3.9, 6.5] | +387 [267, 506] | bounded |
| Roles → five riflers (no AWPer) | pre | 49.5→43.0 | −6.5 [−9.9, −3.1] | −2.9 [−4.0, −1.8] | −198 [−291, −106] | bounded |
| Anti-strat target (opponent AWPer) | pre | 49.5→57.0 | +7.5 [3.6, 11.4] | +3.1 [2.1, 4.1] | +221 [132, 310] | bounded |
| VOD review (+25 tactical prep, $2,500) | pre | 49.5→59.5 | +10.0 [5.8, 14.2] | +3.5 [2.3, 4.6] | +275 [170, 379] | bounded |
| Mental reset (+15 morale, mental prep, $5,000) | pre | 49.5→60.5 | +11.0 [6.7, 15.3] | +4.3 [3.0, 5.5] | +317 [206, 427] | bounded |
| Loadouts → flash + smoke per player | pre | 49.5→61.5 | +12.0 [6.3, 17.6] | +5.8 [3.9, 7.7] | −244 [−405, −84] | bounded |
| Loadouts → four grenades per player | pre | 49.5→54.0 | +4.5 [−1.8, 10.8] | +2.9 [0.4, 5.4] | −1135 [−1362, −908] | bounded |
| Live call: FULL every non-pistol round | live | 49.5→64.0 | +14.5 [8.1, 20.9] | +9.3 [7.1, 11.5] | +602 [396, 808] | bounded |
| Live call: save after a lost pistol | live | 49.5→52.0 | +2.5 [−2.6, 7.6] | +1.7 [−0.1, 3.5] | +409 [256, 562] | bounded |
| Tactical timeout at a 3-loss streak (max 2) | live | 49.5→52.5 | +3.0 [0.6, 5.4] | +1.0 [0.5, 1.6] | +83 [35, 132] | bounded |
| Live call: ECO every round (negative control) | live | 49.5→0.0 | −49.5 [−56.5, −42.5] | −35.4 [−37.9, −32.8] | +5128 | negative control |

**Regroup round probe** (400 seeds, fixed state, five-loss streak): home wins go from 176 to 205. With no losing streak, 400 of 400 event streams are identical. A timeout is never a guaranteed round.

**Fixes made because of this proof:**

- **Decorative live levers.** On the live screen the playstyle counter, stage pressure and anti-strat talents did nothing (see section 1). They now apply on every path.
- **Hidden handicap from the default loadouts.** A planned AWP or rifle slot that could not afford its primary dropped to a pistol, so default loadouts cost the managed team 4.3 pp of round share. An unaffordable planned primary now falls back to the standard role buy, the same as an uncontrolled team (`EconomyManager.getPlayerBuyV2`). The remaining gap versus having no plan is −1.5 pp of round share; the default ECO plan keeps the USP where the AI would buy a P250.
- **Absurd utility effect.** Utility power was a raw sum. A four-grenade plan added about 23 equipment power and won 92.5% of even BO1s, and flash + smoke added 24.5 pp. Utility now saturates as `10·(1−e^(−raw/10))` (`UTIL_POWER_CAP`): flash + smoke ≈ 6.7 power, four grenades ≈ 9.0, a vest is 10. A modest plan now helps (+12 pp); overbuying mostly costs money.

**Balance concern for L28, not fixed here.** Buying every round is the strongest economy plan (+14.5 pp), and the force economy plan beats standard (+7 pp). Saving is under-rewarded by the equipment model, so "always buy" is close to a dominant strategy. That is a tuning question with a before/after distribution gate, not a wiring defect.

## 3. Map and lineup contracts (L21.A2)

[`__tests__/l21-map-lineup-contracts.test.ts`](../../../__tests__/l21-map-lineup-contracts.test.ts):

- **BO1, BO3 and BO5.** The veto order and forced starting sides (Sandstone CT forced for the away team, Ancient for home) are the same across: veto → live preparation → a run resumed from a JSON checkpoint mid-series → store quick-sim commit → completed-match history → canonical `SaveManager` save and load. Committed rounds equal the resumed live run round for round. Lineups are the match-time starters.
- **Back navigation and stale fixtures.** Re-vetoing is rejected while a match is active. A stale scheduled copy re-inserted after completion cannot be re-vetoed or re-committed.
- **Retired map.** A legacy saved veto containing retired Nuke is honoured identically by live and instant. Engine vetoes (no saved veto) only use the active pool, which includes Sandstone (40 seeds checked).
- **Map authority.** The live screen no longer reads `?maps=`. The persisted veto, or the checkpoint's recorded order, is the only map authority. A source contract test pins this, along with use of the shared stepper and the round-in-flight guard.

[`__tests__/l21-series-equivalence.test.ts`](../../../__tests__/l21-series-equivalence.test.ts):

- **Same result on every path.** For BO1, BO3 and BO5, instant, live stepping, skip, a run resumed after every round, a run resumed every 7 rounds and the engine facade all serialize to the identical result.
- **Recorded decisions replay exactly.** A live decision log (buy calls and timeouts, managed side home or away) replayed as a policy reproduces the live result and timeout state exactly.
- **Overtime.** Overtime series agree across instant, live and resumed paths, with correct side swaps.
- **Store and live agree.** The store quick-sim result equals the live path for the same fixture: maps, rounds with economy, scores, MVP, lineups and statistics.
- **Rewards commit once.** A second commit (a live finish after a quick sim, or a double click) changes nothing. XP, manager record and completed list are unchanged.
- **Pre-v2 checkpoints.** A pending halftime is normalised exactly once.

## 4. Result screen (L21.A3)

`lib/match-insights.ts` feeds a new "What decided the match" section on `app/match/[id]/result/page.tsx`. It uses the same panel and button styles as before and replaces the old follow-up block. It shows four things, all from data the result already records:

- **Headline:** rounds won, pistol rounds, rounds won on the weaker buy and rounds lost on the stronger buy.
- **Key rounds:** pistol rounds, runs of 4 or more rounds, buy upsets, rounds played under a regroup, overtime and map-deciding rounds.
- **Economy:** the managed team's buy win rates and average spend per player per round.
- **Players and plan:** best and struggling starter, the opponent's top performer (public scoreboard), and the team's own plan:
  - playstyle; the counter matchup is named only if the opponent was scouted by VOD review
  - economy plan and number of buy calls
  - preparation
  - timeouts and how many regroup rounds were won

What it does not use:

- the opponent's playstyle when it was not scouted
- any player ratings
- the opponent's cash

Every result now records `management` (own team only: style, economy plan, preparation, target, timeouts used, number of buy calls, live or instant). Each round records the public `buys` and the manager's call.

Next-action buttons link to:

- `/training`, when a starter rated below 0.90
- the next fixture's `/match/{id}/tactics`, or `/schedule`, when stronger buys were lost or full buys underperformed
- `/transfers`, when a starter rated below 0.80
- `/squad`, always

Each button carries its reason as a title and accessible label. Older results show "This report predates recorded match decisions."

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run lint` | 0 warnings, 0 errors |
| New tests | 39 (12 equivalence, 6 contracts, 21 paired/insights); existing L21 audit test still passes |
| Full `npx jest --silent` | **198/198 suites, 1,934/1,934 tests pass** ([L21-jest.json](L21-jest.json), [L21-jest.txt](L21-jest.txt)); pre-change baseline 195 suites / 1,895 tests |
| `npm run build` | pass; production worker starts without browser globals (`1357.553d7568b1dbbcba.js`) ([L21-build.txt](L21-build.txt)) |
| Regenerated `scripts/launch/l21-match-audit.ts` | [L21-match-audit.json](L21-match-audit.json) (result hashes changed with rules v2) |

## Save compatibility and rollback

- `MatchResult.management`, `RoundResult.buys`, `RoundResult.managerCall`, `SimState.rulesVersion` and `SimState.lastRound` are all optional. The canonical serializer passes them through, so no migration is needed.
- Completed results are never rewritten.
- In-flight checkpoints from older builds keep their recorded rounds. Their future rounds follow rules v2.
- AI-vs-AI and quick-sim outcome distributions changed slightly because of the side source, overtime rule, momentum resets, the utility cap and the loadout fallback. Instant results for an old seed will not match a pre-change build.
- Rollback: use a matching pre-change build with a separate recovery save.

## Remaining gaps

1. **No real UI acceptance in this pass.** Still to run in a browser or packaged Electron:
   - home/away BO1/3/5 with veto → tactics → live
   - pause, speed, round skip and match skip
   - a reload mid-round and at halftime/map boundaries
   - the new result section at 1024×640, 1280×720 and 1440×900

   The hook itself was not rendered in tests. Its equivalence rests on the shared stepper, plus a source contract and type checks.
2. The paired table uses one even BO1 fixture. Representative rosters, BO3/5, away-managed runs and stronger or weaker opponents remain for L28 calibration. Buying every round is currently near-dominant, which is the L28 item above.
3. The engine is still the aggregate legacy model. It does not model behaviour-driven tactics, utility coordination or spatial explanations (L14).
4. Based on `origin/claude/release-todo-sweep-2026-10-03` (`b837352e`). The local branch tip `23f464b3` additionally merges the accessibility pass and physical acceptance v13. The live and result pages may need a merge review against the L24 modal/focus changes.
