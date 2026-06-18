# TASK.md — Live state & priorities

> Update this file when state changes. Definition of done = closer to shipped on Steam.

## Status snapshot (2026-06-14)

- Branch: `claude/nice-babbage-uusrux` — UX/feel/progression program (`AUDIT_UX_2026-06.md`).
  Shipped Waves 1→5b (hub unification, feedback, cross-save progression, onboarding,
  verified fixes, milestones, sponsor depth, polish). Gates green throughout
  (tsc 0 · jest 1007 · lint 0); +24 regression tests.
- Open from that audit: minor polish (E5–E10, F3/F9–F10) and the **G1** passive-
  training-pipeline decision. (Re-verified in code 2026-06-18: **B5** live-match agency
  shipped — Tactical Timeout, 2/match, +6% bounded round boost + opponent-momentum
  neutralise, `useLiveMatch.ts` + `match-tactical-timeout.test.ts`; D11/D12/E7/B12/F8/E10
  also shipped.) See `AUDIT_UX_2026-06.md` "Implementation status".

## Status snapshot (2026-06-09)

- Branch: `claude/great-knuth-0Wbbf` — **9 commits ahead of main, pushed; PR open.**
- Quality gates: `tsc` 0 errors · `jest` 958 passed / 82 suites · `next lint` 0 errors.
- Working tree: clean.

## On the branch (awaiting review/merge)

1. `c0e80f3` Audit r1 — league completion (prizes/champions were never awarded), Swiss multi-BYE corruption, finance replay dedup, save-write serialization (+11 tests).
2. `0262b11` Audit r2 — softlocks, dead buttons, UI crashes, AI ranking drift (+3 tests).
3. `5b5c89c` Game feel — toast audio feedback, `<AnimatedNumber>` money count-ups.
4. `fed336d` Onboarding — fixed broken Replay Tutorial (dead flag), mounted the orphaned Help & Game Guide globally.
5. `9e64ba1` Bug tail — poaching-offer inbox pile-up, 12-week job-change cooldown (signing-bonus exploit), truthful RMR formats (+4 tests).
6. `da59f2b` Season Objectives dashboard panel (derived, adaptive goals).
7. `c138ef6` Board Expectations & Confidence — season reviews, confidence meter, on-notice warning, SACKED game-over, board-backing rewards (+12 tests).

## Priority queue

### P0 — Ship the branch
Open PR → review → merge. **Blocked on user's explicit go for PR creation.** After merge: manual verification pass (see P1 risks) on a real save.

### P1 — Manual verification debt (not covered by unit tests; jest is node-env only)
- [ ] Play a 52-week season in the browser: board review fires once, news posts, confidence moves, reward ledgered.
- [x] `boardState` survives the save-builder round-trip — `__tests__/save-snapshot-roundtrip.test.ts` (the *real IndexedDB* write is still browser-only, but the field-drop failure mode is now guarded).
- [ ] SACKED game-over overlay renders correctly (use DevTools to force confidence low + on-notice).
- [ ] Toast sounds: confirm sparse/not annoying in normal play; respect mute toggle.
- [ ] Help "?" button placement vs BugReportButton on small viewports.

### P2 — Verified-open engineering debt (deferred deliberately; see AUDIT_2026-06.md §2)
- [ ] **Determinism hardening** — mid-tick `lastRngSeed` re-seeding + cosmetic RNG draws (e.g. news engagement numbers) can shift sim outcomes between otherwise-identical runs. Invisible to players; highest-risk refactor in the codebase. Needs a dedicated seed-replay test harness FIRST (run same seed twice, assert identical save JSON), then split cosmetic vs sim RNG streams.
- [ ] Proper small-field Swiss (8-team) — currently relabeled honestly as `bracket` in `data/tournaments.json`. Only worth doing with pairing tests like `swiss-pairing.test.ts` extended to 8-team fields.

