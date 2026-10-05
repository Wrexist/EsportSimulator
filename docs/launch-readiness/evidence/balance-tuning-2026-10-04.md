# Balance tuning — before/after (E4 long career, E5 match economy)

Branch `claude/balance-tuning`, engine commit `4efd1ff9`. The owner approved this tuning on 4 October 2026.

Data:

- **Before:** `long-career-2026-10-03.json` (label `final-3258d16a`).
- **After:** `balance-tuning-2026-10-04-campaign.json` (label `final-4efd1ff9`).
- **Side-by-side metrics:** [balance-tuning-2026-10-04.json](balance-tuning-2026-10-04.json), produced by `node scripts/launch/balance-compare.cjs <beforeDir> <afterDir>`.

Both campaigns were 30 seeds × 10 seasons (300 season snapshots, 15,600 week ticks). They used the same competent managed-club policy, through the real store coordinator. Seed n plays a top, mid or low club in turn.

How uncertainty is reported:

- Proportions use a Wilson 95% interval.
- Distributions are given as median [p10, p90] across season snapshots or careers.

No outcome is scripted. All new randomness is either the week RNG or a pure hash of (player id, week). Every save/load round trip (30/30) was identical.

## Rules changed

Every value is a named constant in `lib/balance-tuning.ts`, and every rule applies to all clubs.

| # | Finding | Change | Constants |
|---|---|---|---|
| 1 | Managed club dominated | **Idle-day recovery for every club.** It was managed-only and also gave +1 form / +2 morale per day. Now each idle day gives +15 energy and removes 20% of fatigue, with no form or morale bonus. | `CONDITION_TUNING.IDLE_DAY_*` |
| | | **Form follows results:** ±3 per match. | `FORM_PER_WIN/LOSS` |
| | | **Fatigue lowers the weekly form/morale drift target:** −0.3 form and −0.2 morale per fatigue point. | `FATIGUE_*_DRAG` |
| | | **Morale gains shrink near the cap**, scaled by (100−morale)/50. | `MORALE_GAIN_HEADROOM` |
| | | **AI renewals:** AI clubs renew their six most valuable players under 33, on the human Renew terms (+10% wage, +52 weeks, 26-week runway), and only when weekly net stays ≥ 0. Before, every AI contract simply expired. | `AI_SQUAD_TUNING.RENEW_*`, `RENEWAL_*` |
| | | **AI upgrades:** in transfer windows, every 4 weeks, an AI club signs a free agent who is at least 5 skill better than its weakest starter. The signing must be affordable and sustainable, and the player takes that starter's slot. | `UPGRADE_*`, `MAX_ROSTER` |
| | | **Parity bug fixed (found during tuning):** matches committed by the store (all managed matches) never granted the canonical RIFLE/AWP/PISTOL/SMG mastery XP that the engine reads. AI starters therefore carried up to +12 accuracy / +8 damage, about +10 equipment power each. | `store/slices/match-simulation-slice.ts` |
| 2 | Runaway money | **Sponsor base ranges by reputation band:** >80: $25–60k; >60: $12–32k; >40: $6–16k; otherwise $2–8k (was $50–200k at the top). | `SPONSOR_TUNING.BASE_RANGE_*` |
| | | **Tier multipliers:** PREMIUM ×1.5, ELITE ×2.2 (was 1.8 / 3.5). | `PREMIUM/ELITE_MULTIPLIER` |
| | | **Wage-bill cap:** one offer's effective income may be at most 34% of the wage bill. The wage bill used is floored at $20k + $1k × reputation. | `MAX_SHARE_OF_WAGE_BILL`, `WAGE_BILL_FLOOR(_PER_REP)` |
| 3 | Player supply and AI clubs below 5 | **Free-agent wage decay:** asks fall 2% per week unsigned, down to 40% of the original ask. | `FREE_AGENT_TUNING.WAGE_DECAY_*` |
| | | **Buyer tier:** the ask is multiplied by (0.6 + 0.4 × reputation/100). | `BUYER_REPUTATION_MIN_FACTOR` |
| | | **Long-unsigned retirement:** after 26 weeks unsigned, a free agent retires with a 1.5% weekly chance. The chance is doubled from age 28 and halved under 21. Legends and FPL amateurs are excluded. | `RETIRE_*` |
| | | **Quorum allowance:** a club below five players may sign an ask of up to $1,000 even when its cash flow is negative. | `QUORUM_WAGE_ALLOWANCE` |
| | | Youth intake and scouting are unchanged. Inflow and outflow are balanced instead (the earlier intake cap starved youth). | |
| 4 | Dead seasons without manual registration | **Automatic entry to open events:** every open qualifier, plus open main events for clubs outside the S-tier league. Entry is projected from the calendar, because instances do not exist yet when entry opens. It uses the Register button's guards: full squad, not already in the main event, one sibling qualifier. The club's own regional RMR is preferred. | `REGISTRATION_TUNING` |
| 5 | Hall of Fame inflation | **Two achievements are needed** from: 15 MVPs, 2,500 kills, 350 matches, or a 1.15 rating over ≥150 matches. A player also qualifies with 2 Majors alone, or a 1.20 rating over ≥150 matches. Before, two of 3 MVPs / 1,000 kills / 200 matches were enough, or 1 Major alone. | `HALL_OF_FAME_TUNING` |
| 6 | Full-buy every round | **Default buy thresholds:** FORCE from $2,200, SEMIBUY from $3,000, FULL from $3,700, i.e. rifle + helmet (was 2,000 / 3,200 / 4,500). | `ROUND_ECONOMY_TUNING.*_MIN_AVG_CASH` |
| | | **Loss-bonus ladder:** $1,400 + $500 per consecutive loss, capped at $3,400 (was 1,900 / 2,400 / 2,900 / 3,400). | `LOSS_BONUS_LADDER` |

