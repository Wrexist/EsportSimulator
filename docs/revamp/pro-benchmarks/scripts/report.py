"""Render the benchmark JSON as markdown tables (per-map columns)."""
import json, sys
res = json.load(open(sys.argv[1])); out = open(sys.argv[2], 'w')
A = res['all']; M = res['maps']
maps = list(M)
los_maps = [m for m in maps if 'line_of_sight' in M[m]]
def g(b, path):
    for p in path.split('.'):
        if b is None: return None
        b = b.get(p) if isinstance(b, dict) else None
    return b
def f(v, unit=''):
    if v is None: return '–'
    if isinstance(v, (int, float)) and unit == '%': return f'{v:.1f}%'
    if isinstance(v, float): v = f'{v:.1f}' if abs(v) >= 10 else f'{v:.2f}'
    return f'{v}{unit}'
def table(rows, cols, src):
    w = out.write
    w('| Metric | All | ' + ' | '.join(cols) + ' |\n|---|' + '---|' * (len(cols) + 1) + '\n')
    for label, path, unit in rows:
        w(f'| {label} | **{f(g(src(None), path), unit)}** | ' + ' | '.join(f(g(src(m), path), unit) for m in cols) + ' |\n')
    w('\n')
blk = lambda m: A if m is None else M[m]
W = out.write
W(open(sys.argv[3]).read())  # hand-written header
W('\n## 1. Rounds, plants and win types (regulation rounds)\n\n')
W(f"Maps with at least 20 demos. Rounds per map: " + ', '.join(f"{m} {M[m]['rounds']['rounds']:,}" for m in maps) + f". All: {A['rounds']['rounds']:,} rounds in {A['rounds']['maps']:,} maps.\n\n")
rows = [
    ('T round win', 'rounds.t_round_win_pct', '%'), ('CT round win', 'rounds.ct_round_win_pct', '%'),
    ('Pistol rounds: T win', 'rounds.pistol_t_win_pct', '%'), ('Gun rounds (both full buy): T win', 'rounds.gun_round_t_win_pct', '%'),
    ('T wins by bomb (share of T wins)', 'rounds.t_wins_by_bomb_pct_of_t_wins', '%'), ('T wins by elimination', 'rounds.t_wins_by_elim_pct_of_t_wins', '%'),
    ('CT wins by elimination (share of CT wins)', 'rounds.ct_wins_by_elim_pct_of_ct_wins', '%'), ('CT wins by defuse', 'rounds.ct_wins_by_defuse_pct_of_ct_wins', '%'),
    ('CT wins on time', 'rounds.ct_wins_by_time_pct_of_ct_wins', '%'),
    ('Plant rate, all rounds', 'rounds.plant_rate_pct', '%'), ('Plant rate, gun rounds', 'rounds.plant_rate_gun_rounds_pct', '%'),
    ('T win after a plant', 'rounds.t_win_after_plant_pct', '%'), ('T win without a plant', 'rounds.t_win_no_plant_pct', '%'),
    ('Plant time, median (s after freeze end)', 'rounds.plant_time_s_after_freeze.p50', ' s'),
    ('Plant time, p25', 'rounds.plant_time_s_after_freeze.p25', ' s'), ('Plant time, p75', 'rounds.plant_time_s_after_freeze.p75', ' s'),
    ('Round length, median', 'rounds.round_duration_s.p50', ' s'),
]
table(rows, maps, blk)
W('## 2. Time to first kill and the opening duel\n\n')
table([
    ('First kill, median (s after freeze end)', 'rounds.time_to_first_kill_s.p50', ' s'), ('First kill, p10', 'rounds.time_to_first_kill_s.p10', ' s'),
    ('First kill, p25', 'rounds.time_to_first_kill_s.p25', ' s'), ('First kill, p75', 'rounds.time_to_first_kill_s.p75', ' s'),
    ('First kill, p90', 'rounds.time_to_first_kill_s.p90', ' s'), ('First kill, mean', 'rounds.time_to_first_kill_s.mean', ' s'),
    ('First kill in gun rounds, median', 'rounds.time_to_first_kill_s_gun.p50', ' s'), ('First kill in pistol rounds, median', 'rounds.time_to_first_kill_s_pistol.p50', ' s'),
    ('Opening kill made by a T', 'rounds.first_kill_by_t_pct', '%'), ('Team with the opening kill wins the round', 'rounds.opening_kill_team_round_win_pct', '%'),
    ('… when the T side got it', 'rounds.opening_kill_round_win_pct_when_t', '%'), ('… when the CT side got it', 'rounds.opening_kill_round_win_pct_when_ct', '%'),
    ('Opening kill distance, median', 'rounds.opening_kill_distance_m.p50', ' m'),
], maps, blk)
W('## 3. Kills, distance and trades\n\n')
table([
    ('Kills per round', 'rounds.kills_per_round', ''), ('ADR (all damage, per player)', 'rounds.adr', ''), ('Headshot kills', 'kills.headshot_pct', '%'),
    ('Wallbang kills', 'kills.wallbang_pct', '%'), ('Kills through smoke', 'kills.through_smoke_pct', '%'),
    ('Kill distance p10', 'kills.engagement_distance_m.p10', ' m'), ('Kill distance p25', 'kills.engagement_distance_m.p25', ' m'),
    ('Kill distance median', 'kills.engagement_distance_m.p50', ' m'), ('Kill distance p75', 'kills.engagement_distance_m.p75', ' m'),
    ('Kill distance p90', 'kills.engagement_distance_m.p90', ' m'), ('Kill distance median (map-%)', 'kills.engagement_distance_map_pct.p50', ''),
    ('Kills at 0–5 m', 'kills.engagement_distance_hist_m_pct.0-5', '%'), ('Kills at 5–10 m', 'kills.engagement_distance_hist_m_pct.5-10', '%'),
    ('Kills at 10–15 m', 'kills.engagement_distance_hist_m_pct.10-15', '%'), ('Kills at 15–20 m', 'kills.engagement_distance_hist_m_pct.15-20', '%'),
    ('Kills at 20–30 m', 'kills.engagement_distance_hist_m_pct.20-30', '%'), ('Kills at 30–40 m', 'kills.engagement_distance_hist_m_pct.30-40', '%'),
    ('Kills at 40 m+', 'kills.engagement_distance_hist_m_pct.40+', '%'),
    ('Trade kills (awpy, ≤ 5 s)', 'kills.trade_kill_share_pct_awpy_5s', '%'),
    ('Trade time, median (killer killed back)', 'kills.trade_time_s.p50', ' s'), ('Trade time, p25', 'kills.trade_time_s.p25', ' s'), ('Trade time, p75', 'kills.trade_time_s.p75', ' s'),
    ('Trades ≤ 5 s done within 2 s', 'kills.trade_within_s_pct_of_trades_le5s.2s', '%'), ('Trades ≤ 5 s done within 3 s', 'kills.trade_within_s_pct_of_trades_le5s.3s', '%'),
], maps, blk)
W('Kill distance by weapon class (all maps, metres):\n\n| Class | n | p25 | median | p75 | p90 |\n|---|---|---|---|---|---|\n')
for wc, v in A['kills']['engagement_distance_by_weapon_m'].items():
    W(f"| {wc} | {v['n']:,} | {v['p25']} | {v['p50']} | {v['p75']} | {v['p90']} |\n")
