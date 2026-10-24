"""Aggregate ESTA records (records.jsonl) and LOS output (los.jsonl) into benchmark JSON."""
import json, sys, statistics as st, collections, math
REC, LOS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
U_PER_MAPPCT = 51  # game: 1 map-% ≈ 51 world units
M_PER_U = 0.0254
NAMES = {'de_mirage': 'Mirage', 'de_inferno': 'Inferno', 'de_nuke': 'Nuke', 'de_ancient': 'Ancient', 'de_overpass': 'Overpass',
         'de_vertigo': 'Vertigo', 'de_dust2': 'Dust2', 'de_train': 'Train', 'de_cache': 'Cache'}

def q(xs, ps=(10, 25, 50, 75, 90)):
    xs = sorted(x for x in xs if x is not None)
    if not xs: return None
    out = {'n': len(xs), 'mean': round(st.fmean(xs), 2)}
    for p in ps:
        k = (len(xs) - 1) * p / 100; f = math.floor(k); c = min(f + 1, len(xs) - 1)
        out[f'p{p}'] = round(xs[f] + (xs[c] - xs[f]) * (k - f), 2)
    return out
def pct(a, b): return None if not b else round(100 * a / b, 1)
def hist(xs, edges):
    xs = [x for x in xs if x is not None]; n = len(xs) or 1; out = {}
    for lo, hi in zip(edges, edges[1:] + [None]):
        lab = f'{lo}-{hi}' if hi is not None else f'{lo}+'
        out[lab] = pct(sum(1 for x in xs if x >= lo and (hi is None or x < hi)), n)
    return out

demos = [json.loads(l) for l in open(REC)]
los = [json.loads(l) for l in open(LOS)] if LOS != '-' else []
bymap = collections.defaultdict(list)
for d in demos: bymap[NAMES.get(d['map'], d['map'])].append(d)
losmap = collections.defaultdict(list)
for d in los: losmap[NAMES.get(d['map'], d['map'])].append(d)

def round_stats(ds):
    R = [r for d in ds for r in d['rounds'] if not r['ot'] and r['win'] in ('T', 'CT')]
    n = len(R)
    tw = [r for r in R if r['win'] == 'T']; cw = [r for r in R if r['win'] == 'CT']
    gun = [r for r in R if r['tBuy'] == 'Full Buy' and r['ctBuy'] == 'Full Buy']
    pistol = [r for r in R if r['pistol']]
    planted = [r for r in R if r['plant']]
    o = {
        'rounds': n, 'maps': len(ds),
        't_round_win_pct': pct(len(tw), n), 'ct_round_win_pct': pct(len(cw), n),
        't_wins_by_bomb_pct_of_t_wins': pct(sum(r['reason'] == 'TargetBombed' for r in tw), len(tw)),
        't_wins_by_elim_pct_of_t_wins': pct(sum(r['reason'] == 'TerroristsWin' for r in tw), len(tw)),
        'ct_wins_by_elim_pct_of_ct_wins': pct(sum(r['reason'] == 'CTWin' for r in cw), len(cw)),
        'ct_wins_by_defuse_pct_of_ct_wins': pct(sum(r['reason'] == 'BombDefused' for r in cw), len(cw)),
        'ct_wins_by_time_pct_of_ct_wins': pct(sum(r['reason'] == 'TargetSaved' for r in cw), len(cw)),
        'plant_rate_pct': pct(len(planted), n),
        'plant_rate_gun_rounds_pct': pct(sum(r['plant'] for r in gun), len(gun)),
        't_win_after_plant_pct': pct(sum(r['win'] == 'T' for r in planted), len(planted)),
        't_win_no_plant_pct': pct(sum(r['win'] == 'T' for r in R if not r['plant']), n - len(planted)),
        'plant_time_s_after_freeze': q([r['plantS'] for r in planted]),
        'pistol_t_win_pct': pct(sum(r['win'] == 'T' for r in pistol), len(pistol)), 'pistol_rounds': len(pistol),
        'gun_round_t_win_pct': pct(sum(r['win'] == 'T' for r in gun), len(gun)), 'gun_rounds': len(gun),
        'round_duration_s': q([r['dur'] for r in R]),
        'time_to_first_kill_s': q([r['fkS'] for r in R]),
        'time_to_first_kill_s_gun': q([r['fkS'] for r in gun]),
        'time_to_first_kill_s_pistol': q([r['fkS'] for r in pistol]),
        'first_kill_by_t_pct': pct(sum(r['fkSide'] == 0 for r in R if r['fkSide'] is not None), sum(r['fkSide'] is not None for r in R)),
        'opening_kill_team_round_win_pct': pct(sum((r['fkSide'] == 0) == (r['win'] == 'T') for r in R if r['fkSide'] is not None), sum(r['fkSide'] is not None for r in R)),
        'opening_kill_round_win_pct_when_t': pct(sum(r['win'] == 'T' for r in R if r['fkSide'] == 0), sum(r['fkSide'] == 0 for r in R)),
        'opening_kill_round_win_pct_when_ct': pct(sum(r['win'] == 'CT' for r in R if r['fkSide'] == 1), sum(r['fkSide'] == 1 for r in R)),
        'opening_kill_distance_m': q([r['fkDist'] for r in R]),
        'kills_per_round': round(sum(r['nk'] for r in R) / n, 2) if n else None,
        'adr': round(sum(r['dmgT'] + r['dmgCT'] for r in R) / (10 * n), 1) if n else None,
        'utility_adr': round(sum(r['utilT'] + r['utilCT'] for r in R) / (10 * n), 2) if n else None,
        'utility_damage_per_team_round': round(sum(r['utilT'] + r['utilCT'] for r in R) / (2 * n), 1) if n else None,
        'grenades_per_team_round': {k: round(sum(r[k] for r in R) / (2 * n), 2) for k in ('nFlash', 'nSmoke', 'nHE', 'nMolly')} if n else None,
    }
    return o