Old saves need no migration:

- The only new save field is the optional `PlayerSaveData.freeAgentSinceWeek`. Its clock starts at the first tick after load.
- Sponsors that were signed before the update keep their old payout until they expire. The longest such deal runs 52 weeks.

## Before/after against the targets

| Target | Before | After | Verdict |
|---|---|---|---|
| **1a. World #1 at end of season 3:** a minority of careers | 28/30 (93%, CI 79–98%) | **8/30 (27%, CI 14–44%)** | Met |
| World #1 at season 1 / 5 / 10 (context) | 28 / 30 / 30 of 30 | 4 / 13 / 24 of 30 | See risk 1 |
| **1b. Managed share of S-tier titles, seasons 2–10:** median well under 50% | 0.67 [0.33, 0.67] | **0.17 [0, 0.67]** | Met |
| Managed win rate, seasons 2–10 (proposal: about 55–70% for a top club) | 1.00 [0.91, 1.00] | 0.84 [0.56, 0.98]; by tier, top 0.84, mid 0.88, low 0.78 | **Missed:** better, but above the band |
| Managed trophies per season | 21 [13, 21] | 10 [1, 20] | |
| Form gap and condition | Managed 100/100 vs AI 50/53 | Recovery parity. A fatigue cost now exists. | Met by construction |
| **2a. Healthy, finite income** | Sponsors $64.7M per season vs wages $7.5M; final cash $596M [$518M, $645M] | Sponsors $6.3M [$1.7M, $8.6M] per season; cash Δ $4.8M [$1.8M, $7.6M] per season; final cash $48.6M [$31.8M, $59.6M] | Met (about 12× less; still positive, see risk 2) |
| **2b. Bankruptcy reachable** | No failure state reachable | Bad policy (no sponsors, best free agents at any wage): 1 of 3 careers bankrupt at week 250. Competent policy: 0 of 30. | Met |
| **3a. AI clubs below 5 at a season end:** fewer than 1 per season end | Mean 1.53; median 1 [0, 4], max 10. 633 recorded episodes (capped at 25 per career) | Mean **2.15**; median 0 [0, 7], max 12. 486 episodes. Seasons 1–2 and 8–10 average ≤0.1; seasons 3–6 average 2.0 / 6.5 / 6.6 / 4.4 | **Missed:** see below |
| **3b. Active pool after 10 seasons:** within ±25% of start | 2.55× [2.51, 2.60]; 4,131 players | **1.24× [1.21, 1.27]**; 2,002 players | Met, at the edge. Rising from season 6 (1,481 at season 3 → 2,005 at season 10). |
| New vs retired per season | 268 vs 21 | 158 vs 113 | |
| Week tick (median per career) | 4.3 s | 1.9 s | Improved |
| **4. No dead seasons without manual registration** | Rank-70 club played 0–1 matches per season (manual note) | Passive policy (never presses Register), 3 careers × 3 seasons: 13–60 matches per season | Met |
| Competent-policy dead seasons (context) | 0/300 | 2/300 (season 1 of seed 12 and seed 19) | See risk 4 |
| **5. Hall of Fame:** 2–8 inductions per season | Season 10: median 32 [22–47] (counted from final saves) | Season 5: 2 [0, 3]; season 10: **6 [3.9, 10]**, max 12 | Met (median) |
| **6. Full-buy every round:** not near-dominant | +14.5 pp [8.1, 20.9] | **+1.5 pp [−2.0, 5.0]** | Met |
| Economy plan → force (L21) | +7.0 pp | +3.5 pp [0.3, 6.7] | |
| Economy plan → eco (L21) | −4.5 pp | −9.5 pp [−14.6, −4.4] | |
| Force after a lost pistol (new decision) | n/a | −3.5 pp [−7.0, 0.0]; −$235 cash per round | |

