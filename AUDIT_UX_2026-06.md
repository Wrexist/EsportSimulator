# AUDIT_UX_2026-06 — Player-experience audit (state, feel, progression, accomplishment)

> 2026-06-14. Six parallel deep audits + five loop sub-traces over the *player experience*
> (not engineering correctness — that's covered by `AUDIT_WAVE3/4.md` and `AUDIT_2026-06.md`).
> Focus, per owner ask: **flawless / clean / smooth · always something to do · feels
> progressive · accomplishment & achievement.** Every load-bearing claim re-verified against
> current code (this repo has a documented ~50% naive-finding rejection rate); file:line cited.
>
> Audits: core loop & engagement · progression spine · achievement/celebration ·
> UX flow/navigation/IA · onboarding/guidance · game feel/juice. Tags: **[FIX]** broken/dead ·
> **[ADD]** missing · **[IMPROVE]** exists-but-weak. Severity P0 (breaks the goal) / P1 (notably
> hurts) / P2 (polish).

## Implementation status (updated 2026-06-14)

Shipped on `claude/nice-babbage-uusrux` (each commit green: tsc 0 · jest · lint 0):

- **Wave 1 + A1 — Hub:** unified on `/` (land there, desktop reframed as Inbox, duplicate apps deep-link to canonical pages); Action Center surfaces decisions inline + Weekly Focus on the hub; result-screen "next match" CTA. → A1, A2, A3, B1, B3, B6.
- **Wave 2 — Feedback:** promotion/relegation + level-up toasts, championship-modal sound, live-match round sounds, TopBar count-up, dead result-screen counter removed. → D1, D2, D3, D4, F1, F2.
- **Wave 3 — Progression:** cross-save manager career profile; new-game unlock gate reads peak level (was hardcoded); Career Legacy tier ladder. → C1, C2, C3.
- **Wave 4 — Teach:** stat tooltips wired (Elo/potential/form/energy/board confidence), glossary grown to 13 topics, Getting Started checklist. → E1, E2, E3, E4.
- **Wave 5a — Verified fixes:** facility bonus (avg + correct scale), `tacticalPrep` weekly reset, role-training refund ledgered, veto dead-end, Pro Awards auto-open, prize count-up, dashboard money formatter. → C7, B13, G2, F5, D5, D10, F6.
- **Wave 5b — Depth/celebration:** career milestone toasts (firsts/totals/streaks), sponsor brand trade-offs, team OVR on dashboard, trophy-cabinet art, roster-swap toast. → D6, D7, D8, B7, C6, D9, F4.
- **B5 — Live-match agency:** Tactical Timeout (2/match) arms a bounded, determinism-neutral round-win boost for the player's next 2 rounds — a live-only edge over quick-sim. Behind a determinism harness + boost test. → B5.

**Still open:** B4/B12/C8/C9–C11 · D11/D12 · E5–E10 · F3/F7–F10 · G1 (passive-training pipeline decision) · G3.

## The five dominant themes

1. **The two-hub split is the #1 structural problem.** `/` (sidebar "Home", the dashboard with
   the CONTINUE button) and `/desktop` (a faux-OS with 9 "apps") ship **duplicate UIs** for
   Facilities/Finance/Academy/Market/News/Calendar, and the two surfaces expose *different*
   functionality. New-game drops the player on `/desktop`; the sidebar treats `/` as home. The
   **decision-surfacing UI — the events/mail inbox and the Weekly Focus selector — exists only on
   `/desktop`**, so the hub players actually sit on is read-only. Fixing this unlocks the loop,
   onboarding, and decision-surfacing problems at once.
2. **"Built but not wired" is the dominant defect class** (matches LEARNINGS). Fully-built systems
   mounted nowhere or fed dead inputs: the stat-tooltip/glossary layer, `economyStyle` tactical
   lever, the **passive weekly training pipeline (fed an empty Map → no team ever auto-trains)**,
   the in-game achievement set (buried in Settings), per-tournament trophy art, the help guide
   (only 4 topics), Weekly Focus (off the main hub).
