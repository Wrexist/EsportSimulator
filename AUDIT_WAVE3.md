# AUDIT_WAVE3.md — Six deep audits (match sim, lifecycle, progression, income, paid-feature wiring, orphans)

> 2026-06-09. Six parallel subsystem audits; **every load-bearing claim re-verified against code
> before classification**. Status legend: ✅ FIXED (this wave, behind tests where node-testable),
> ❌ REJECTED (claim disproven — recorded so future audits don't resurrect it), 📋 OPEN (real,
> deliberately not auto-fixed: design decision or bigger refactor).

## The two headline P0s (both fixed ✅)

1. **Players never aged.** No code path incremented `player.age` (only a birthday *event* and a
   debug setter existed). Decline curves and the `age >= 33` retirement filter only ever caught the
   initial old cohort; 16-year-old prospects stayed 16 forever — no career arcs at all.
   → Annual increment for all non-retired players at season end (`atomic-week-processor`, season block).
2. **Facility upgrades never reached match day.** `upgradeFacility` mutates `team.facilities[].level`,
   but match strength read the legacy `team.facilitiesLevel` scalar — set once at init, mutated by
   nothing (grep: zero writers). Players paid for upgrades whose match bonus stayed at level 1.
   (Training/recovery/tactical processors DID read the array — partial wiring.)
   → `team-strength.ts` now derives from the facilities array (max level, legacy fallback). Tested.

## Fixed this wave ✅

| # | Finding | Where |
|---|---------|-------|
| 3 | Retired players could be signed/transferred (no `isRetired` guard) | `transfer-contract-slice.ts` + test |
| 4 | `renewContract` extended already-expired contracts | `transfer-contract-slice.ts` + test |
| 5 | Retirement left players occupying academy slots/roster | `event-processor.ts` retirePlayer |
| 6 | AI retirement skipped `recalculateTeamSynergy` (every other roster mutation recalcs) | `ai-manager.ts` processSeasonEnd |
| 7 | `updateTeamBudget` was the one unledgered budget mutation (weapon-training costs vanished from the books) | `team-settings-slice.ts` |
| 8 | Instant-sim played 3v5 with depleted rosters (week-tick path forfeits properly) — now refuses the player's own depleted match with a reason; can't softlock since advancing forfeits it | `match-simulation-slice.ts` |
| 9 | Fatigue/stat clamps missing lower bound at 4 mutation sites (one inconsistent with its own comment) | training-processor, team-drills ×2, player-development |
| 10 | Role-training capped stats at 99 while every other path allows 100 | `training-manager.ts` |
| 11 | `followers` unbounded → merch income explosion over long campaigns — capped at 2M (top of the in-game fan-milestone ladder) | `fanbase-growth.ts` |
| 12 | `merchHype` documented 0-100 but unenforced — clamped at the read site | `economy-engine.ts` |

## Rejected on verification ❌ (do not re-report)

- **"Zero free-agent replenishment / long-campaign death spiral"** — `ai-world-processor.ts` runs in
  the tick: weekly AI roster management incl. FA signings, AI↔AI transfers, season-end retirement
  **and youth-prospect intake** (`save.players.push(newProspect)`, facilities-gated). The agent
  missed the file.
- **"AI roster collapse from missing renewals"** — expiring AI contracts drop players to the FA pool
  and `signFreeAgent` (with emergency path) refills rosters weekly. Renewal-less churn is a balance
  quirk, not collapse.
- **"Aging only applied to rostered players"** — retracted by its own auditor; loop covers all.
- Match-sim core: economy clamps, OT/side-swap, veto, probability clamps [0.1,0.9], live-vs-instant
  parity — **all verified clean** (good news finding).
- Facility `monthlyCost` "never deducted" — retracted; weekly upkeep is charged.
- Board backing & league revenue share — capped/by-design, no farm.

## Open items EXECUTED (follow-up) ✅

The three decision-gated items are now done — none needed removal; all three became real:
- **activeMerchItems** — wired into fan income: each active line +4%, capped at 5 (+20%). Items
  are level-gated, so bounded/non-farmable. The UI's "diversify your catalog" claim is now true and
  shows the live bonus. Tested.
- **Dead settings — all three turned out wireable, not removed:**
  - *Resolution* was actually wired to Electron `setSize` via `applyWindowSettings()`, but the live
    `/settings` page never CALLED it on change (only the main-menu modal did) — now it does.
  - *Game Speed* now seeds live-match playback speed (normal=1×, fast=2×, very-fast=3×) — was inert.
  - *Notifications* now gates the chatty info/xp_gain toasts (meaningful types always show).
- **Sponsor cycling** — expiring a sponsor now stamps a 16-week re-sign cooldown per brand
  (`team.sponsorCooldowns`); signSponsor refuses within the window. Tested.

