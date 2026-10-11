# Phase 4 — Core loop v2

Goal: every click is a decision and every change has a visible cause. Fewer, deeper systems. Source: `docs/revamp/AUDIT_2026-10-09.md` §3d and the game-loop audit's v2 loop.

## Pillars
1. **Read and counter** — opponent intel feeds the game plan, which has a visible effect.
2. **Grow your people** — visible growth with causes.
3. **Climb the ladder** — a real season: regular matches, tiers, rivals, board objectives.

## A week in the life
1. **Briefing** (Home): board meter, next-opponent card, 1–2 decisions waiting.
2. **Week plan** (3 slots): practice focus, rest, scrim, media day, bootcamp — replaces drills/weekly focus/schedule bookings/staff meetings as separate places.
3. **Match day**: prep (lineup, veto, game plan) → key-moments live match or instant sim.
4. **Report**: every change with its cause, money net, board movement, one headline.

## Streams
| ID | What | Notes |
|---|---|---|
| **4.1** Advance & report | One **Continue** that runs days until something needs a decision (match day, event choice, expiring contract, transfer offer, injury, board meeting); a **weekly report** listing changes with causes (player attribute/form/morale deltas with the training/staff/event that caused them, money in/out by line, ranking/board movement, headline). | Week processor must record deltas with causes (additive, compact). |
| **4.2** Week plan hub | `/week` merges training focus, scrims, bootcamps, media, rest, staff meeting into a 3-slot weekly plan with honest previews; old routes redirect into it. Navigation hubs become Home · Squad · Week · Match · Recruitment · Competition · Club. | After 4.1 (shares advance flow). |
| **4.3** Inbox drawer | Replace the fake desktop OS (`/desktop`) with an inbox drawer in the shell: messages, decisions (event choices), offers; badge in the top bar; `/desktop` redirects. | Desktop "apps" already have real screens. |
| **4.4** Season & money | Guaranteed weekly regional league for every tier (passive clubs played only 6–49 matches/season), starting budgets and wages that create pressure, board objectives that matter, AI gear parity check; verified with `npm run campaign:long`. | After 4.1. |
| **4.6** AI economy (4.4 follow-up) | Money pressure is for the manager; AI clubs stay healthy: a budget (new recurring costs only within the weekly surplus), cost control while in deficit or debt (bench, then staff, a facility level, then an overpaid starter for a cheaper free agent or a minimum-wage trialist), a weekly sponsor look, renewals kept when cheaper than the market, administration that cuts the wage bill, and a hard five-player invariant (free agent within budget, academy, cheapest on credit, trialist) after expiry, retirements and sales. Evidence `phase4-6-ai-economy-{before,after}.json`. | `engine/ai/club-budget.ts`; `AI_ECONOMY_TUNING`. |
| **4.8** World ranking (4.6 follow-up) | Rankings stop swinging and tiers stop inflating: zero-sum Elo with K by match importance (friendly 0, league 8, qualifier/C 10, B 12, A 16, S 20, event playoffs ×1.25), damped margin of victory, provisional K for new clubs, 10% regression to the mean at season end; world rank = Elo order; league tiers = world-rank bands at season end (S 1–16, A 17–48, B 49–111, C 112+); the weekly report splits every rank change into own results (opponent, competition, Elo) and other clubs' results. Evidence `phase4-8-rankings-{before,after}.json`; offline tuning with `scripts/launch/ranking-replay.ts`. | `engine/world-ranking.ts`; `RANKING_TUNING`. |
| **4.9** Inbox noise (4.3 follow-up) | Every decision has a deadline (one week; two for squad decisions and the legend coach) and states its default ("If you don't answer by Week 9, the club …"); the tick applies it through the shared effect code and the weekly report lists it ("Unanswered: …"). A repeat refreshes the open request, a settled family cools down, situational requests wait while two decisions are open; Continue stops once per decision. Small notices fold into one rolling weekly round-up; other clubs' injuries and trophies and transfer rumours are news. Evidence `phase4-9-inbox-noise-{before,after}.json` (badge at week 13: 48–62 → 4–7). | `engine/decision-deadlines.ts`, `lib/inbox-digest.ts`, `scripts/launch/inbox-noise-audit.ts`. |
| **4.5** Cuts (**approved 2026-10-11**) | FPL, staff meetings as a separate screen (→ Week plan), standalone Equipment (fold into Facilities), Map Studio in the player build (done: excluded from packaging), Academy simplified. | UI cuts ride with 4.2, engine-side FPL removal with 4.4. |

## Done when
- A passive season gives every club a regular fixture list; a new player reaches a meaningful decision within 3 clicks of Continue.
- Every number that changes in a week appears in the report with a cause.
- No screen promises an effect the engine doesn't apply (continue the truth rule from Phases 0–3).
