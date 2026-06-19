# Manual QA Runbook — Steam Launch Gates

> Executes the **manual BLOCKER gates** in `docs/STEAM_LAUNCH_GATE_CHECKLIST.md` that
> cannot be automated. Run on a **packaged Electron build** with the **Steam client
> running** and a **clean Steam profile** (reset achievement progress in Steamworks
> test config first). Record results in the tables; paste back into
> `docs/RELEASE_EVIDENCE_PACKET.md` for sign-off.

## Setup
1. Build the release binary (not `npm run dev`) so `isDevToolsEnabled` is false and the
   Steam bridge is live. Confirm dev-only controls are absent (Gate 3.3).
2. Launch through Steam so the overlay, achievements, cloud, and leaderboards are active.
3. Start from a brand-new save unless a step says otherwise.
4. Tester records: ✅ pass / ❌ fail / ⏭️ blocked, plus a note on any deviation.

---

## §A — Achievements: exactly-once + correctness (Gate 1.1–1.4)

**Pre-step (Gate 1.1, BLOCKER):** open Steamworks admin and confirm every ID in
`engine/steam-service.ts` `ACHIEVEMENTS` (31) and the 6 `lead_*` leaderboards exists with
the **exact** identifier and matching hidden flag. Mark mismatches as no-go.

**Method for each achievement:** trigger via legitimate play (dev tools may seed state on a
**non-production** build to fast-track, then confirm the unlock fires on the **production**
build). After each unlock: (a) one toast only, (b) Steam overlay shows it unlocked,
(c) **reload the save and replay the adjacent action — no second toast, no state change**
(idempotency, Gate 1.2), (d) repeat once with **Steam offline then online** (Gate 1.4 fallback
must never crash or block progression).

| ID | How to trigger | Unlock once | No dupe on reload | Offline→online OK |
|----|----------------|:-----------:|:-----------------:|:-----------------:|
| FIRST_WIN | Win 1 match | | | |
| WIN_10 / 25 / 50 / 100 / 250 / 500 | Reach each cumulative win count | | | |
| FIRST_TOURNAMENT | Enter a tournament | | | |
| WIN_B_TIER / WIN_A_TIER | Win a B / A-tier event | | | |
| WIN_MAJOR | Win a Major | | | |
| GRAND_SLAM (hidden) | Win all 3 Majors in one year | | | |
| DYNASTY | 3 Major wins across career | | | |
| PERFECT_TOURNAMENT | Win an event dropping 0 maps | | | |
| REACH_S_TIER | Reach S-Tier league | | | |
| TOP_10_RANKING | Enter top-10 world rank | | | |
| NUMBER_ONE | Reach #1 world rank | | | |
| COMEBACK_KING | Win after trailing ≤ 3-12 | | | |
| UNDERDOG | Beat a team ranked 20+ above | | | |
| FIRST_MILLION / BUDGET_10M | Budget hits $1M / $10M | | | |
| DEVELOP_STAR | Academy grad to 90+ skill | | | |
| HALL_OF_FAME_INDUCTION | Induct a player into HoF | | | |
| LOYAL_TEAM | Same 5 roster for 3+ years | | | |
| PROFIT_MASTER | Sell a player above buy price | | | |
| **ZERO_TO_HERO** | Start C-Tier → reach S-Tier (new org seeds C_TIER this branch) | | | |
| TOURNAMENT_WIN | Win any tournament (first) | | | |
| SEASON_COMPLETE | Finish a 52-week season | | | |
| FIRST_TRANSFER | Complete a transfer | | | |
| UNLUCKY (hidden) | Lose a Grand Final 14-16 OT | | | |
| REDEMPTION (hidden) | Win a Major the year after losing one | | | |

**Leaderboard spot-check (Gate 1.3):** confirm `lead_world_ranking`, `lead_major_wins`,
`lead_fastest_stier`, `lead_total_earnings`, `lead_win_streak`, `lead_tournaments_won` write
only on the intended milestone, and that **spamming Steam-writing UI actions** does not crash
or double-write (IPC throttle returns safe null/false).

---

## §B — Cloud-conflict matrix (Gate 2.2, BLOCKER)

Two machines (or one machine + manual cloud edits). Expected source per
`engine/save-manager.ts` (newer `updatedAt` wins; cloud overrides local only when newer by
**> 1000 ms**; invalid side never selected; both-invalid fails safe).

| # | Scenario | Expected selected source | Result |
|---|----------|--------------------------|--------|
| 1 | Local older, cloud newer (> 1s) | **Cloud** (local backup retained) | |
| 2 | Local newer, cloud older | **Local** | |
| 3 | Local valid, cloud corrupted | **Local** | |
| 4 | Local corrupted, cloud valid | **Cloud** | |
| 5 | Both corrupted | **Load fails safely** — deterministic error, no silent continue | |
| 6 | Local missing, cloud present | **Cloud** | |

Also (Gate 2.3): force a **cloud upload failure** — local save must still succeed; no crash on
cloud unavailability.

---

## §C — Refund-abuse adversarial sprint (Gate 3, BLOCKER, ~2h)

| Attack | Steps | Pass criteria | Result |
|--------|-------|---------------|--------|
| Infinite money loop | New save → rush first tournament + transfer market → repeat save/reload around payouts/rewards | No net-positive exploit reproducible | |
| Deterministic reroll | Save before a reward/match → reload repeatedly to fish for best outcome | Seed is committed; reload does not re-roll a better result | |
| Duplicate-trigger spam | Spam actions + route transitions around sponsor/transfer/facility/match-result | No duplicate money / roster move / phantom reward | |
| Alt+F4 transaction abuse | During transfer / sponsor / facility / match-result, force-close mid-commit, relaunch | Partial commit rolled back **or** completed exactly once; ledger/budget/roster/contracts consistent | |
| Save-edit | Edit a save file's payload without a valid integrity hash, load in production | Rejected (automated coverage exists; confirm on the real binary) | |

> Note: economy invariant #5 was hardened on this branch — scouting, all academy spend, and
> facility build/upgrade now write `FinanceLedgerEntry` rows. Confirm the finance ledger
> balances after the sprint (no unaccounted budget deltas).

---

## §D — Close / force-exit safety (Gate 2.5, BLOCKER)

1. Trigger a long week-processing tick.
2. Close mid-processing three ways: window-close, **Alt+F4**, and task-kill.
3. Relaunch each time → verify resume and **exactly one** week increment (no double progression).
4. Confirm close-intent attempts a save when safe and surfaces a clear error on failure.

---

## §E — Full-season playtest (Risk R1 — strongly recommended before ship)

Not in the formal gate, but the highest review-risk gap: play **one full 52-week season** and judge feel, not just correctness. Watch specifically:
- The new **C → B → A → S** climb reads as a progression (career-best "▲#" rank shows).
- **Derby** matches (HEATED/FIERCE) feel higher-stakes (morale swing + pre-match banner).
- The **finance ledger** now reflects academy / scouting / facility spend (books balance).
- Passive **training** actually develops the roster week to week.
- No dead weeks / soft-locks; the loop pulls you to the next decision.

---

## Sign-off
| Gate | Engineering | QA | Date |
|------|-------------|----|------|
| 1 Achievements | | | |
| 2 Save/Cloud | | | |
| 3 Refund-abuse | | | |
| 2.5 Close-safety | | | |
| **Go/No-Go** | | | |

Ship only if every BLOCKER row is ✅ and signed.