def buy_matrix(ds):
    R = [r for d in ds for r in d['rounds'] if not r['ot'] and not r['pistol'] and r['win'] in ('T', 'CT')]
    types = ['Full Eco', 'Semi Eco', 'Semi Buy', 'Full Buy']
    m = {}
    for tb in types:
        for cb in types:
            rs = [r for r in R if r['tBuy'] == tb and r['ctBuy'] == cb]
            m[f'T {tb} vs CT {cb}'] = {'n': len(rs), 't_win_pct': pct(sum(r['win'] == 'T' for r in rs), len(rs))}
    vs_full = {}
    for b in types:
        w = n = 0
        for r in R:
            if r['tBuy'] == b and r['ctBuy'] == 'Full Buy': n += 1; w += r['win'] == 'T'
            if r['ctBuy'] == b and r['tBuy'] == 'Full Buy': n += 1; w += r['win'] == 'CT'
        vs_full[b] = {'n': n, 'win_pct': pct(w, n)}
    return {'matrix_non_pistol': m, 'win_pct_vs_full_buy_either_side': vs_full,
            'buy_type_definition': 'awpy/HLTV style on team freeze-time-end equipment value: Full Eco < $5k, Semi Eco $5k–10k, Semi Buy $10k–20k, Full Buy > $20k'}

def series_stats(ds):
    """Score-shape facts that do not depend on MR15 vs MR12."""
    waw = [0, 0]; p2 = [0, 0]; p23 = [0, 0]; ot = 0; clutch = [0, 0]
    for d in ds:
        half = (d['maxRounds'] or 30) // 2
        rs = {r['n']: r for r in d['rounds']}
        winner = {n: (r['tTeam'] if r['win'] == 'T' else r['ctTeam']) for n, r in rs.items() if r['win'] in ('T', 'CT')}
        if any(r['ot'] for r in d['rounds']): ot += 1
        for n in sorted(winner):
            if n + 1 in winner and n not in (half, 2 * half) and not rs[n]['ot']:
                waw[1] += 1; waw[0] += winner[n + 1] == winner[n]
        for p in (1, half + 1):
            if p in winner and p + 1 in winner:
                p2[1] += 1; p2[0] += winner[p + 1] == winner[p]
                if p + 2 in winner:
                    p23[1] += 1; p23[0] += winner[p + 1] == winner[p] and winner[p + 2] == winner[p]
    return {'maps': len(ds), 'overtime_rate_pct': pct(ot, len(ds)), 'win_after_win_pct': pct(*waw), 'pistol_winner_wins_next_round_pct': pct(*p2),
            'pistol_winner_wins_next_two_pct': pct(*p23),
            'rounds_per_map_mr15': round(st.fmean(sum(1 for r in d['rounds'] if not r['ot']) for d in ds), 2) if ds else None}

