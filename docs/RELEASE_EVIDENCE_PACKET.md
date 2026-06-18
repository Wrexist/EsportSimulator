# Release Evidence Packet — Steam Launch Gate

> Satisfies **Gate 4** of `docs/STEAM_LAUNCH_GATE_CHECKLIST.md` ("Release Evidence
> Packet — Must Exist Before Ship"). This captures the **automated** evidence and
> the **known-risk register**. The manual gates (achievement / cloud-conflict /
> refund matrices) are run via `docs/MANUAL_QA_RUNBOOK.md`; paste their results
> into the sign-off tables below before go/no-go.

- **Branch:** `claude/nice-babbage-uusrux`
- **Captured:** 2026-06-18
- **Build/version:** `esports-manager-sim@1.0.0`, `saveVersion` = `CURRENT_SAVE_VERSION`
- **Status:** ⚠️ **NO-GO** until the manual BLOCKER gates below are signed by Engineering + QA.

---

## Gate 0 — Baseline Build Integrity (automated) ✅

All five `release:verify` stages + the full test suite were run on this branch and pass.
Re-run with `npm run release:verify` and `npm run preflight` to reproduce.

| Check | Command | Result |
|-------|---------|--------|
| Merge markers | `npm run check:conflicts` | ✅ PASS — no unresolved markers |
| Type safety | `npm run type-check` | ✅ 0 errors |
| Hardening | `npm run release:hardening` | ✅ 4/4 (see below), ~53.6s |
| Steam compliance (strict) | `npm run compliance:steam:strict` | ✅ High 0 / Med 0 / Low 0 |
| Production build | `npm run build` | ✅ all routes compiled |
| Unit/integration tests | `npx jest` | ✅ 1060 passed / 97 suites |

### Hardening detail (`release:hardening`)
1. ✅ Save-tamper integrity — edited saves rejected.
2. ✅ Crash-resume exact-once — all step crashes resume without double-week progression.
3. ✅ 500-week simulation fuzz — completed (~32.2s), no corruption.
4. ✅ Static image integrity — 2002 image files validated (anti-contamination).

> Evidence note: outputs captured from local runs on the branch above. For the
> release ticket, attach the CI logs or terminal captures of each command.

---

## Achievements inventory (Gate 1.1 reference)

31 achievements defined in `engine/steam-service.ts` `ACHIEVEMENTS`. **BLOCKER:** every
ID below must exist in the Steamworks admin config with the **exact** identifier and a
matching hidden/visible flag — verify on the partner site (cannot be checked from the repo).

Idempotency (Gate 1.2): `SteamService` guards unlocks with an in-memory `Set`
(`unlockedAchievements`) keyed per active save (`setActiveSave`), so repeated triggers
(e.g. re-running `simulateInstantMatch` on the same result) do not re-fire side effects.

| ID | Hidden | Trigger (design intent) |
|----|--------|--------------------------|
| FIRST_WIN | no | First match win |
| WIN_10 / WIN_25 / WIN_50 / WIN_100 / WIN_250 / WIN_500 | no | Cumulative match wins |
| FIRST_TOURNAMENT | no | Enter first tournament |
| WIN_B_TIER / WIN_A_TIER | no | Win a B/A-tier tournament |
| WIN_MAJOR | no | Win a Major (S-tier) |
| GRAND_SLAM | **yes** | All 3 Majors in one year |
| DYNASTY | no | 3 Major wins across career |
| PERFECT_TOURNAMENT | no | Win a tournament dropping zero maps |
| REACH_S_TIER | no | Reach S-Tier league |
| TOP_10_RANKING | no | Break into top-10 world ranking |
| NUMBER_ONE | no | Reach #1 world ranking |
| COMEBACK_KING | no | Win after trailing ≤ 3-12 |
| UNDERDOG | no | Beat a team ranked 20+ above |
| FIRST_MILLION / BUDGET_10M | no | Budget reaches $1M / $10M |
| DEVELOP_STAR | no | Academy graduate to 90+ skill |
| HALL_OF_FAME_INDUCTION | no | A player inducted into the HoF |
| LOYAL_TEAM | no | Same 5 for 3+ years |
| PROFIT_MASTER | no | Sell a player above purchase price |
| ZERO_TO_HERO | no | Rise from **C-Tier → S-Tier** (now reachable — C_TIER wired this branch) |
| TOURNAMENT_WIN | no | Win any tournament (first time) |
| SEASON_COMPLETE | no | Complete a 52-week season |
| FIRST_TRANSFER | no | Complete first transfer |
| UNLUCKY | **yes** | Lose a Grand Final 14-16 in OT |
| REDEMPTION | **yes** | Win a Major the year after losing one |

Leaderboards (`engine/steam-service.ts`): `lead_world_ranking` (maxElo),
`lead_major_wins`, `lead_fastest_stier` (weeksToSTier), `lead_total_earnings`,
`lead_win_streak`, `lead_tournaments_won`. **BLOCKER:** these IDs must also exist in
Steamworks admin.

---

## Cloud-conflict policy (Gate 2.2 reference)

Implemented in `engine/save-manager.ts` (load path ~L454–L539). Policy as coded:
- **Local missing, cloud valid** → load cloud (L480–L483).
- **Both valid** → newer `updatedAt` wins; cloud only overrides local when it is newer
  by **> 1000 ms** (the documented 1s tie-break; otherwise local is kept) (L525–L539).
- **One side invalid** → the valid side is selected.
- **Both invalid** → load fails safely (no silent corrupted continue).

The 6-row matrix in the runbook must be executed against a real Steam Cloud to confirm
the runtime selection matches this policy for every row.

---

## Known-Risk Register (Gate 4 HIGH)

| # | Risk | Severity | Mitigation / status | Monitor post-launch |
|---|------|----------|---------------------|---------------------|
| R1 | **No full-season manual playtest** — sim is verified *correct* (1060 tests) but not *fun/balanced* end-to-end | HIGH | Run a full-season playthrough per runbook §E before ship | Steam reviews, refund rate, median session length |
| R2 | Steamworks achievement/leaderboard IDs not verified against admin config | BLOCKER | Manual 1:1 check on partner site (runbook §A pre-step) | Achievement unlock telemetry |
| R3 | Cloud-conflict matrix not run on real Steam Cloud | BLOCKER | Runbook §B (6 rows) | Cloud-conflict support tickets |
| R4 | Refund-abuse / Alt+F4 transaction abuse not run on packaged Electron build | BLOCKER | Runbook §C/§D | Anomalous fast-progression reports |
| R5 | `match-engine.ts` match object stamps `new Date()` (wall-clock) | LOW | Cosmetic metadata only; outcomes are seed-driven, zero replay/parity impact | n/a |
| R6 | `D_TIER` exists in `TEAM_TIER_MULTIPLIERS` but no team is ever D-tier (4-tier ladder ships S/A/B/C) | LOW | Dead config key, harmless; left as a future extension marker | n/a |
| R7 | Economy invariant #5 regressions | LOW (mitigated) | Scouting/academy/facility spend now ledgered this branch; covered by tests | Finance-ledger balance reports |

---

## Outstanding BLOCKERs before go/no-go (manual)

These cannot be satisfied from the repo and must be executed on a packaged build + Steam client:

- [ ] Gate 1.1 — Steamworks achievement/leaderboard ID parity (partner site).
- [ ] Gate 1.2/1.3 — Achievement unlock exactly-once on a clean Steam account, offline→online (runbook §A).
- [ ] Gate 2.2 — Cloud-conflict 6-row matrix (runbook §B).
- [ ] Gate 2.5 — Alt+F4 / force-close on the packaged build (runbook §D).
- [ ] Gate 3 — Refund-abuse adversarial sprint (runbook §C).
- [ ] Gate 4 — This packet + the filled runbook tables, signed by Engineering + QA.

## Go/No-Go
**NO-GO** until every BLOCKER above is checked and signed. Automated engineering gates are green;
the remaining work is manual QA on the Steam client + Steamworks-side verification.
