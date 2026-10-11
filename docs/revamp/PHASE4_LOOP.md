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
| **4.5** Cuts (**approved 2026-10-11**) | FPL, staff meetings as a separate screen (→ Week plan), standalone Equipment (fold into Facilities), Map Studio in the player build (done: excluded from packaging), Academy simplified. | UI cuts ride with 4.2, engine-side FPL removal with 4.4. |

## Done when
- A passive season gives every club a regular fixture list; a new player reaches a meaningful decision within 3 clicks of Continue.
- Every number that changes in a week appears in the report with a cause.
- No screen promises an effect the engine doesn't apply (continue the truth rule from Phases 0–3).