W('\nWhen kills happen (all maps, share of kills by seconds after freeze end): ' + ', '.join(f'{k} s {v}%' for k, v in A['kills']['kill_time_hist_s_after_freeze_pct'].items()) + '.\n\n')
W('## 4. Buy types (non-pistol regulation rounds)\n\n')
W('Win rate of a side with this buy against a full buy (either side), all maps:\n\n| Buy | Rounds | Win vs full buy |\n|---|---|---|\n')
for b, v in A['buys']['win_pct_vs_full_buy_either_side'].items(): W(f"| {b} | {v['n']:,} | {f(v['win_pct'], '%')} |\n")
W('\nT win % by T buy (rows) and CT buy (columns), all maps:\n\n| T \\ CT | Full Eco | Semi Eco | Semi Buy | Full Buy |\n|---|---|---|---|---|\n')
types = ['Full Eco', 'Semi Eco', 'Semi Buy', 'Full Buy']
for tb in types:
    W(f'| {tb} | ' + ' | '.join(f"{f(A['buys']['matrix_non_pistol'][f'T {tb} vs CT {cb}']['t_win_pct'], '%')} ({A['buys']['matrix_non_pistol'][f'T {tb} vs CT {cb}']['n']:,})" for cb in types) + ' |\n')
W(f"\n{A['buys']['buy_type_definition']}.\n\n")
W('## 5. Series shape (MR15, so per-map round counts do not carry over to MR12)\n\n')
table([('Overtime rate', 'series.overtime_rate_pct', '%'), ('Win the next round after a win', 'series.win_after_win_pct', '%'),
       ('Pistol winner wins the next round', 'series.pistol_winner_wins_next_round_pct', '%'), ('Pistol winner wins the next two', 'series.pistol_winner_wins_next_two_pct', '%'),
       ('Regulation rounds per map (MR15)', 'series.rounds_per_map_mr15', '')], maps, blk)