### L21 decisions

Baseline 51.0%; 200 paired seeds. Every non-control decision is still bounded and measurable, with one exception. `call-full-buy` is now near-neutral ("decorative", |Δ| < 6 pp). It still changes poor-round buys, but the gain in those rounds and the lost next full buy now cancel out.

The "save after a lost pistol round" scenario was replaced by "force after a lost pistol round", because the default now saves there. See `L21-paired-scenarios.txt`.

## The remaining `ai-roster-not-viable` failures

The invariant fires when an AI club stays below five senior players for more than six consecutive weeks. The campaign records at most 25 episodes per career; seed 1 has 17.

| | Mean AI clubs below 5 at a season end, seasons 1–10 | All seasons | Episodes |
|---|---|---|---|
| Before | 0.00 0.13 2.50 5.27 1.97 0.63 0.80 1.27 1.13 1.63 | 1.53 | 633 (many careers at the 25 cap) |
| After | 0.00 0.00 2.03 6.50 6.60 4.43 1.80 0.10 0.03 0.00 | 2.15 | 486 |

Seasons 7–10 are much better than before (0.0–1.8 vs 0.8–1.6), and the late-career pool no longer explodes. The cluster in seasons 3–6 has three causes:

1. **The snapshot's multi-year contracts expire in a wave.** AI clubs renew only players they can sustain.
2. **Sponsor income at AI clubs fell to the new reputation/wage-bill scale.** AI clubs below zero cash at a season end now average 11–16 in seasons 4–9 (before: 4–11).
3. **Indebted clubs could only refill at the quorum allowance.** That meant the cheapest free agents, and the free-agent pool is smallest exactly then: about 1,480 active players at seasons 3–4.

**Status: missed.** The median is 0, but the mean is 2.15 and the p90 is 7.

The likely next lever is softer AI sponsor scaling for low-wage clubs, or a renewal pass at season start. Testing it needs another 30×10 run (about 2.5 h on this machine) and was not done.

## Remaining balance risks

1. **The managed club still climbs over time.** It is world #1 in 13/30 careers at season 5 and 24/30 at season 10, and its win rate is 0.84. The remaining edges:
   - it is the only club that trains every week (AIM 5, up to potential);
   - it upgrades monthly with a cash reserve;
   - it plays every event it is eligible for.

   AI clubs only renew and upgrade in windows. Candidates for a follow-up: AI weekly training at the same default regimen, or slower training gains.