def kill_stats(ds):
    K = [k for d in ds for k in d['kills']]
    tr = [t for d in ds for t in d['trades']]
    dist = [k['distM'] for k in K if k['distM']]
    by_wc = {}
    for wc in ('Rifle', 'Sniper Rifle', 'Pistols', 'SMG', 'Heavy'):
        xs = [k['distM'] for k in K if k['wc'] == wc and k['distM']]
        if len(xs) > 50: by_wc[wc] = q(xs)
    secs = [k['s'] for k in K]
    return {
        'kills': len(K), 'headshot_pct': pct(sum(k['hs'] for k in K), len(K)), 'wallbang_pct': pct(sum(k['wb'] for k in K), len(K)),
        'through_smoke_pct': pct(sum(k['smoke'] for k in K), len(K)),
        'trade_kill_share_pct_awpy_5s': pct(sum(k['trade'] for k in K), len(K)),
        'trade_time_s': q(tr), 'trade_within_s_pct_of_trades_le5s': {f'{w}s': pct(sum(t <= w for t in tr if t <= 5), sum(t <= 5 for t in tr)) for w in (1, 2, 3, 4)},
        'trade_share_by_window_pct_of_all_kills': {f'{w}s': pct(sum(t <= w for t in tr), len(K)) for w in (2, 3, 5)},
        'engagement_distance_m': q(dist), 'engagement_distance_map_pct': q([x / M_PER_U / U_PER_MAPPCT for x in dist]),
        'engagement_distance_hist_m_pct': hist(dist, [0, 5, 10, 15, 20, 30, 40]),
        'engagement_distance_by_weapon_m': by_wc,
        'kill_time_hist_s_after_freeze_pct': hist(secs, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]),
    }

def util_stats(ds):
    he = [g for d in ds for g in d['he']]; mo = [g for d in ds for g in d['molly']]
    hits = [h for g in he for h in g['hits']]
    return {
        'he_thrown': len(he), 'he_zero_enemy_damage_pct': pct(sum(g['enemy'] == 0 for g in he), len(he)),
        'he_enemy_damage_per_throw': q([g['enemy'] for g in he], (25, 50, 75, 90, 95)),
        'he_enemy_damage_per_damaging_throw': q([g['enemy'] for g in he if g['enemy'] > 0], (25, 50, 75, 90)),
        'he_enemies_hit_per_throw_pct': {str(k): pct(sum(len(g['hits']) == k for g in he), len(he)) for k in range(0, 4)} | {'4+': pct(sum(len(g['hits']) >= 4 for g in he), len(he))},
        'he_damage_per_enemy_hit': q(hits, (10, 25, 50, 75, 90)), 'he_damage_per_enemy_hit_hist': hist(hits, [1, 10, 20, 30, 40, 50, 60, 80]),
        'he_kills_per_100_throws': round(100 * sum(g['kill'] for g in he) / len(he), 2) if he else None,
        'he_team_damage_pct_of_throws': pct(sum(g['team'] > 0 for g in he), len(he)),
        'molotov_thrown': len(mo), 'molotov_zero_enemy_damage_pct': pct(sum(g['enemy'] == 0 for g in mo), len(mo)),
        'molotov_enemy_damage_per_throw': q([g['enemy'] for g in mo], (25, 50, 75, 90, 95)),
        'molotov_enemy_damage_per_damaging_throw': q([g['enemy'] for g in mo if g['enemy'] > 0], (25, 50, 75, 90)),
    }

