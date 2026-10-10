# Engine calibration — legacy-v2

Run 2026-10-10 · harness v1 · seed 20261010 · 6,100 BO1 maps through the production series paths (managed + AI) · 13.1 s.

Reproduce: `npx tsx scripts/calibrate-engine.ts --engine legacy-v2 --samples 600 --seed 20261010 --json docs/revamp/calibration/legacy-v2.json --md docs/revamp/calibration/legacy-v2.md`

Targets and bands: `engine/match/calibration/targets.ts`. Reference values are approximate
(audit 2026-10-09 benchmarks where available, otherwise estimates or design intent — see Source).
Agency rows are paired map-win deltas in points (±95% CI) against an even 70 v 70 baseline;
they must be non-zero, point the expected way and stay bounded.

Sample: realism 600 maps (equal teams, managed/AI alternating); skill 200 seeds per gap, each on both paths; star 200 maps; agency 300 paired seeds per decision; cap 300 paired seeds per path.

**Summary:** 24 pass · 16 warn · 9 fail

**Outside the pass band:**

- FAIL: `force_vs_full` 11.8%, `kills_per_round` 5.85, `kpr_mean` 0.58, `adr_mean` 55.5, `opening_share_entry` 19.6%, `opening_share_awper` 19.8%, `opening_role_gap` -0.9, `star_kill_share` 21.7%, `star_rating_ratio` 1.01×
- warn: `loser_le3_share` 11.5%, `win_after_win` 67.0%, `pistol_conv_r2` 89.0%, `pistol_conv_r2r3` 60.4%, `ct_round_win` 47.7%, `half_vs_full` 21.2%, `rating_mean` 0.931, `clutch_conversion` 7.4%, `clutches_won_per_map` 1.40, `k4_per_map` 0.23, `ace_per_map` 0.02, `ct_win_defuse` 32.4%, `t_win_elim` 42.9%, `t_win_bomb` 57.1%, `fav_win_gap_15` 90.5%, `fav_win_gap_25` 98.0%

## Score shape (equal teams, BO1)

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Avg rounds per map `rounds_per_map` | 21.58 | 21–22 (pass 20.5–23) | PASS | audit |
| Overtime rate `ot_rate` | 12.0% | 8–12% (pass 7–13) | PASS | audit |
| Maps where the loser scores ≤ 3 `loser_le3_share` | 11.5% | 6–10% (pass 5–11) | warn | audit |
| Win the next round after a win `win_after_win` | 67.0% | 60–65% (pass 58–66) | warn | audit |
| Pistol winner wins round 2 `pistol_conv_r2` | 89.0% | ≈ 78% (pass 70–86) | warn | estimate |
| Pistol winner wins rounds 2 and 3 `pistol_conv_r2r3` | 60.4% | ≈ 48% (pass 40–56) | warn | estimate |
| CT round win `ct_round_win` | 47.7% | 50–53% (pass 48–55) | warn | estimate |

## Economy (round win % vs a full buy)

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Eco vs full buy `eco_vs_full` | 10.8% | ≈ 8% (pass 4–14) | PASS | estimate |
| Force buy vs full buy `force_vs_full` | 11.8% | 25–30% (pass 22–33) | FAIL | audit |
| Half buy (semi) vs full buy `half_vs_full` | 21.2% | 30–40% (pass 27–42) | warn | estimate |

## Fights and player stats

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Kills per round (both teams) `kills_per_round` | 5.85 | ≈ 7.1 (pass 6.6–7.6) | FAIL | audit |
| KPR (player mean) `kpr_mean` | 0.58 | ≈ 0.71 (pass 0.66–0.76) | FAIL | audit |
| ADR (player mean) `adr_mean` | 55.5 | ≈ 76 (pass 71–81) | FAIL | audit |
| KAST (player mean) `kast_mean` | 69.0% | ≈ 72% (pass 68–76) | PASS | estimate |
| Rating (player mean) `rating_mean` | 0.931 | 1.00 (pass 0.96–1.04) | warn | audit |
| Trade kills share `trade_share` | 19.7% | 20–25% (pass 18–27) | PASS | audit |
| Headshot kills `headshot_pct` | 40.2% | 45–50% (pass 40–54) | PASS | estimate |

## Clutches and multi-kills

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| 1vX situations per map `clutch_situations_per_map` | 18.80 | ≈ 14–18 (pass 11–20) | PASS | estimate |
| 1vX situations won `clutch_conversion` | 7.4% | ≈ 13% (pass 9–18) | warn | estimate |
| Clutches won per map `clutches_won_per_map` | 1.40 | ≈ 2 (pass 1.5–2.6) | warn | audit |
| 4-kill rounds per map `k4_per_map` | 0.23 | ≈ 0.35 (pass 0.25–0.5) | warn | estimate |
| Aces per map `ace_per_map` | 0.02 | ≈ 0.06 (pass 0.03–0.1) | warn | estimate |