2. **Money is finite but still grows** by about $4.8M per season under the competent policy. Sponsors run at about 3× the managed wage bill, because free-agent asks decay and the managed club pays low wages.
3. **AI finances** in seasons 3–6 (see above). No AI club crossed the −$20M spiral bound.
4. **Two competent careers played 0 matches in season 1.** This is not investigated. Both were later seasons' contenders.
5. **The player pool rises again from season 6** (1.24× at season 10). It is inside the band, but extrapolating past 12–14 seasons would exceed it.
6. **The Hall of Fame count rises with career length:** 6 at season 10, max 12. Seasons beyond 10 may exceed 8.
7. **Old saves keep sponsor deals signed under the old scale** until those deals expire.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 warnings, 0 errors |
| `npx jest --silent` | 208/208 suites, 2,043/2,043 tests. Under campaign CPU load, `electron-navigation-guard` hit its 5 s timeout; it passes on an idle machine. |
| `npm run build` | Pass; the production worker starts without browser globals |
| New tests | `__tests__/balance-tuning.test.ts`: recovery parity, form/morale/fatigue, sponsor bounds, free-agent decay and retirement, AI renewal/upgrade/quorum, auto-entry, Hall of Fame, buy thresholds, loss ladder. `__tests__/l21-series-equivalence.test.ts`: store-commit mastery parity. |

## Pass 2 (5 October 2026): the missed targets

Branch `claude/balance-tuning-2`, merged on top of the sweep (`e802ab9f`). Engine commit `28eb71ee`.

The campaign was re-run at the same size (30 seeds × 10 seasons, label `p2-final-28eb71ee`). Results are in `balance-tuning-2026-10-04-pass2-campaign.json`; the pass-2 block of [balance-tuning-2026-10-04.json](balance-tuning-2026-10-04.json) has the side-by-side metrics. The orchestrator spawned seed 20, which exited with an empty log; the resumable run then re-ran it.

The L21 paired scenarios are unchanged (pass 2 did not touch match code): full-buy every round is +1.5 pp [−2.0, 5.0].

### Changes

All constants are in `lib/balance-tuning.ts` and apply to every club.

| Area | Change | Constants |
|---|---|---|
| Development parity | AI clubs train every week on the managed club's default regimen (AIM, intensity 5). They go through the same `TrainingProcessor`, so the same staff and facility modifiers, potential cap and training fatigue apply. | `AI_SQUAD_TUNING.TRAINING_FOCUS/INTENSITY` |
| Opening contract wave | Opening snapshot contracts end within ±26 weeks of their nominal length (seeded draw), with a minimum of 26 weeks. Before, every opening contract ended on a season boundary. | `INITIAL_CONTRACT_STAGGER_WEEKS`, `INITIAL_CONTRACT_MIN_WEEKS` |
| AI renewals | The renewal window opens 12 weeks before expiry (was 4). | `RENEW_WINDOW_WEEKS` |
| AI sponsors | AI clubs look at offers 25% of weeks (was 5%) and have 3 slots (was 2), matching the managed club's cap. | `SPONSOR_LOOK_CHANCE`, `MAX_SPONSORS` |
| Academy promotion | A club below five promotes its own academy prospect on a normal recruitment quote, under the quorum budget rule. | `promoteAcademyToQuorum` |
| AI academies | AI academies keep at most 3 prospects; prospects are released at age 20. Before, 685 players sat in AI academies by season 10, outside the market and its retirement. | `ACADEMY_MAX_PROSPECTS`, `ACADEMY_RELEASE_AGE` |
| Free-agent pool feedback | Pool size is compared with a target of 1 free agent per club. Retirement chance scales ×[0.25, 6], and an oversized pool shortens the retirement grace (minimum 8 weeks). AI scouting and season-end youth intake scale ×[0.15, 1]. Youth is never paused. | `POOL_TARGET_PER_CLUB`, `POOL_FACTOR_MIN/MAX`, `RETIRE_GRACE_MIN_WEEKS`, `SCOUTING_FACTOR_MIN` |
| Wage-decay floor | Long-unsigned asks now fall to 25% of the original ask (was 40%), so minimum-wage signings exist. | `WAGE_DECAY_FLOOR` |
| Season-1 "dead seasons" (seeds 12, 19) | **Not an engine bug.** Both managers changed jobs at week 52, and the season snapshot counted matches only for the new club. The campaign now attributes each match to the club managed that week. | `scripts/launch/long-career-campaign.ts` |