3. **The weekly loop is skippable autopilot.** Nothing prompts a decision on a non-match week;
   the match itself is one-click-skippable (Quick-Sim keeps all prep bonuses) and near-watch-only
   when played; "management" layers are collect-or-set-and-forget; the result screen dead-ends
   instead of pulling you to the next match.
4. **Successes are silent.** Promotion, player/manager level-ups, round wins, and the
   tournament-win celebration modal all fire **no sound/toast**, despite the channels existing.
5. **The progression spine is short and broken at the top.** Manager career **resets every new
   game** and the team-unlock ladder is **hardcoded off**; everything caps by ~season 3 and
   **nothing accumulates visibly across seasons** (no dynasty/legacy track). Season 5 is season 1
   with bigger numbers.

---

## A. Structure / Information Architecture

| # | Tag | Sev | Finding | Where |
|---|-----|-----|---------|-------|
| A1 | FIX | P0 | **Two parallel hubs with duplicated features.** `/desktop` ships full apps for Facilities/Finance/Academy/Market/News/Calendar/Shop/Social; the sidebar independently routes to `/finances`, `/basecamp`, `/academy`, `/transfers`, `/schedule`. New-game lands on `/desktop`; sidebar home is `/`. Same data, two unrelated UIs. **Pick one canonical hub.** | `app/desktop/page.tsx:50-58,1001`, `Sidebar.tsx:49-99`, `new-game/create-team/page.tsx:276` |
| A2 | FIX | P0 | **Decision UI is siloed on `/desktop`.** The events/mail inbox (job offers, transfer offers, `resolveEventChoice` event choices) and the Weekly Focus selector are mounted only in `app/desktop/page.tsx`; the dashboard `app/page.tsx` has neither. A player living on `/` never sees offers/choices or makes the core weekly trade-off. | `app/desktop/page.tsx:388-428,1042`, `app/page.tsx` (no inbox/focus) |
| A3 | FIX | P1 | **Academy = 3 doors, 2 URLs.** Sidebar→`/academy`; Squad→`/desktop?app=academy`; desktop icon→in-window. Facilities likewise (`/basecamp` vs `/desktop?app=facilities`, linked from tactics). Unify each feature to one destination. | `app/academy/page.tsx`, `squad/page.tsx:422,472`, `tactics/page.tsx:490` |
| A4 | IMPROVE | P1 | **Team-infrastructure fragmented** across 3 UIs / 2 sidebar groups: Equipment (`/equipment`, "Team"), Facilities (`/basecamp`, "Recruitment"), and the duplicate desktop FacilitiesApp. Group together; collapse the duplicate. | `equipment/page.tsx`, `basecamp/page.tsx`, `desktop-apps/FacilitiesApp.tsx` |
| A5 | IMPROVE | P1 | **Sidebar grouping fights the mental model** — Facilities & Academy filed under "Recruitment"; Equipment under "Team". Re-group (Team: Squad/Training/Staff/Equipment/Facilities/Academy; Recruitment: Transfers/Scouting). | `Sidebar.tsx:58-99` |
| A6 | FIX | P2 | **`/settings/community-import` is an orphan** — built & functional, zero in-app links. Link it from Settings → Data. | `app/settings/community-import/page.tsx` |

## B. The weekly loop — "always something to do"