W('## 6. Utility damage\n\n')
table([
    ('HE grenades per team-round', 'rounds.grenades_per_team_round.nHE', ''), ('Molotovs per team-round', 'rounds.grenades_per_team_round.nMolly', ''),
    ('Flashes per team-round', 'rounds.grenades_per_team_round.nFlash', ''), ('Smokes per team-round', 'rounds.grenades_per_team_round.nSmoke', ''),
    ('Utility damage per team-round', 'rounds.utility_damage_per_team_round', ''), ('Utility ADR (per player)', 'rounds.utility_adr', ''),
    ('HEs that do no enemy damage', 'utility.he_zero_enemy_damage_pct', '%'), ('HE enemy damage per throw, mean', 'utility.he_enemy_damage_per_throw.mean', ''),
    ('HE enemy damage per damaging throw, median', 'utility.he_enemy_damage_per_damaging_throw.p50', ''), ('… mean', 'utility.he_enemy_damage_per_damaging_throw.mean', ''),
    ('HE damage per enemy hit, median', 'utility.he_damage_per_enemy_hit.p50', ''), ('HE damage per enemy hit, p90', 'utility.he_damage_per_enemy_hit.p90', ''),
    ('HE kills per 100 HEs', 'utility.he_kills_per_100_throws', ''),
    ('Molotovs that do no enemy damage', 'utility.molotov_zero_enemy_damage_pct', '%'), ('Molotov enemy damage per damaging throw, median', 'utility.molotov_enemy_damage_per_damaging_throw.p50', ''),
], maps, blk)
u = A['utility']
W('HE outcome per throw (all maps): ' + ', '.join(f'{k} enemies hit {v}%' for k, v in u['he_enemies_hit_per_throw_pct'].items()) + '.\n\n')
W('HE damage per enemy hit (all maps): ' + ', '.join(f'{k} HP {v}%' for k, v in u['he_damage_per_enemy_hit_hist'].items()) + '.\n\n')
W('## 7. Line of sight: stand-offs, contact → fight, sight → kill\n\n')
W('Ray-cast with the game\'s own collision meshes (`public/map-studio/spatial/<Map>.mesh`, standing eye 64 u, crouched 46 u) between every pair of live enemies on each 2 Hz frame. Only the six maps that have both ESTA demos and a game mesh.\n\n')
L = lambda m: (A if m is None else M[m])
table([
    ('Rounds checked', 'line_of_sight.standoffs.rounds', ''), ('Kill lines clear on the mesh (mesh check)', 'line_of_sight.mesh_check.kill_lines_clear_pct', '%'),
    ('≤ 4 m: quiet pair-seconds per round', 'line_of_sight.standoffs.4m.quiet_pair_seconds_per_round', ' s'),
    ('≤ 4 m: sightings ≥ 3 s per round', 'line_of_sight.standoffs.4m.sightings_ge3s_per_round', ''),
    ('≤ 6 map-% (7.8 m): quiet pair-seconds per round', 'line_of_sight.standoffs.6mappct.quiet_pair_seconds_per_round', ' s'),
    ('≤ 6 map-%: sightings ≥ 3 s per round', 'line_of_sight.standoffs.6mappct.sightings_ge3s_per_round', ''),
    ('≤ 6 map-%: rounds with a sighting ≥ 3 s', 'line_of_sight.standoffs.6mappct.rounds_with_sighting_ge3s_pct', '%'),
    ('≤ 6 map-%: sightings ≥ 10 s per 100 rounds', 'line_of_sight.standoffs.6mappct.sightings_ge10s_per_100_rounds', ''),
    ('≤ 10 map-% (13 m): quiet pair-seconds per round', 'line_of_sight.standoffs.10mappct.quiet_pair_seconds_per_round', ' s'),
    ('≤ 10 map-%: sightings ≥ 3 s per round', 'line_of_sight.standoffs.10mappct.sightings_ge3s_per_round', ''),
    ('≤ 10 map-%: sightings ≥ 20 s per 100 rounds', 'line_of_sight.standoffs.10mappct.sightings_ge20s_per_100_rounds', ''),
    ('Contact at 0–4 m: damage within 1 s', 'line_of_sight.standoffs.contact_to_fight.0-4m.damage_within_1s_pct', '%'),
    ('Contact at 0–4 m: damage within 3 s', 'line_of_sight.standoffs.contact_to_fight.0-4m.damage_within_3s_pct', '%'),
    ('Contact at 0–4 m: kill within 3 s', 'line_of_sight.standoffs.contact_to_fight.0-4m.kill_within_3s_pct', '%'),
    ('Contact at 4–8 m: damage within 3 s', 'line_of_sight.standoffs.contact_to_fight.4-8m.damage_within_3s_pct', '%'),
    ('Contact at 4–8 m: kill within 3 s', 'line_of_sight.standoffs.contact_to_fight.4-8m.kill_within_3s_pct', '%'),
    ('Contact at 8–13 m: damage within 3 s', 'line_of_sight.standoffs.contact_to_fight.8-13m.damage_within_3s_pct', '%'),
    ('Contact at 8–13 m: kill within 3 s', 'line_of_sight.standoffs.contact_to_fight.8-13m.kill_within_3s_pct', '%'),
    ('Kills with a visible run before them', 'line_of_sight.sight_to_kill.kills_with_visible_run_pct', '%'),
    ('Sight → kill, median', 'line_of_sight.sight_to_kill.sight_to_kill_s.p50', ' s'), ('Sight → kill, p75', 'line_of_sight.sight_to_kill.sight_to_kill_s.p75', ' s'),
    ('Sight → kill, p90', 'line_of_sight.sight_to_kill.sight_to_kill_s.p90', ' s'),
    ('Sight → killer\'s first shot, median', 'line_of_sight.sight_to_kill.sight_to_first_shot_s.p50', ' s'),
    ('Sight → first damage, median', 'line_of_sight.sight_to_kill.sight_to_first_damage_s.p50', ' s'),
    ('Victim fired back before dying', 'line_of_sight.sight_to_kill.victim_fired_back_pct', '%'),
], los_maps, L)
s = A['line_of_sight']['sight_to_kill']
W('Sight → kill, all six maps, share of kills: ' + ', '.join(f'{k} s {v}%' for k, v in s['sight_to_kill_hist_s_pct'].items()) + '.\n\n')
W('Sight → kill by kill distance (median / p90): ' + ', '.join(f"{k} {v['p50']} / {v['p90']} s (n {v['n']:,})" for k, v in s['sight_to_kill_by_distance_s'].items() if v) + '.\n\n')
out.close()
