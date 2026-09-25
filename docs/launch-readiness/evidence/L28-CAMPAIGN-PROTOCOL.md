# L28 balance campaign protocol

This campaign checks the existing management simulation. It is not Steam release acceptance or a validated full spatial 5v5 model. No owner saves are loaded. Baselines, failures, initial states and annual checkpoints are retained separately.

## Run matrix

- Small world: 30 seeds (28001–28030), two paired training policies, up to 520 real week ticks each. Three clubs; B/A/S tier, four custom-team difficulty multipliers, three opening-cash levels and youth/mixed/veteran managed-roster ages. These are stratified synthetic fixtures, not a full factorial experiment or actual custom-team onboarding.
- Underfunded full world: three seeds, two training policies. The 198-club snapshot's first club retains its payroll but receives fixture starting cash/difficulty settings. This deliberately stresses affordability; it cannot estimate default-career survival.
- Natural-finance full world: three seeds, two training policies; clubs at snapshot indices 0, 30 and 120 retain their existing finances, payroll and age mix. This is a targeted expansion, not the requested eventual 30-seed full-world sample.
- Tactical sweep: 30 common seeds × nine aggressive/structured/balanced pairings, equal clubs and mirrored player ability, alternating CT starts, Mirage BO1. This uses the existing aggregate engine. Intervals are descriptive and do not validate the unfinished spatial pipeline.

Each management pair starts with an identical canonical state/RNG hash. The only paired choice is tactics training intensity 1 versus 5. Human roster vacancies use the actual free-agent transfer action with cheapest affordable candidates; no bailout cash or replacement players are injected. Current-week player matches use the existing missed-match autosimulation on the next tick. Careers stop at bankruptcy; an ended career is not counted as ten seasons. Academy post-week UI coordination and live match decisions are not included.

## Measurements and invariants

Retain seed-level terminal week, matches, injuries, recruitments, shortages and season records. Annual measurements include cash distributions, insolvency, wages, sponsorship, fatigue, rating distribution, starting-player age/skill/retirement, transfers and tournament winners/prizes. A zero-match full year is flagged. Small worlds and full worlds must never be pooled into one survival or cash distribution.

Weekly invariants inspect duplicate player records, senior/academy ownership, missing or retired owned players, active-contract ownership, unpaid seniors, invalid wages, finite budgets, bounded core player stats and duplicate ledger IDs. Deep finite-number scans at annual boundaries/final states catch nested awards/history corruption. A failure stops that scenario and preserves the before/after state. Deep scans are not a weekly guarantee, and these invariants do not prove every money loop is absent.

Design targets before further tuning:

1. Zero structural/finite-state failures in the accepted campaign.
2. Every occupied senior slot has a real active contract; recruitment and retirement agree with future wages.
3. No fully simulated year without competitive activity. Investigate persistent shortages rather than silently granting players.
4. Both training policies have documented benefits and costs. Cash growth alone is not proof of an exploit; inspect recurring income and purchases and compare human decisions.
5. Difficulty should create a legible challenge. Set survival/runway targets with player feedback and representative clubs; the synthetic cash matrix cannot establish those targets.

No arbitrary tax, salary multiplier or win guarantee is introduced to fit the sampled curves. Rates should change only after diagnosing the cause and running common-input before/after comparisons.

## Reproduction

Use Node with the locked dependencies. Commands from the repository root:

```powershell
npx tsx --tsconfig tsconfig.test.json scripts/launch/l28-balance-campaign.ts --label=review --scale=small --seeds=30 --weeks=520
npx tsx --tsconfig tsconfig.test.json scripts/launch/l28-balance-campaign.ts --label=review --scale=world --seeds=3 --weeks=520
npx tsx --tsconfig tsconfig.test.json scripts/launch/l28-balance-campaign.ts --label=natural-review --scale=world --finance=snapshot --seeds=3 --weeks=520
npx tsx --tsconfig tsconfig.test.json scripts/launch/l28-tactical-pairs.ts
```

Restore the reviewed world template before reproducing full-world inputs; creating a new snapshot career can change creation-time metadata. Use a new label to retain existing results. Checkpoint JSON is gzip-compressed; explicit `NONFINITE:` strings in failure artifacts preserve values that ordinary JSON would replace with null. These diagnostic failures must not be imported as playable careers.

## Human playtests — all NOT_RUN

Recruit players across the four difficulty choices. Observe at least a first season and a mid/late-career session, including recruitment, a losing streak, sponsor expiry, staff/facility investment and roster replacement. Ask players to explain the wage/runway tradeoff and training consequences before showing the calculated outcome.

Record decisions, time spent, confusing feedback, dominant repeated actions, recovery options, bankruptcy causes and perceived counterplay. Compare against recorded distributions without instructing players toward a preferred strategy. No human sample is implied by automated seeds.
