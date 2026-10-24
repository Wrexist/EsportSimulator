# Match trust fixes and win chance (2026-10-24)

Base: main 18577654 (build 26182647). Match balance and round outcomes are unchanged.

## 1. "Skip match" finished a different match

**Cause.** The live match is only written to the career save by the autosave timer, on close, and between days, never mid-match. After a reload the match screen went back to the last auto-save (or round 1 if there was none); "Skip match" then finished the series from that older point, not the one that was on screen. The two runs share seeds but not the rounds already played (timeouts, strategy calls, force buys), so the score differed (13-9 on screen vs 13-6 after skip).

**Fix.** The match screen now keeps a small separate checkpoint of the live series (`lib/live-checkpoint-store.ts`): written on every round change, every 3 s, and when the page is hidden or closed. On load the checkpoint is used only if it is for the same save, the match is still scheduled and unplayed, and it is newer than the save. The finished result is saved right away, then the checkpoint is removed.

**Check.** `__tests__/live-checkpoint-store.test.ts` plays 6 to 17 rounds on four seeds, sends the checkpoint through the store and a JSON round trip, restores it, then skips: every map score and round matches the run without the reload. In the game: Skip gave 13-8 twice from the same point; watching to the end also gave 13-8.

## 2. Reload restarted the match from round 1

Same cause and fix as above. In the game: closing the page at round 4 reopens at round 4 (paused, press Space to continue); before the fix it went back to round 2.

## 3. Win chance

Before: the match screen showed no win chance, only effect texts. Two of those were overstated on the current engine.

### Fitted curve

`engine/match/win-odds.ts`: logistic curve over the duel-rating gap (mean rifle aim + condition of each lineup, from the same profiles the rounds use) and the capped team-edge gap. Fitted on 5,902 simulated BO1 maps between the game's own clubs (60% close opponents, 40% any), checked on 4,424 other maps.

| Shown | Maps | Actual win rate |
|---|---|---|
| 20–30% (26.9) | 122 | 29.5% |
| 30–40% (36.0) | 776 | 35.7% |
| 40–50% (45.3) | 1,766 | 45.5% |
| 50–60% (54.2) | 1,353 | 53.4% |
| 60–70% (63.6) | 355 | 69.3% |
| 70–80% (72.7) | 52 | 71.2% |

Mean gap between shown and actual, weighted by maps: **0.9 points**. Brier 0.240 (coin flip 0.250), log loss 0.673 (coin flip 0.693). Most matches between clubs of similar level really are close, which is why the curve rarely leaves 30–70%.

### Effect texts, re-measured with paired runs (same seeds, one change)

| Text | Before | Measured | Now shown |
|---|---|---|---|
| Regroup after a timeout | +4% round-win chance | 36.3% → 39.2% over 6,601 rounds (+2.9) | about +3% |
| +1% team strength, rounds | +0.28% | +10% edge → +1.39% of rounds | +0.14% |
| +1% team strength, map wins | +0.85 points | +10% edge → +4.3 points | +0.43 points |

The old team-strength numbers were measured on the engine before the sight engine.

## Re-run

```
npx tsx scripts/odds/win-odds-calibration.ts generate --samples 1500 --seed 1 --shard 0 --of 4 --out tmp/odds/train-0.jsonl
npx tsx scripts/odds/win-odds-calibration.ts fit tmp/odds/train*.jsonl
npx tsx scripts/odds/win-odds-calibration.ts evaluate tmp/odds/check*.jsonl
npx tsx scripts/odds/win-odds-calibration.ts effects --samples 1200 --out tmp/odds/effects.json
```

Update `WIN_ODDS_FIT`, `WIN_ODDS_CHECK`, `REGROUP_ROUND_WIN_PTS` and `ROUND_SHARE_PER_EDGE` / `MAP_POINTS_PER_EDGE` whenever match tuning changes.

## Not covered

- The live checkpoint is a separate entry, not part of the save's integrity hash.
- A match restored mid-round can show the wrong side label until the round ends (seen before this change).
- Other parts of the honest-odds idea (opponent-relative ratings, board targets after promotion) are not in this change.
