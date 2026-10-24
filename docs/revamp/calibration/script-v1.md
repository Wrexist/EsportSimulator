# Engine calibration — script-v1

Run 2026-10-24 · harness v2 · seed 20261010 · 6,100 BO1 maps through the production series paths (managed + AI) · 147.2 s.

Reproduce: `npx tsx scripts/calibrate-engine.ts --engine script-v1 --samples 600 --seed 20261010 --json docs/revamp/calibration/script-v1.json --md docs/revamp/calibration/script-v1.md`

Targets and bands: `engine/match/calibration/targets.ts`. Reference values are approximate
(audit 2026-10-09 benchmarks where available, otherwise estimates or design intent — see Source).
Agency rows are paired map-win deltas in points (±95% CI) against an even 70 v 70 baseline;
they must be non-zero, point the expected way and stay bounded.

Sample: realism 600 maps (equal teams, managed/AI alternating); skill 200 seeds per gap, each on both paths; star 200 maps; agency 300 paired seeds per decision; cap 300 paired seeds per path.

**Summary:** 47 pass · 3 warn · 0 fail

**Outside the pass band:**

- warn: `ace_per_map` 0.33, `agency_timeout` 0.0 ±1.6, `agency_buy_force_r2` +1.0 ±3.6

## Score shape (equal teams, BO1)

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Avg rounds per map `rounds_per_map` | 21.40 | 21–22 (pass 20.5–23) | PASS | audit |
| Overtime rate `ot_rate` | 10.5% | 8–12% (pass 7–13) | PASS | audit |
| Maps where the loser scores ≤ 3 `loser_le3_share` | 11.0% | 6–10% (pass 5–11) | PASS | audit |
| Win the next round after a win `win_after_win` | 64.2% | 60–65% (pass 58–66) | PASS | audit |
| Pistol winner wins round 2 `pistol_conv_r2` | 77.5% | ≈ 78% (pass 70–86) | PASS | estimate |
| Pistol winner wins rounds 2 and 3 `pistol_conv_r2r3` | 48.2% | ≈ 48% (pass 40–56) | PASS | estimate |
| CT round win `ct_round_win` | 51.4% | 50–53% (pass 48–55) | PASS | estimate |

## Economy (round win % vs a full buy)

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Eco vs full buy `eco_vs_full` | 13.9% | ≈ 8% (pass 4–14) | PASS | estimate |
| Force buy vs full buy `force_vs_full` | 28.2% | 25–30% (pass 22–33) | PASS | audit |
| Half buy (semi) vs full buy `half_vs_full` | 35.9% | 30–40% (pass 27–42) | PASS | estimate |

## Fights and player stats

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Kills per round (both teams) `kills_per_round` | 6.71 | ≈ 7.1 (pass 6.6–7.6) | PASS | audit |
| KPR (player mean) `kpr_mean` | 0.67 | ≈ 0.71 (pass 0.66–0.76) | PASS | audit |
| ADR (player mean) `adr_mean` | 73.6 | ≈ 76 (pass 71–81) | PASS | audit |
| KAST (player mean) `kast_mean` | 75.9% | ≈ 72% (pass 68–76) | PASS | estimate |
| Rating (player mean) `rating_mean` | 1.021 | 1.00 (pass 0.96–1.04) | PASS | audit |
| Trade kills share `trade_share` | 26.7% | 20–25% (pass 18–27) | PASS | audit |
| Headshot kills `headshot_pct` | 46.9% | 45–50% (pass 40–54) | PASS | estimate |

## Clutches and multi-kills

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| 1vX situations per map `clutch_situations_per_map` | 21.82 | ≈ 19–22 (pass 15–23) | PASS | derived |
| 1vX situations won `clutch_conversion` | 11.0% | ≈ 13% (pass 9–18) | PASS | estimate |
| Clutches won per map `clutches_won_per_map` | 2.40 | ≈ 2 (pass 1.5–2.6) | PASS | audit |
| 4-kill rounds per map `k4_per_map` | 1.73 | ≈ 1.5 (1.0–2.0) (pass 1–2.1) | PASS | Pro averages |
| Aces per map `ace_per_map` | 0.33 | ≈ 0.2 (0.13–0.26) (pass 0.12–0.3) | warn | Pro averages |
| Kill concentration E[k²] ÷ E[k] per player-round `multikill_index` | 1.85× | ≈ 1.88 (RMK 1.277 ÷ KPR 0.679) (pass 1.76–2) | PASS | Pro averages |

