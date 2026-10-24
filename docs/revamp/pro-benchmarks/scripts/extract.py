import json, lzma, gzip, sys, os
src, subset, out = sys.argv[1], sys.argv[2], sys.argv[3]
with lzma.open(src, 'rt') as fh: d = json.load(fh)
S = {'T': 0, 'CT': 1}
def r1(v): return None if v is None else round(v, 1)
rounds = []
for r in d.get('gameRounds') or []:
    if r.get('isWarmup'): continue
    fr = []
    for f in r.get('frames') or []:
        ps = []
        for side in ('t', 'ct'):
            for p in (f.get(side) or {}).get('players') or []:
                if not p.get('isAlive'): continue
                ps.append([p['steamID'], S[p['side']], r1(p['x']), r1(p['y']), r1(p['z']), int(bool(p.get('isDucking'))), p.get('spotters') or [], p.get('hp')])
        fr.append([f['tick'], ps, int(bool(f.get('bombPlanted')))])
    rounds.append({
        'n': r['roundNum'], 'start': r['startTick'], 'fte': r['freezeTimeEndTick'], 'end': r['endTick'], 'plant': r.get('bombPlantTick'),
        'win': r.get('winningSide'), 'reason': r.get('roundEndReason'), 'tBuy': r.get('tBuyType'), 'ctBuy': r.get('ctBuyType'),
        'tEq': r.get('tFreezeTimeEndEqVal'), 'ctEq': r.get('ctFreezeTimeEndEqVal'), 'tTeam': r.get('tTeam'), 'ctTeam': r.get('ctTeam'),
        'tS': r.get('tScore'), 'ctS': r.get('ctScore'), 'endT': r.get('endTScore'), 'endCT': r.get('endCTScore'),
        'kills': [[k['tick'], k['attackerSteamID'], S.get(k['attackerSide']), k['victimSteamID'], S.get(k['victimSide']), r1(k.get('distance')),
                   int(bool(k.get('isHeadshot'))), int(bool(k.get('isWallbang'))), int(bool(k.get('thruSmoke'))), int(bool(k.get('isTrade'))),
                   k.get('playerTradedSteamID'), k.get('weapon'), k.get('weaponClass'), int(bool(k.get('attackerBlinded'))),
                   int(k.get('flashThrowerSteamID') is not None), r1(k.get('attackerX')), r1(k.get('attackerY')), r1(k.get('attackerZ')),
                   r1(k.get('victimX')), r1(k.get('victimY')), r1(k.get('victimZ')), int(bool(k.get('isSuicide'))), int(bool(k.get('isTeamkill')))]
                  for k in r.get('kills') or []],
        'dmg': [[x['tick'], x['attackerSteamID'], S.get(x['attackerSide']), x['victimSteamID'], S.get(x['victimSide']), x.get('weapon'), x.get('weaponClass'),
                 x.get('hpDamageTaken'), x.get('hpDamage'), int(bool(x.get('isFriendlyFire'))), r1(x.get('distance'))] for x in r.get('damages') or []],
        'gren': [[g['throwTick'], g.get('destroyTick'), g['throwerSteamID'], S.get(g.get('throwerSide')), g['grenadeType'], r1(g.get('grenadeX')), r1(g.get('grenadeY')), r1(g.get('grenadeZ'))] for g in r.get('grenades') or []],
        'fires': [[w['tick'], w['playerSteamID'], w.get('weaponClass')] for w in r.get('weaponFires') or [] if w.get('weaponClass') not in ('Grenade', 'Equipment')],
        'bomb': [[b['tick'], b['bombAction'], b.get('bombSite'), b.get('playerSteamID')] for b in r.get('bombEvents') or []],
        'frames': fr,
    })
meta = {k: d.get(k) for k in ('mapName', 'tickRate', 'competitionName', 'hltvUrl', 'matchDate', 'matchName', 'demoId', 'matchId')}
meta['subset'] = subset; meta['maxRounds'] = (d.get('serverVars') or {}).get('maxRounds'); meta['parser'] = d.get('parserParameters')
with gzip.open(out, 'wt') as fh: json.dump({'meta': meta, 'rounds': rounds}, fh, separators=(',', ':'))