## Win reasons

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| CT wins by elimination `ct_win_elim` | 59.4% | ≈ 65% of CT wins (pass 55–75) | PASS | estimate |
| CT wins by defuse `ct_win_defuse` | 32.4% | ≈ 25% of CT wins (pass 15–32) | warn | estimate |
| CT wins on time `ct_win_time` | 8.2% | ≈ 8% of CT wins (pass 4–13) | PASS | estimate |
| T wins by elimination `t_win_elim` | 42.9% | ≈ 55% of T wins (pass 45–68) | warn | estimate |
| T wins by the bomb `t_win_bomb` | 57.1% | ≈ 45% of T wins (pass 32–55) | warn | estimate |

## Roles and stars

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Opening kills by the entry fragger `opening_share_entry` | 19.6% | ≈ 26% (even split 20%) (pass 23–40) | FAIL | estimate |
| Opening kills by the AWPer `opening_share_awper` | 19.8% | ≈ 25% (even split 20%) (pass 22–40) | FAIL | estimate |
| Entry/AWPer lead over the next role `opening_role_gap` | -0.9 | clearly above others (pass ≥ 4) | FAIL | design |
| Star (90 among 65s): share of team kills `star_kill_share` | 21.7% | ≈ 30% (even split 20%) (pass 26–36) | FAIL | estimate |
| Star rating ÷ teammates’ rating `star_rating_ratio` | 1.01× | ≈ 1.4 (pass 1.25–1.7) | FAIL | estimate |

## Skill gap (favourite map win)

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Favourite map win, +3 skill `fav_win_gap_3` | 60.0% | ≈ 57% (pass 53–62) | PASS | design |
| Favourite map win, +6 skill `fav_win_gap_6` | 70.0% | ≈ 64% (pass 57–70) | PASS | design |
| Favourite map win, +10 skill `fav_win_gap_10` | 80.0% | ≈ 72% (pass 64–80) | PASS | design |
| Favourite map win, +15 skill `fav_win_gap_15` | 90.5% | ≈ 80% (pass 72–88) | warn | design |
| Favourite map win, +25 skill `fav_win_gap_25` | 98.0% | ≈ 92% (upsets possible) (pass 85–97) | warn | design |
| Skill curve: largest drop between gaps `fav_curve_max_drop` | 0.0 | 0 (smooth, monotone) (pass ≤ 1) | PASS | design |
| Managed vs AI path: favourite win diff `path_parity_fav_win` | 0.0 | 0 (pass ±4) | PASS | design |
| Managed vs AI path: rounds/map diff `path_parity_rounds` | 0.00 | 0 (pass ±0.75) | PASS | design |

## Manager agency (paired, map-win points)

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Playstyle counter (structured vs balanced) `agency_playstyle_counter` | +3.3 ±2.0<br><sub>rounds +2.3 ±0.7 pp</sub> | positive, within ±12 | PASS | design |
| VOD review (tactical prep 0 → 25) `agency_vod_prep` | +2.0 ±1.6<br><sub>rounds +1.9 ±0.6 pp</sub> | positive, within ±12 | PASS | design |
| Timeout at a 3-round losing streak `agency_timeout` | +1.0 ±1.1<br><sub>rounds +0.4 ±0.3 pp</sub> | positive, within ±6 | PASS | design |
| Buy call: force round 2/14 after a lost pistol `agency_buy_force_r2` | -4.7 ±3.3<br><sub>rounds -1.7 ±0.9 pp</sub> | non-zero, within ±10 | PASS | design |
| Buy call: eco every round (negative control) `agency_buy_eco_control` | -47.7 ±5.7<br><sub>rounds -30.5 ±1.8 pp</sub> | negative | PASS | design |
| Roles: 5 riflers → AWP/IGL/entry/support/rifler `agency_roles` | +12.0 ±3.9<br><sub>rounds +5.0 ±1.0 pp</sub> | positive, within ±15 | PASS | design |
| Non-player cap: L5 coach+analyst+psych + counter (managed) `nonplayer_cap_managed` | +8.3 ±3.1<br><sub>rounds +4.0 ±0.9 pp</sub> | positive, within ±9 | PASS | audit |
| Non-player cap: AI-path bonus 25 (2.5× the cap) `nonplayer_cap_ai` | +6.0 ±2.7<br><sub>rounds +3.2 ±0.8 pp</sub> | positive, within ±9 | PASS | audit |

## Integrity

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Impossible states (timeline, win reason, stats) `impossible_states` | 0 | 0 (pass ≤ 0) | PASS | rule |

## Performance

| Metric | Value | Target | Status | Source |
|---|---|---|---|---|
| Simulation time per map `ms_per_map` | 1.98 ms | — | info | measured |

## Skill curve detail

| Gap | Favourite map win | Managed path | AI path | n |
|---|---|---|---|---|
| +3 | 60.0% | 60.0% | 60.0% | 400 |
| +6 | 70.0% | 70.0% | 70.0% | 400 |
| +10 | 80.0% | 80.0% | 80.0% | 400 |
| +15 | 90.5% | 90.5% | 90.5% | 400 |
| +25 | 98.0% | 98.0% | 98.0% | 400 |

## Impossible states

None.
