"""Team-play ("CS IQ") benchmarks from compacted ESTA demos.

  python3 -I docs/revamp/team-play/iq_pro.py <compact dir> docs/revamp/team-play/pro-team-play.json

The compact dir is the ESTA pro demos in compact form, as used by scripts/pro-spots.ts
(docs/revamp/sight-engine/SIGHT_ENGINE_2026-10.md).

Measures, all on regulation rounds with five a side at freeze end:
  states      win % for the side ahead from each alive state (T alive, CT alive), before / after the plant,
              counted once per round the first time the state is reached
  plant       CT win % by alive state at the plant (retake conversion)
  ctSave      bombed rounds with a CT alive at the end, by CT-vs-T alive at the plant
  tSave       CT wins without a plant: share with a T alive at the end
  openSite    at the hit (first frame with 2 Ts within HIT_M of the plant site), CTs within HOLD_M of each site
              10 s earlier: plants on the site with fewer / equal / more CTs
  rotate      for CTs more than FAR_M from the plant site at the hit: seconds until within HOLD_M (or never / died)
  retakeGap   after a plant, seconds between the first and second CT coming within RETAKE_M of the bomb
  ctAtPlant   CTs within HOLD_M of the plant site centre at the plant (0, 1, 2, 3+)
  killsPrePlant kills in the 15 s before the plant (0..4+)
  postDist    T distance to the bomb 10 s after the plant (m)
"""
import gzip, json, os, sys, math
from collections import defaultdict

U = 0.01905  # metres per unit
HIT_M, HOLD_M, FAR_M, RETAKE_M = 12.0, 16.0, 30.0, 10.0

src, out = sys.argv[1], sys.argv[2]
files = sorted(f for f in os.listdir(src) if f.endswith('.json.gz'))


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1]) * U


def frame_at(frames, tick):
    best = None
    for f in frames:
        if f[0] <= tick:
            best = f
        else:
            break
    return best


# Pass 1: site centres per map (median planter position by site).
plants = defaultdict(lambda: defaultdict(list))
def demos():
    for f in files:
        yield json.load(gzip.open(os.path.join(src, f), 'rt'))


for d in demos():
    m = d['meta']['mapName']
    for r in d['rounds']:
        for b in r['bomb']:
            if b[1] == 'plant' and b[2] in ('A', 'B'):
                fr = frame_at(r['frames'], b[0])
                if not fr:
                    continue
                for p in fr[1]:
                    if p[0] == b[3]:
                        plants[m][b[2]].append((p[2], p[3]))
