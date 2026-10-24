"""Per-demo records from the compacted ESTA files (one JSON line per demo)."""
import json, gzip, sys, bisect
U2M = 0.0254
def recs(path):
    d = json.load(gzip.open(path, 'rt'))
    m = d['meta']; tr = m['tickRate'] or 128; half = (m['maxRounds'] or 30) // 2
    out = {'demo': m['demoId'], 'map': m['mapName'], 'subset': m['subset'], 'comp': m['competitionName'], 'date': m['matchDate'],
           'maxRounds': m['maxRounds'], 'rounds': [], 'kills': [], 'he': [], 'molly': [], 'trades': [], 'teams': None}
    rounds = d['rounds']
    # dedupe round numbers (restarts): keep last occurrence
    byn = {}
    for r in rounds: byn[r['n']] = r
    rounds = [byn[k] for k in sorted(byn)]
    for r in rounds:
        fte = r['fte']; sec = lambda t: (t - fte) / tr
        kills = [k for k in r['kills'] if k[1] is not None and k[2] is not None and k[4] is not None and k[2] != k[4] and not k[21]]
        kills.sort(key=lambda k: k[0])
        fk = kills[0] if kills else None
        rr = {'n': r['n'], 'pistol': r['n'] in (1, half + 1), 'ot': r['n'] > 2 * half, 'win': r['win'], 'reason': r['reason'],
              'tBuy': r['tBuy'], 'ctBuy': r['ctBuy'], 'tEq': r['tEq'], 'ctEq': r['ctEq'], 'plant': r['plant'] is not None,
              'plantS': sec(r['plant']) if r['plant'] else None, 'dur': sec(r['end']), 'nk': len(kills),
              'fkS': sec(fk[0]) if fk else None, 'fkSide': fk[2] if fk else None, 'fkDist': fk[5] * U2M if fk and fk[5] else None,
              'endT': r['endT'], 'endCT': r['endCT'], 'tTeam': r['tTeam'], 'ctTeam': r['ctTeam']}
        dmg = [x for x in r['dmg'] if x[1] is not None and x[2] is not None and x[4] is not None]
        enemy = [x for x in dmg if x[2] != x[4]]
        rr['dmgT'] = sum(x[7] or 0 for x in enemy if x[2] == 0); rr['dmgCT'] = sum(x[7] or 0 for x in enemy if x[2] == 1)
        rr['utilT'] = sum(x[7] or 0 for x in enemy if x[2] == 0 and x[6] == 'Grenade'); rr['utilCT'] = sum(x[7] or 0 for x in enemy if x[2] == 1 and x[6] == 'Grenade')
        rr['nFlash'] = sum(1 for g in r['gren'] if g[4] == 'Flashbang'); rr['nSmoke'] = sum(1 for g in r['gren'] if g[4] == 'Smoke Grenade')
        rr['nHE'] = sum(1 for g in r['gren'] if g[4] == 'HE Grenade'); rr['nMolly'] = sum(1 for g in r['gren'] if g[4] in ('Molotov', 'Incendiary Grenade'))
        out['rounds'].append(rr)
        # kills + trades (own computation: teammate of victim kills the killer within 5 s)
        for i, k in enumerate(kills):
            out['kills'].append({'s': sec(k[0]), 'side': k[2], 'distM': (k[5] or 0) * U2M, 'hs': k[6], 'wb': k[7], 'smoke': k[8], 'trade': k[9],
                                 'wc': k[12], 'w': k[11], 'first': i == 0, 'pistol': rr['pistol']})
            for j in range(i + 1, len(kills)):
                k2 = kills[j]
                if (k2[0] - k[0]) / tr > 10: break
                if k2[3] == k[1] and k2[2] == k[4]:
                    out['trades'].append((k2[0] - k[0]) / tr); break
        # HE grenades: enemy damage per throw
        hes = [g for g in r['gren'] if g[4] == 'HE Grenade']
        hed = [x for x in dmg if x[5] == 'HE Grenade']
        used = set()
        per = {id(g): {'enemy': 0, 'team': 0, 'hits': [], 'kill': 0, 'side': g[3]} for g in hes}
        for x in hed:
            # HE detonates ~1.65 s after the throw (destroyTick is the entity removal ~4 s later)
            cands = [g for g in hes if g[2] == x[1] and g[0] <= x[0] <= g[0] + 6 * tr]
            if not cands: continue
            g = min(cands, key=lambda g: abs(g[0] + 1.65 * tr - x[0]))
            p = per[id(g)]
            if x[2] != x[4]: p['enemy'] += x[7] or 0; p['hits'].append(x[7] or 0)
            else: p['team'] += x[7] or 0
        for k in kills:
            if k[11] == 'HE Grenade':
                c = [g for g in hes if g[2] == k[1]]
                if c: per[id(min(c, key=lambda g: abs(g[0] + 1.65 * tr - k[0])))]['kill'] += 1
        out['he'].extend(per.values())
        ms = [g for g in r['gren'] if g[4] in ('Molotov', 'Incendiary Grenade')]
        mp = {id(g): {'enemy': 0, 'team': 0, 'nhit': set(), 'side': g[3]} for g in ms}
        for x in dmg:
            if x[5] not in ('Molotov', 'Incendiary Grenade'): continue
            c = [g for g in ms if g[2] == x[1] and g[0] <= x[0] <= (g[1] or g[0]) + 8 * tr]
            if not c: continue
            g = max(c, key=lambda g: g[0]); p = mp[id(g)]
            if x[2] != x[4]: p['enemy'] += x[7] or 0; p['nhit'].add(x[3])
            else: p['team'] += x[7] or 0
        out['molly'].extend({'enemy': p['enemy'], 'team': p['team'], 'nhit': len(p['nhit']), 'side': p['side']} for p in mp.values())
    return out
if __name__ == '__main__':
    import multiprocessing as mp, glob
    files = sorted(glob.glob(sys.argv[1] + '/*.json.gz'))
    with mp.Pool(4) as pool, open(sys.argv[2], 'w') as fh:
        for o in pool.imap_unordered(recs, files, chunksize=4): fh.write(json.dumps(o) + '\n')