RADII = {'4m': 157, '6mappct': 306, '10mappct': 510}
def standoff_stats(ls):
    nr = sum(d['rounds'] for d in ls)
    if not nr: return None
    o = {'rounds': nr, 'demos': len(ls)}
    for lab, R in RADII.items():
        quiet_s = strict_s = 0; eps = []; rounds_with = set()
        for d in ls:
            for s in d['sightings']:
                fr = [(t, dd) for t, dd in s['fr'] if dd <= R]
                if not fr: continue
                def quiet(t, strict):
                    if any(0 <= k - t <= 2.5 for k in s['killsAt']): return False
                    if strict and any(-2.5 <= x - t <= 2.5 for x in s['dmgAt']): return False
                    return True
                qf = [t for t, _ in fr if quiet(t, False)]
                quiet_s += 0.5 * len(qf); strict_s += 0.5 * sum(quiet(t, True) for t, _ in fr)
                # episodes of quiet frames (gap ≤ 1 s)
                cur = None
                for t in qf:
                    if cur and t - cur[1] <= 1.0: cur[1] = t
                    else:
                        if cur: eps.append((cur[1] - cur[0] + 0.5, (d['demo'], s['round'])))
                        cur = [t, t]
                if cur: eps.append((cur[1] - cur[0] + 0.5, (d['demo'], s['round'])))
        long = [e for e in eps if e[0] >= 3]
        o[lab] = {'radius_u': R, 'radius_m': round(R * M_PER_U, 1), 'radius_map_pct': round(R / U_PER_MAPPCT, 1),
                  'quiet_pair_seconds_per_round': round(quiet_s / nr, 2), 'quiet_pair_seconds_per_round_no_damage_pm2_5s': round(strict_s / nr, 2),
                  'sightings_ge3s_per_round': round(len(long) / nr, 3), 'sightings_ge3s_duration_s': q([e[0] for e in long]),
                  'rounds_with_sighting_ge3s_pct': pct(len({e[1] for e in long}), nr),
                  'sightings_ge10s_per_100_rounds': round(100 * sum(e[0] >= 10 for e in eps) / nr, 2),
                  'sightings_ge20s_per_100_rounds': round(100 * sum(e[0] >= 20 for e in eps) / nr, 2),
                  'longest_s': max((e[0] for e in eps), default=0)}
    # contact → fight conversion, by closest distance band, measured from the first frame inside the band
    conv = {}
    for lab, (lo, hi) in {'0-4m': (0, 157), '4-8m': (157, 315), '8-13m': (315, 510)}.items():
        n = 0; dm = collections.Counter(); kl = collections.Counter()
        for d in ls:
            for s in d['sightings']:
                inb = [t for t, dd in s['fr'] if dd <= hi]
                if not inb or min(dd for _, dd in s['fr']) < lo: continue
                t0 = inb[0]; n += 1
                fd = min([x - t0 for x in s['dmgAt'] + s['killsAt'] if x >= t0 - 0.5] or [99])
                fk = min([x - t0 for x in s['killsAt'] if x >= t0 - 0.5] or [99])
                for w in (1, 2, 3, 5): dm[w] += fd <= w; kl[w] += fk <= w
        conv[lab] = {'contacts': n, **{f'damage_within_{w}s_pct': pct(dm[w], n) for w in (1, 2, 3, 5)}, **{f'kill_within_{w}s_pct': pct(kl[w], n) for w in (1, 2, 3, 5)}}
    o['contact_to_fight'] = conv
    return o

def sight_stats(ls):
    S = [s for d in ls for s in d['sightToKill']]
    seen = [s for s in S if s['seen']]
    o = {'kills': len(S), 'kills_with_visible_run_pct': pct(len(seen), len(S)),
         'sight_to_kill_s': q([s['sightToKill'] for s in seen]), 'sight_to_first_shot_s': q([s['sightToFire'] for s in seen]),
         'sight_to_first_damage_s': q([s['sightToDmg'] for s in seen]),
         'victim_fired_back_pct': pct(sum(s['victimFired'] for s in seen), len(seen)),
         'sight_to_kill_hist_s_pct': hist([s['sightToKill'] for s in seen], [0, 0.5, 1, 1.5, 2, 3, 5, 10]),
         'opening_kill_sight_to_kill_s': q([s['sightToKill'] for s in seen if s.get('first')])}
    by = {}
    for lab, (lo, hi) in {'0-5m': (0, 197), '5-10m': (197, 394), '10-20m': (394, 787), '20m+': (787, 1e9)}.items():
        xs = [s['sightToKill'] for s in seen if lo <= s['dist'] < hi]
        by[lab] = q(xs)
    o['sight_to_kill_by_distance_s'] = by
    return o

def mesh_check(ls):
    kl = [x for d in ls for x in d['killLos'] if not x[1] and not x[2]]
    return {'kill_lines_checked': len(kl), 'kill_lines_clear_pct': pct(sum(x[0] for x in kl), len(kl))}

res = {'meta': {
    'dataset': 'ESTA (Esports Trajectories & Actions), github.com/pnxenopoulos/esta, CC BY-SA 4.0',
    'demos': len(demos), 'subsets': dict(collections.Counter(d['subset'] for d in demos)),
    'period': 'Jan 2021 – May 2022 (CS:GO, MR15, top HLTV-listed online and LAN events)',
    'units': 'distances in metres at 1 world unit = 0.0254 m (1 inch); game map-% = 51 u',
    'frames': '2 Hz player snapshots (0.5 s), so sight timings carry ±0.5 s resolution'},
    'all': {}, 'maps': {}}
def block(ds, ls):
    b = {'rounds': round_stats(ds), 'buys': buy_matrix(ds), 'series': series_stats(ds), 'kills': kill_stats(ds), 'utility': util_stats(ds)}
    if ls: b['line_of_sight'] = {'mesh_check': mesh_check(ls), 'standoffs': standoff_stats(ls), 'sight_to_kill': sight_stats(ls)}
    return b
res['all'] = block(demos, los)
for m in sorted(bymap, key=lambda m: -len(bymap[m])):
    if len(bymap[m]) >= 20: res['maps'][m] = block(bymap[m], losmap.get(m, []))
json.dump(res, open(OUT, 'w'), indent=1)
print('ok', len(demos), len(los))