## Win reasons

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| CT wins by elimination `ct_win_elim` | 59.4% | ≈ 65% of CT wins (pass 55–75) | PASS | estimate |
| CT wins by defuse `ct_win_defuse` | 28.3% | ≈ 25% of CT wins (pass 15–32) | PASS | estimate |
| CT wins on time `ct_win_time` | 12.3% | ≈ 8% of CT wins (pass 4–13) | PASS | estimate |
| T wins by elimination `t_win_elim` | 57.5% | ≈ 55% of T wins (pass 45–68) | PASS | estimate |
| T wins by the bomb `t_win_bomb` | 42.5% | ≈ 45% of T wins (pass 32–55) | PASS | estimate |

## Roles and stars

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Opening kills by the entry fragger `opening_share_entry` | 24.6% | ≈ 26% (even split 20%) (pass 23–40) | PASS | estimate |
| Opening kills by the AWPer `opening_share_awper` | 28.4% | ≈ 25% (even split 20%) (pass 22–40) | PASS | estimate |
| Entry/AWPer lead over the next role `opening_role_gap` | +8.2 | clearly above others (pass ≥ 4) | PASS | design |
| Star (90 among 65s): share of team kills `star_kill_share` | 26.4% | ≈ 30% (even split 20%) (pass 26–36) | PASS | estimate |
| Star rating ÷ teammates’ rating `star_rating_ratio` | 1.36× | ≈ 1.4 (pass 1.25–1.7) | PASS | estimate |

## Skill gap (favourite map win)

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Favourite map win, +3 skill `fav_win_gap_3` | 56.0% | ≈ 57% (pass 53–62) | PASS | design |
| Favourite map win, +6 skill `fav_win_gap_6` | 68.5% | ≈ 64% (pass 57–70) | PASS | design |
| Favourite map win, +10 skill `fav_win_gap_10` | 78.0% | ≈ 72% (pass 64–80) | PASS | design |
| Favourite map win, +15 skill `fav_win_gap_15` | 82.0% | ≈ 80% (pass 72–88) | PASS | design |
| Favourite map win, +25 skill `fav_win_gap_25` | 94.0% | ≈ 92% (upsets possible) (pass 85–97) | PASS | design |
| Skill curve: largest drop between gaps `fav_curve_max_drop` | 0.0 | 0 (smooth, monotone) (pass ≤ 1) | PASS | design |
| Managed vs AI path: favourite win diff `path_parity_fav_win` | 0.0 | 0 (pass ±4) | PASS | design |
| Managed vs AI path: rounds/map diff `path_parity_rounds` | 0.00 | 0 (pass ±0.75) | PASS | design |

## Manager agency (paired, map-win points)

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Playstyle counter (structured vs balanced) `agency_playstyle_counter` | +2.7 ±6.0<br><sub>rounds +2.6 ±1.8 pp</sub> | positive, within ±12 | PASS | design |
| VOD review (tactical prep 0 → 25) `agency_vod_prep` | +4.0 ±3.2<br><sub>rounds +1.9 ±0.8 pp</sub> | positive, within ±12 | PASS | design |
| Timeout at a 3-round losing streak `agency_timeout` | 0.0 ±1.6<br><sub>rounds +0.2 ±0.5 pp; not resolved at this sample</sub> | positive, within ±6 | warn | design |
| Buy call: force round 2/14 after a lost pistol `agency_buy_force_r2` | +1.0 ±3.6<br><sub>rounds +0.6 ±0.9 pp; not resolved at this sample</sub> | non-zero, within ±10 | warn | design |
| Buy call: eco every round (negative control) `agency_buy_eco_control` | -50.7 ±5.7<br><sub>rounds -32.6 ±1.9 pp</sub> | negative | PASS | design |
| Roles: 5 riflers → AWP/IGL/entry/support/rifler `agency_roles` | +10.3 ±6.5<br><sub>rounds +3.7 ±2.0 pp</sub> | positive, within ±15 | PASS | design |
| Non-player cap: L5 coach+analyst+psych + counter (managed) `nonplayer_cap_managed` | +3.0 ±6.0<br><sub>rounds +3.1 ±1.8 pp</sub> | positive, within ±9 | PASS | audit |
| Non-player cap: AI-path bonus 25 (2.5× the cap) `nonplayer_cap_ai` | +6.0 ±3.9<br><sub>rounds +2.5 ±0.9 pp</sub> | positive, within ±9 | PASS | audit |

## Integrity

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Impossible states (timeline, win reason, stats) `impossible_states` | 0 | 0 (pass ≤ 0) | PASS | rule |

## Performance

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Simulation time per map `ms_per_map` | 27.53 ms | — | info | measured |

## Skill curve detail

| Gap | Favourite map win | Managed path | AI path | n |
|---|---|---|---|---|
| +3 | 56.0% | 56.0% | 56.0% | 400 |
| +6 | 68.5% | 68.5% | 68.5% | 400 |
| +10 | 78.0% | 78.0% | 78.0% | 400 |
| +15 | 82.0% | 82.0% | 82.0% | 400 |
| +25 | 94.0% | 94.0% | 94.0% | 400 |

## Impossible states

None.