**Managed-only audit.** These remain managed-only, and all are paid or manual player decisions:

- weekly activity and bootcamps
- VOD review and mental reset
- talents
- scouting reports

Chemistry growth, fatigue and morale drift, idle-day recovery, result morale and form, and match mastery are all symmetric. The competent campaign policy now uses the real match-screen levers: VOD review plus the counter playstyle, and a mental reset only when squad morale is below 40, only above a $250k reserve, and only with a non-negative weekly net. The policy also:

- releases the weakest bench player while the club runs a weekly deficit;
- applies the AI affordability test to its upgrades (it previously used a stricter quarter-of-cash rule);
- avoids choices and sponsor brands that cost morale.

Pass 1 measured this policy before these levers were added, so the policy definitions differ. That is intended: the target describes a "competent" manager.

### Updated table (30 careers × 10 seasons)

| Target | Before tuning | Pass 1 | Pass 2 | Verdict |
|---|---|---|---|---|
| World #1 at end of season 3 (minority) | 28/30 | 8/30 | **3/30** (10%, CI 4–26%) | Met |
| World #1 at season 10 | 30/30 | 24/30 | **3/29** (10%, CI 4–26%) | Met |
| Managed S-tier title share, seasons 2–10 (median ≪ 50%) | 0.67 | 0.17 | **0 [p90 0.33, max 0.50]** | Met |
| Managed win rate, seasons 2–10 (median 0.55–0.70) | 1.00 | 0.84 | **0.634 [0.32, 0.83]** | Met |
| AI clubs below 5 at a season end (< 1) | mean 1.53 | mean 2.15 | **mean 0.00 (max 0) every season** | Met |
| `ai-roster-not-viable` episodes (> 6 weeks below five mid-season) | 633 | 486 | 170 | Improved, see below |
| Player pool after 10 seasons (±25%) | 2.55× | 1.24× | **1.17× [1.14, 1.20]**; still rising about 50 players per season in seasons 6–10 | Met |
| Finite income, failure reachable | $596M final cash | $49M | $28M [$6k, $37M]; cash Δ $2.3M per season. Competent policy: 3/30 bankrupt. Spendthrift: 1/3 bankrupt. | Met |
| Dead seasons (competent / passive) | 0 / 0–1 matches | 2 (metric artifact) / OK | 0 / 6–49 matches per season | Met |
| Hall of Fame (2–8 per season) | 32 at season 10 | 6 (max 12) | **season 10: median 4, max 8**; season-mean trend 1.0 → 3.4 over seasons 5–10 | Met |
| Full-buy every round | +14.5 pp | +1.5 pp | +1.5 pp (match code unchanged) | Met |
| Week tick (median) | 4.3 s | 1.9 s | 2.0 s | |

Season-end means in pass 2: AI clubs below five were 0.00 in every season (pass 1 had 2.0–6.6 in seasons 3–6).

**Remaining mid-season episodes.** The 170 `ai-roster-not-viable` episodes are clubs that fell below five during a season (a contract expiry or retirement outside a transfer window) and needed more than six weeks to refill. Every one of them was back to five by the season end. They average 5.7 per career; before tuning it was at least 21.

### Pass-2 risks

1. **Competent careers can now go bankrupt** (3/30). All three followed job changes into low-reputation clubs. That makes the failure state reachable, but some players may find the late-career economy harsh.
2. **The pool still drifts upward late**, about 50 players per season in seasons 6–10. Extrapolating, it would leave the ±25% band around season 13–14.
3. **Hall of Fame inductions rise with career length:** a season-10 mean of 3.4 and a maximum of 8. Seasons beyond 12 may exceed 8.
4. **AI skill now rises to potential everywhere.** The AI top-ten average goes from 63 to 84 over ten seasons, so the world is stronger late.
5. **The win-rate target is met with a policy that uses paid match prep.** Without prep, a managed club plays at about AI parity: 0.40–0.55 in pass-2 iterations 4 and 8.