sites = {}
for m, by in plants.items():
    sites[m] = {}
    for s, pts in by.items():
        xs = sorted(p[0] for p in pts); ys = sorted(p[1] for p in pts)
        sites[m][s] = (xs[len(xs) // 2], ys[len(ys) // 2])

R = {
    'rounds': 0, 'states': {}, 'plant': {}, 'ctSave': {}, 'tSave': [0, 0], 'openSite': [0, 0, 0],
    'ctAtPlant': [0, 0, 0, 0], 'killsPrePlant': [0, 0, 0, 0, 0], 'rotate': [], 'rotateNever': 0, 'rotateDied': 0, 'retakeGap': [], 'postDist': [], 'bombed': [0, 0],
}


def bump(tab, key, win):
    e = tab.setdefault(key, [0, 0])
    e[0] += 1
    e[1] += win


for d in demos():
    m = d['meta']['mapName']
    if m not in sites or len(sites[m]) < 2:
        continue
    tr = d['meta']['tickRate'] or 128
    maxr = d['meta'].get('maxRounds') or 30
    seen = set()
    for r in d['rounds']:
        if r['n'] in seen or r['n'] > maxr or r['win'] not in ('T', 'CT') or not r['frames']:
            continue
        seen.add(r['n'])
        f0 = r['frames'][0][1]
        if sum(1 for p in f0 if p[1] == 0) != 5 or sum(1 for p in f0 if p[1] == 1) != 5:
            continue
        R['rounds'] += 1
        ctWin = 1 if r['win'] == 'CT' else 0
        plantEv = next((b for b in r['bomb'] if b[1] == 'plant'), None)
        plantTick = plantEv[0] if plantEv else None
        kills = sorted((k for k in r['kills'] if k[4] in (0, 1) and not k[22]), key=lambda k: k[0])
        alive = [5, 5]
        got = set()
        planted_state = None
        for k in kills:
            if plantTick is not None and planted_state is None and k[0] >= plantTick:
                planted_state = tuple(alive)
            alive[k[4]] -= 1
            post = plantTick is not None and k[0] >= plantTick
            st = (alive[0], alive[1], int(post))
            if alive[0] > 0 and alive[1] > 0 and st not in got:
                got.add(st)
                bump(R['states'], '%d-%d-%d' % st, ctWin)
        if plantTick is not None and planted_state is None:
            planted_state = tuple(alive)
        endAlive = tuple(alive)
        if plantTick is not None:
            key = '%d-%d' % planted_state
            bump(R['plant'], key, ctWin)
            if r['reason'] == 'TargetBombed':
                R['bombed'][0] += 1
                saved = 1 if endAlive[1] > 0 else 0
                R['bombed'][1] += saved
                bump(R['ctSave'], key, saved)
        elif ctWin:
            R['tSave'][0] += 1
            R['tSave'][1] += 1 if endAlive[0] > 0 else 0
        # Map geometry measures need the plant site.
        if not plantEv or plantEv[2] not in ('A', 'B') or m == 'de_nuke':
            continue
        S = plantEv[2]; O = 'B' if S == 'A' else 'A'
        sc, oc = sites[m][S], sites[m][O]
        frames = r['frames']
        pf0 = frame_at(frames, plantTick)
        if pf0:
            R['ctAtPlant'][min(3, sum(1 for p in pf0[1] if p[1] == 1 and dist((p[2], p[3]), sc) <= HOLD_M))] += 1
        R['killsPrePlant'][min(4, sum(1 for k in kills if plantTick - 15 * tr <= k[0] < plantTick))] += 1
        hit = None
        for fr in frames:
            if fr[0] > plantTick:
                break
            if sum(1 for p in fr[1] if p[1] == 0 and dist((p[2], p[3]), sc) <= HIT_M) >= 2:
                hit = fr
                break
        if hit is None:
            continue
        early = frame_at(frames, hit[0] - 10 * tr) or frames[0]
        nS = sum(1 for p in early[1] if p[1] == 1 and dist((p[2], p[3]), sc) <= HOLD_M)
        nO = sum(1 for p in early[1] if p[1] == 1 and dist((p[2], p[3]), oc) <= HOLD_M)
        R['openSite'][0 if nS < nO else 1 if nS == nO else 2] += 1
        far = [p[0] for p in hit[1] if p[1] == 1 and dist((p[2], p[3]), sc) > FAR_M]
        for pid in far:
            arrived = None; last = None
            for fr in frames:
                if fr[0] <= hit[0]:
                    continue
                p = next((p for p in fr[1] if p[0] == pid), None)
                if p is None:
                    break
                last = fr[0]
                if dist((p[2], p[3]), sc) <= HOLD_M:
                    arrived = fr[0]
                    break
            if arrived is not None:
                R['rotate'].append(round((arrived - hit[0]) / tr, 1))
            elif last is not None and last < frames[-1][0]:
                R['rotateDied'] += 1
            else:
                R['rotateNever'] += 1
        # Post-plant: the bomb is where the planter stood.
        pf = frame_at(frames, plantTick)
        bomb = next(((p[2], p[3]) for p in pf[1] if p[0] == plantEv[3]), None) if pf else None
        if bomb is None:
            continue
        f10 = frame_at(frames, plantTick + 10 * tr)
        if f10 and f10[0] > plantTick:
            for p in f10[1]:
                if p[1] == 0:
                    R['postDist'].append(round(dist((p[2], p[3]), bomb), 1))
        entered = {}
        onSite = {p[0] for p in pf[1] if p[1] == 1 and dist((p[2], p[3]), bomb) <= RETAKE_M}
        for fr in frames:
            if fr[0] < plantTick:
                continue
            for p in fr[1]:
                if p[1] == 1 and p[0] not in entered and p[0] not in onSite and dist((p[2], p[3]), bomb) <= RETAKE_M:
                    entered[p[0]] = fr[0]
        ts = sorted(entered.values())
        if planted_state and planted_state[1] >= 2 and len(ts) >= 2:
            R['retakeGap'].append(round((ts[1] - ts[0]) / tr, 1))

R['sites'] = sites
json.dump(R, open(out, 'w'))
print('rounds', R['rounds'])