### P2.5 — UI/UX polish program
Six audits completed + verified → **`UI_POLISH_PLAN.md`** (phased: money-flow correctness → global
quick wins → semantic visual system → feedback → performance → 1024×640 layout → a11y → QA gate).
Phase 0 is correctness, not polish — do it regardless. Awaiting go.

### P2.6 — Audit wave 3 (see AUDIT_WAVE3.md)
12 verified findings FIXED (aging was entirely missing; facility upgrades never reached match
strength; retired-player signing; unledgered budget path; clamp sweep; fanbase cap). The three
decision-gated "top open" items have since ALL shipped (re-verified in code 2026-06-18):
activeMerchItems→fan income (`economy-engine.ts:150`), the three "dead" settings wired
(`settings-store.applyWindowSettings`, game-speed→playback, notifications→toast gate), and
sponsor re-sign cooldown (`team.sponsorCooldowns`). See AUDIT_WAVE3.md "Open items EXECUTED".
Genuinely remaining: just the AI-churn event-log taste call. (Match-rating denominator
RE-VERIFIED as a non-issue — no mid-series subs, so series-total rounds == per-player
participation; sponsor-goal payout consolidated into one shared `paySponsorGoalBonus` helper.
Both 2026-06-18.) (**Staff system depth** SHIPPED
2026-06-18: (1) `staff.specialization` now grants a bounded +10% "true specialist" multiplier on
each role's primary effect — coach→training, analyst→tactical, psychologist→recovery,
scout→scouting (`engine/staff-specialization`), with a Specialist badge on `/staff`; (2) the
genuinely-dead scout stats are now wired — `accuracy`→scouting report tier
(`scouting-mission-processor`, was a flat EXPERT) and `scoutingSpeed`→mission duration
(`scouting-slice`). Tested.)

### P3 — Depth roadmap (one feature per branch, smallest-first)
1. ~~**Board war-chest**~~ — SHIPPED: confidence gates the single-fee sanction (100%/80%/60%/40% of budget by confidence tier; on-notice = 40%). Enforced in transferPlayer, surfaced in NegotiationModal + dashboard board panel. Tested.
2. ~~**Mid-season board check-ins**~~ — SHIPPED: quarterly pulses (weeks 13/26/39) nudge confidence from recent form (+4/+1/-3/-6 by win rate, min 3 matches, never sacks — the sack stays season-end/telegraphed). Surfaced in news feed AND the week-reveal overlay. Tested.
3. ~~**Rivalries**~~ — SHIPPED (effects wired): tracked intensity now drives gameplay. A
   HEATED/FIERCE derby applies a deterministic stakes multiplier (×1.3 / ×1.6) to the
   post-match **morale** swing (`atomic-week-processor`, read pre-`updateRivalries`) and the
   **fanbase** swing (`processors/fanbase-growth`, still under the 2M cap → non-farmable), plus
   a pre-match **DerbyBanner** on the live page (HEATED/FIERCE only, with H2H record). Helpers
   `getRivalryBetween`/`isDerby`/`derbyMultiplier` in `history-tracker`. Tested
   (`rivalry-effects.test.ts` + derby cases in `fanbase-growth.test.ts`). *Confidence* swing
   deliberately deferred — the board-confidence system is quarterly/season-end by design
   (decisions log), so per-match nudges would fight it.
4. **Transfer negotiation depth** — counter-offers, agent personalities, holdouts.

### P4 — Steam release (manual, external)
`tasks/REMAINING_MANUAL_TASKS.md` — Steamworks achievement registration + icon generation, store assets. Code-side is done; `npm run release:verify` is the gate.

## Decisions log

- 2026-06: Sacking requires on-notice + bottomed confidence (always telegraphed one season ahead). New boards start at 60/100.
- 2026-06: Board rewards are upside-only and capped (≤$500k exceeded / ≤$250k met) to keep the economy non-farmable.
- 2026-06: 8-slot "swiss" events relabeled `bracket` rather than shipping an unvalidated Swiss path — honest data over silent misbehavior.
- 2026-06: Toast sounds only on meaningful types; `xp_gain`/`info` stay silent by design.