| # | Tag | Sev | Finding | Where |
|---|-----|-----|---------|-------|
| B1 | ADD | P1 | **No "what should I do next" panel** → non-match weeks are pure autopilot (the only advance-gate is an unplayed match). Add a contextual weekly to-do (set focus · N unread offers · contract expires in 2w · idle training slot · scout next opponent). **Single highest-leverage change.** | `app/page.tsx`, `game-store.ts:2068-2077` |
| B2 | ADD | P1 | **Off-season is structurally dead** — weeks 1–3 and 50–52 have zero active tournaments (40 events span weeks 4–49). Add off-season beats: roster review, pre-season bootcamp, board goal-setting, a transfer-window moment. | `data/tournaments.json` |
| B3 | IMPROVE | P1 | **Weekly Focus silently defaults.** It's reset to `null` each tick and falls back to training-only; not surfaced on the hub. Surface it on `/` and prompt each week (the activities are real trade-offs). | `WeeklyFocusWidget.tsx`, `game-store.ts:2127,2180`, `types/activities.ts:25-78` |
| B4 | IMPROVE | P1 | **Match prep is bypassable with ~zero penalty.** Quick-Sim (Zap) auto-vetoes and sims in one click while keeping all persistent prep (playstyle/antistrat/`tacticalPrep`). Give Quick-Sim a small differential, or make prep choices opponent-dependent so they aren't identical every week. | `app/page.tsx:413-426`, `tactics/page.tsx:808`, `match-simulation-slice.ts:530-640` |
| B5 | ADD | P1 | **Live match is watch-only** apart from a per-round buy preset that's auto-pilotable (Auto-Tactics) and largely budget-forced. Add 1–2 real live levers (timeout → morale/clutch buff, between-halves adjustment, force/save call). | `live/page.tsx:416-476`, `useLiveMatch.ts:1055` |
| B6 | ADD | P1 | **Result screen dead-ends** — only backward nav (Dashboard/Schedule/Tournament); no "play next match"/continue CTA, so the loop doesn't self-propel. | `match/[id]/result/page.tsx:322-346` |
| B7 | IMPROVE | P1 | **Business layer is click-to-collect, passive by season 2.** Sponsors are binary accept/decline then auto-expire; finances are display-only except linear merch upgrades. Add competing-offer / performance-clause sponsor choices and a finance lever (reinvest vs save). | `sponsorships/page.tsx:123-137`, `finances/page.tsx:782-798` |
| B8 | FIX | P2 | **Scrims are free** — `scheduleScrim` pushes a BO1 with no budget cost and **no ledger entry** (skips economy invariant #5). Zero-stakes filler. Add cost+fatigue trade-off and ledger it. | `match-scheduling-slice.ts:96-111` |
| B9 | IMPROVE | P2 | **Activity booking is discovery-hostile** — scrim/bootcamp/staff-meeting are reachable only by hovering an empty day on `/schedule`; never prompted. Add a "Plan this week" CTA + auto-suggest (e.g. Crisis Management after a 3-loss streak — the unlock already detects it). | `schedule/page.tsx:677-690`, `staff-meeting/page.tsx:53-131` |
| B10 | IMPROVE | P2 | **Training is set-and-forget** — per-player focus + drills persist silently; no nudge for idle slots / high-fatigue players. Surface in the weekly to-do (B1). | `training/page.tsx`, `player-development-slice.ts:153` |
| B11 | IMPROVE | P2 | **The week-reveal admits dead weeks** ("A quiet week" / "Nothing major to report"). Feed to-do/training/fan-growth outcomes into the reveal so match-less weeks still show progress. | `game-store.ts:2296-2310`, `WeekProcessingOverlay.tsx` |
| B12 | FIX | P2 | **`economyStyle` has no UI.** The lever is read by the sim but no control renders it on the tactics page — a built, engine-read tactical choice is unreachable. Surface or remove. | `tactics/page.tsx`, `match-simulation.ts:527-528` |
| B13 | FIX | P2 | **VOD review degenerates into a permanent buff.** `tacticalPrep` (+25/use, cap 100) **never resets**, so after ~4 reviews a player sits at +25% strength forever and the per-match decision dies. Reset/decay per match. | `match-operations-slice.ts:104-129`, `team-strength.ts:109-110` |

## C. Progression — does the player feel they're climbing?

| # | Tag | Sev | Finding | Where |
|---|-----|-----|---------|-------|
| C1 | FIX | P0 | **Team-unlock ladder is hardcoded off.** `const managerLevel = 1` — every `isTeamUnlocked` check evaluates at level 1, so rep≥40 (needs L5) and rep≥75 (needs L10) orgs never open via progression. *Verified.* | `new-game/page.tsx:107,159-160,564,623`, `manager-progression.ts:129` |
| C2 | ADD | P0 | **Manager career doesn't persist across campaigns** — every new game inits `level:1, xp:0`; nothing seeds from prior careers. The "grind from nobody to elite-courted" fantasy can't happen. Persist a cross-save profile (peak level/XP/trophies) to gate team selection + reward returners. *Verified.* | `game-store.ts:824-827` |
| C3 | ADD | P0 | **No long-horizon goal.** Everything caps by ~season 3 (manager L20, facilities 5, S-tier, board WIN tier, top sponsor). `CareerStats` (peakElo, totalSeasons, teamsManaged, totalTournamentWins) is computed but **never surfaced**. Add a visible multi-season Legacy/Dynasty track with named tiers (Contender→Dynasty→Era-Defining→GOAT). | `save-types.ts` CareerStats, `SeasonObjectives.tsx:74-107`, `board-expectations.ts:287` |
| C4 | IMPROVE | P1 | **31 achievements are invisible in-game.** Strong progressive ladder (FIRST_WIN→WIN_500, ZERO_TO_HERO, DYNASTY) fires Steam-only; no in-game tracker, no "next up" bars, and the list is buried in Settings with no nav entry. Mount an Achievements page + progress bars. | `steam-service.ts:15-58`, `settings/page.tsx:1114+`, `post-tick-achievements.ts` |
| C5 | IMPROVE | P1 | **Hall of Fame pays nothing.** Induction pushes to `save.hallOfFame` + an event but grants no org reputation/prestige/reward; building a legendary roster leaves no monument. Feed inductions into the C3 legacy score + a trophy-room banner. | `hall-of-fame-manager.ts:93-104` |
| C6 | IMPROVE | P1 | **No surfaced team-power number.** Team OVR is computed (save-card) but never shown day-to-day with a weekly delta, so team-building has no felt momentum. Surface "Team Rating 72→74" on dashboard/squad. | `career/page.tsx:508`, `team-strength.ts:31-134` |
| C7 | FIX | P1 | **Facilities bonus is half-strength and single-facility.** `facilitiesMod = 1 + level/100` (comment says +10%@L10) but `MAX_FACILITY_LEVEL=5` → real cap **+5%**, and it reads only the highest of the four facilities — maxing all four = maxing one. Rescale (`/50`) + sum/average across types. *Verified.* | `team-strength.ts:105`, `team-facilities-slice.ts:36` |
| C8 | IMPROVE | P1 | **Ladder reads as volatile sorting, not a climb.** World rank is a pure Elo re-sort every tick (#100→#45→#80 swings) and there are only 3 tiers (B/A/S) — a new team is one good season from the top. Add 1–2 lower tiers + a smoothed/peak displayed rank. | `league-engine.ts:278-291`, `atomic-week-processor.ts:320` |
| C9 | IMPROVE | P2 | **Manager leveling's reward is tiny** — +1 training slot per 5 levels (≈+4 over 20 levels); other gates thinly felt. Attach escalating perks (sponsor access, war-chest %, scouting missions). | `atomic-week-processor.ts:446` |
| C10 | IMPROVE | P2 | **Sponsor tiers aren't a felt ladder.** STANDARD/PREMIUM/ELITE gating exists but reads as background economy. Present as an explicit unlock track ("Top 30 → Premium sponsors"). | `team-facilities-slice.ts` sponsor logic |
| C11 | IMPROVE | P2 | **Legend/mentor events too rare** (2% / 0.5% per week) to be aspirational; rich legendary content barely contributes. Tie to milestones (S-tier → a legend offers to coach). | `legend-events-manager.ts:16-17` |

## D. Accomplishment & celebration

| # | Tag | Sev | Finding | Where |
|---|-----|-----|---------|-------|
| D1 | FIX | P0 | **Promotion is completely silent** — pushed as a generic MEDIA event, and the tick only routes TRAINING_COMPLETE/SPONSOR_OFFER to toasts. Climbing C→B→A→S is the core arc and it's a log line. Add a promotion celebration (reuse `TournamentWinCelebration`). | `league-engine.ts:411-424`, `game-store.ts:2213` |
| D2 | FIX | P0 | **The tournament-win modal plays no sound.** 5s confetti barrage, zero audio — the peak moment is silent. Play `victory`/a new `championship` cue on mount (sound-gated). | `TournamentWinCelebration.tsx:29-57` |
| D3 | FIX | P0 | **Player + manager level-ups are silent.** PLAYER_LEVEL_UP/MANAGER_LEVEL_UP events aren't in the toast allow-list, though the `level_up` toast type + SFX are fully wired. Route them. | `match-simulation-slice.ts:397`, `manager-progression.ts:105`, `game-store.ts:2213` |
| D4 | ADD | P0 | **Live-match round wins/losses are silent.** `roundWin`/`roundLose` sounds are authored but never called; only the final match plays audio. Highest juice-per-effort fix in the repo. | `useLiveMatch.ts:858-863`, `sound-manager.ts:183-190` |
| D5 | FIX | P1 | **Annual Pro Awards / POTY reveal is opt-in & missable** — renders as a clickable banner the player must notice; doesn't auto-open. Auto-open once on a new unacknowledged event (like `pendingSeasonRecap`). | `app/page.tsx:265-283`, `ProAwardsModal.tsx` |
| D6 | ADD | P1 | **No "first ever" celebrations** — first win/signing/trophy/MVP are treated like the 50th. Detect firsts and tailor copy/celebration. | `standings-processor.ts:305` |
| D7 | ADD | P1 | **No round-number milestones** (100th win, 1,000 kills, 100k followers). Add a post-tick milestone checker (dedup-guarded per replay-safety). | `post-tick-achievements.ts` |
| D8 | IMPROVE | P1 | **Win streaks / personal bests are computed for the Steam leaderboard but never shown in-app.** Surface active streak on the dashboard; toast milestones (3/5/10) + new bests. | `post-tick-achievements.ts:160-171` |
| D9 | IMPROVE | P2 | **Trophy Room is a list, not a cabinet** — generic glyphs instead of per-tournament `trophyPath` art; no "not yet won" ghost slots; thin empty state. | `trophies/page.tsx:268-271` |
| D10 | IMPROVE | P2 | **Prize money has no count-up** in the win modal (static `toLocaleString`). The most satisfying number to watch climb snaps. Add `AnimatedNumber` + cash SFX. | `TournamentWinCelebration.tsx:164` |
| D11 | IMPROVE | P2 | **Season-objective completion fires nothing** — no toast/sound when an objective is met or all four complete. | `SeasonObjectives.tsx:153` |
| D12 | ADD | P2 | **Marquee signings under-celebrated** — only `contractSign` SFX + a plain toast vs the legend-pick's golden confetti. Scale feedback to incoming player value. | `transfer-contract-slice.ts:463,517` |

## E. Onboarding, guidance & clarity

| # | Tag | Sev | Finding | Where |
|---|-----|-----|---------|-------|
| E1 | IMPROVE | P0 | **The stat-tooltip layer is built and used nowhere.** `StatTooltip/HelpTooltip/QuickStatTooltip/RarityTooltip` + `StatExplanations` have zero feature-file importers. The cheapest hover-to-learn mechanism, finished, dead. Wire onto stat labels. | `components/ui/stat-tooltip.tsx` |
| E2 | ADD | P0 | **6 of 10 core terms explained nowhere** — Elo/world rank, Potential, Fatigue/Energy, Form, Board Confidence, Runway (Circuit Points/Morale/Prestige partial; RMR absent). Add tooltips + glossary entries. | `rankings/page.tsx:146`, `player-detail.tsx:376-413`, `SeasonObjectives.tsx:137`, `FinanceApp.tsx:95` |
| E3 | ADD | P0 | **Help guide has only 4 topics** yet is the canonical reference. Expand to ~10–12 (ranking/Elo, circuit points & Major qualification, RMR, morale/form/fatigue, potential, board, runway, weekly focus) — pure content, structure already supports it. | `help-system.tsx:16-120` |
| E4 | ADD | P1 | **No persistent first-week checklist** — guidance is one dismissible mail + one dismissible 9-slide overlay, then nothing. Add a dashboard "Getting Started" card for weeks 1–2 (review roster · pick focus · check schedule · advance · first transfer), auto-checking. | `game-store.ts:1232-1249`, `TutorialOverlay.tsx` |
| E5 | IMPROVE | P1 | **Tutorial is a non-interactive text carousel** with UI-inaccurate copy ("taskbar"/"app icons on the left") and role-name drift (Lurker vs Support). Anchor to real UI (the unused `Tutorial` highlight component) or trim to ~5 + reconcile role names. | `TutorialOverlay.tsx:37-155`, `tutorial.tsx:140-146` |
| E6 | ADD | P1 | **Difficulty & team-select show bare numbers at the commitment moment** (Reputation 25, 1.0× Income) with no downstream-effect explanation. Add tooltips to the stat tiles. | `create-team/page.tsx:553-566`, `new-game/page.tsx:760-781` |
| E7 | ADD | P1 | **FPL is never explained** — shows rankings + promo/relegation zones but never says what it is or whether engagement is required. Add a "What is FPL?" intro card (mirror the Circuit Points explainer). | `app/fpl/page.tsx` |
| E8 | IMPROVE | P2 | **Empty states don't teach** ("No matches played yet" dead-ends). Make actionable ("…your first match appears once you're entered in a tournament → Tournaments"). | `PlayerMatchHistory.tsx:46`, others |
| E9 | IMPROVE | P2 | **Help "?" FAB is undiscoverable** (`bottom-24 right-6`, never pointed to). One-time pulse after tutorial + reference it in the final tutorial step / welcome mail. | `help-system.tsx:149` |
| E10 | IMPROVE | P2 | **Locked-team cards don't explain the lock inline** ("Reach Manager Level X to unlock"). | `new-game/page.tsx:637-649` |

## F. Game feel / juice / polish

| # | Tag | Sev | Finding | Where |
|---|-----|-----|---------|-------|
| F1 | FIX | P0 | **TopBar budget snaps with no count-up** — the most-visible number on every screen is plain text while dashboard/finances animate the same value. Swap to `AnimatedNumber`. | `TopBar.tsx:132` |
| F2 | FIX | P0 | **Duplicate inferior `AnimatedNumber` on the result screen** — a local `setInterval` version that always counts from 0 and has no reduced-motion guard, on a peak juice screen. Delete; import the shared rAF component. | `match/[id]/result/page.tsx:32-59` |
| F3 | IMPROVE | P1 | **Motion system barely adopted** (~72 inline `transition={{duration}}` vs ~37 token uses); some pages double-animate entry (transfers adds its own fade over GameShell's — explicitly forbidden by the shell comment). Strip duplicate wrappers; route through tokens. | `lib/motion.ts`, `transfers/page.tsx:171-178`, `GameShell.tsx:386` |
| F4 | ADD | P1 | **Roster swap completes silently** — a meaningful tactical action with no toast/sound (`addToast` is imported but unused here). Add confirmation. | `squad/page.tsx:216-222` |
| F5 | FIX | P1 | **Veto "match not found" is a dead-end** — bare text, no button/redirect (the result page handles this correctly). Add "Back to HQ". | `veto/page.tsx:347` |
| F6 | FIX | P1 | **Money formatting drifts 3 ways** — `toLocaleString` vs `$5k` vs `$X.XM` across TopBar/dashboard/scouting. One shared formatter (compact for headline stats, full for ledgers). | `TopBar.tsx:132`, `app/page.tsx:320-325`, `scouting/page.tsx:357` |
| F7 | FIX | P2 | **Can't-afford buttons look clickable** — red "Can't Afford" but still visually enabled, no `cursor-not-allowed`. Apply real `disabled`. | `staff-meeting/page.tsx:486-500` |
| F8 | FIX | P2 | **Veto buttons have no in-flight disabled state** — "Start Manual Veto"/"Quick Sim Veto" stay clickable while AI veto processes → re-entrancy. Disable + spinner. | `tactics/page.tsx:819-837` |
| F9 | IMPROVE | P2 | **Loading spinners inconsistent** (3 idioms; hand-rolled `animate-spin` divs). Consolidate on `components/ui/loading.tsx`. | `transfers/page.tsx:124`, `result/page.tsx:294`, `live/page.tsx:367` |
| F10 | IMPROVE | P2 | **Minor missed juice** — authored `hover` sound never used; finished-match CTA + strategy buttons could use entrance/scoped (`transition-colors`) animations. | `sound-manager.ts:108-120`, `live/page.tsx:447-451,586-595` |

## G. Economy / wiring gaps surfaced (smaller, but real)

| # | Tag | Sev | Finding | Where |
|---|-----|-----|---------|-------|
| G1 | INVESTIGATE | P1 | **The passive weekly training pipeline is dead.** `TrainingProcessor.processTraining` is fed `trainingFocus: new Map()` (never populated for any team), so it iterates zero teams: **no team gets automatic weekly skill growth**, and the per-player Training Focus dropdown (`player.trainingFocus`) is read but never reached. Either intended (manual-only growth) or a wiring regression — decide. | `game-store.ts:2118-2121`, `training-processor.ts:15,57-59` |
| G2 | FIX | P1 | **Role-training cancel refund is unledgered** — credits `team.budget` with no `FinanceLedgerEntry` (the weekly charge itself is correctly ledgered). Violates economy invariant #5. | `training-manager.ts:107-113` |
| G3 | IMPROVE | P2 | **Team-drill farm** — up to 10 guaranteed, zero-budget stat injections/week; only fatigue + the slot cap restrain it, and drill "simulation" outcome is cosmetic. Decide if 10 free full-`gains` drills/week is intended power. | `team-drills-slice.ts:54-149` |

---

## Recommended sequencing (payoff ÷ risk)

- **Wave 1 — Unify & surface (unlocks the most at once):** A1/A2 (one hub + bring the inbox & Weekly
  Focus onto it) → B1 (weekly to-do panel) → B6 ("next match" CTA). This is the structural keystone;
  most loop/onboarding findings ride on it.
- **Wave 2 — Make success land (cheap, high feel):** D1–D4 (promotion / win-modal sound / level-up
  toasts / round-win SFX) + F1/F2 (count-ups) — mostly routing into channels that already exist.
- **Wave 3 — Give the climb a top (the "progressive" ask):** C1/C2 (fix + persist manager career) →
  C3 (legacy/dynasty track on existing `CareerStats`) → C4 (in-game achievements page).
- **Wave 4 — Teach (clarity):** E1–E3 (wire the tooltip layer + expand the glossary) → E4 (first-week
  checklist).
- **Wave 5 — Loop depth & polish:** B3/B4/B5/B7/B12/B13, C5–C8, D5–D12, E5–E10, F3–F10, G1–G3.

## Verified-and-rejected (do not re-raise)
- "Notifications toggle is dead" — FALSE; gates low-priority toasts (`ui-slice.ts:77`).
- "Tournament View Full Details is a no-op" — FALSE; routes to `/tournaments/[id]`.
- Reduced-motion handling — solid (global CSS kill-switch + `MotionConfig reducedMotion="user"` + explicit guards). No gaps.
- Match error-boundary "Simulate instead", veto "Back to HQ" (tactics path), FacilitiesApp build button, help-system global mount — all already landed (prior waves); excluded.
