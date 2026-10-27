# Anti-strat prep: club habits and counters (2026-10-27)

Roadmap R3, the third part of "coach the round".

## What it does

- **Habits.** Every club has a habit per map (`engine/match/habits.ts`, fixed per club and map): the site its Ts favour on a full buy and the site its CTs stack. Only an AI club playing the manager's team runs its habits, so AI-only matches play exactly as before.
  - Ts keep to their site on `HABIT_RATE_T` 0.65 of their full buys. The plan (execute, split and so on) stays the IGL's.
  - CTs stack their site on `HABIT_RATE_CT` 0.45 of their full buys.
  - The habit rolls use their own RNG stream (`habit`), so every other roll keeps its order.
- **Scouting.** The VOD review (match prep) now also shows the opponent's habits on each map of the match.
- **Counters.** After the VOD review, the manager can pick a counter per map and side (`ScheduledMatch.counters`). Each counter only applies on the manager's full buys:
  - CT: stack the site their Ts favour.
  - T: hit the site their CTs leave light. On those rounds this replaces the site of a playbook call.

  A counter is a guess: when they mix it up, you are on the wrong site.
- **Result screen.** For each counter, the "Your counters" card shows how many rounds it ran, how often they kept to the habit it plays against, and how many of those rounds you won.

## Measured (`scripts/audit-anti-strat.ts --maps 960`, paired BO1 maps, even 70-rated teams, HOME managed)

Seed 7, with the rates above:

| Arm | HOME round win % | HOME CT full-buy win % | HOME T full-buy win % | HOME map win % |
|---|---|---|---|---|
| Habits off (before R3) | 49.4 | 58.7 | 52.3 | 48.5 |
| Habits on, no counters | 50.0 | 59.1 | 53.0 | 50.4 |
| CT counter | 51.3 | 62.7 | 53.3 | 55.5 |
| T counter | 52.2 | 59.2 | 58.4 | 58.3 |
| Both counters | 53.3 | 62.8 | 58.4 | 62.5 |

What the table shows:

- Habits alone make the rival a little easier to beat, by about 0.6% of rounds. A predictable team gives a little away even when nobody counters it.
- The CT counter is worth about +4 per 100 of your CT full-buy rounds and about +5 map-win points.
- The T counter is worth about +5 per 100 of your T full-buy rounds and about +8 map-win points.

The tactics page shows these values (`COUNTER_EFFECT`).

The pre-match win chance does not include counters.

## Re-run

```
npx tsx scripts/audit-anti-strat.ts --maps 960 --seed 7
npx tsx scripts/audit-anti-strat.ts --maps 960 --set HABIT_RATE_CT=0.4 --set HABIT_RATE_T=0.6
```