(Correction to the wave-3 list: "Resolution dead" was itself a mis-verification — it was wired in
`lib/settings-store`, which the agent didn't check. The real defect was the missing apply-on-change.)

## P2 cleanup tail — EXECUTED ✅

- **Orphans deleted** (verified zero importers, GameShell has its own autosave + keyboard handling):
  `components/ui/feedback-animations.tsx`, `components/ui/match-animations.tsx`,
  `hooks/useAutoSave.ts`, `hooks/useKeyboardShortcuts.ts`, `hooks/use-local-storage.ts` — 5 files, ~31KB.
- **Clutch stat** now counts real `CLUTCH` events from the round log (round-outcome.ts emits one per
  1vX win) instead of `rng.int(0,2)`. Tested.
- **Prize rounding** drift now folds into 1st place so the placed-field total is exact to the dollar
  (verified neutral for ≤8-team fields where the table sums to 1.0; existing tests unchanged). Tested-adjacent.

## Prize over-distribution — RESOLVED ✅

Fixed with field-size-aware tables, the way real events publish payouts: compact fields (≤8 placed)
keep the historical top-8 split (sums to 1.0 — zero economy change for most events); deep fields use
a new 16-place table modeled on real Major payouts (36/18/9/9/4×4/2×4/1×4 = exactly 1.0). A full
16-team field now pays exactly 100% of the pool (was 112%); every placed team is still paid. Tested:
$1M pool → $1,000,000 awarded to the dollar, champion $360k.

## ⚠️ (resolved above) Original finding — NEEDS A BALANCE DECISION

**`TROPHY_PRIZE_DISTRIBUTION` sums to 1.12, not 1.0.** Places 1-8 sum to exactly 100%, but 9-16 add
another 12% (`0.025×4 + 0.005×4`). A full **16-team field is paid 112% of the advertised prize pool** —
a real ~12% overpay, the opposite of the audit's "<1% underpay" claim. This is NOT auto-fixed: capping
the awarded total at the pool reduces large-event income ~11% for every team, an economy shift the
tuning was built around. **Decide:** (a) confirm 112% is intended for prestige events, (b) renormalize
the placed shares to ≤100%, or (c) fix the table so 1-16 sums to 1.0. `standings-processor.ts:34`.

## Open — still deferred 📋

| Priority | Item | Why deferred |
|----------|------|--------------|
| ✅ | ~~**`staff.specialization` is cosmetic**~~ — SHIPPED 2026-06-18: a bounded +10% "true specialist" multiplier (specialization aligned with role's core domain) now modulates each role's primary effect — coach→training (`training-processor`), analyst→tactical (`match-tactical-bonus`), psychologist→recovery (`processFatigueRecovery`), scout→scouting — via `engine/staff-specialization` + Specialist badge on `/staff`. Tested. | — |
| ✅ | ~~**scout `accuracy`/`scoutingSpeed` dead**~~ — SHIPPED 2026-06-18: `accuracy` now sets the scouting **report tier** (`scouting-mission-processor`; was a flat EXPERT) and `scoutingSpeed` shaves **mission duration** (`scouting-slice`). `scoutTierFromAccuracy` tested. (psychologist `mentalRecovery` was already wired via Phase 57; `stressResistance` remains the last unread staff stat.) | — |
| ❌ | ~~Match rating denominator uses series-total rounds, not per-player participation~~ | RE-VERIFIED 2026-06-18 as a **non-issue**: `generateMatchStats` iterates the fixed match rosters and the sim has **no mid-series substitutions**, so series-total rounds *equals* every player's participation. Nothing to change (the audit's "plausibly intentional" was right). |
| ✅ | ~~Sponsor-goal payouts: two processors with different ledger-id schemes~~ | DONE 2026-06-18: the duplicated payout+ledger+event block is now a single shared `paySponsorGoalBonus` helper both processors call (the two goal sets — weekly followers/morale vs per-match wins/maps — stay disjoint, ids correctly distinct, but the *scheme* can no longer drift). Tested. |
| P2 | Contract-expiry warnings only for the player team; AI roster churn is silent in the event log | Add neutral events if log noise is acceptable. |

## Systemic patterns (wave 3 confirms prior waves)

1. **Written-but-never-read state is this codebase's dominant bug class** — facilities scalar,
   merch items, specialization, three settings, two animation kits, three hooks. Grep for readers
   before building on any field.
2. **Clamp discipline is inconsistent** — standardize `Math.max(0, Math.min(100, …))` on every stat
   mutation; one-sided clamps keep appearing.
3. **The sim core is solid** — match engine, economy guards, integrity checker all came back clean.
   The rot concentrates at the *edges*: lifecycle transitions and purchase→effect wiring.
