/**
 * Line-of-sight pass over compacted ESTA demos using the game's own collision
 * meshes (public/map-studio/spatial/<Map>.mesh, PR #65 branch).
 *
 *   npx tsx los.ts <compact dir> <mesh dir> <out.jsonl> [shard] [nShards]
 *
 * Copy engine/spatial/geometry.ts and types.ts next to this file first (they are
 * imported as ./geometry and ./types). Paths in fetch_one.sh are the ones the
 * 2026-10-24 run used; adjust them for your machine.
 *
 * Per demo it writes one JSON line with:
 *  - killLos: LOS check on each kill line (validates mesh vs CS:GO geometry)
 *  - sightings: close in-LOS enemy pair runs (per radius) with outcome
 *  - sightToKill: per kill, start of the visible run that ends in the kill
 */
import { readFileSync, readdirSync, appendFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { CollisionScene } from './geometry'
import type { Vec3 } from './types'

const [, , compactDir, meshDir, outFile, shardArg, nShardArg] = process.argv
const shard = Number(shardArg ?? 0), nShards = Number(nShardArg ?? 1)
const MAPS: Record<string, string> = { de_mirage: 'Mirage', de_inferno: 'Inferno', de_nuke: 'Nuke', de_ancient: 'Ancient', de_overpass: 'Overpass', de_vertigo: 'Vertigo' }
const EYE_STAND = 64, EYE_DUCK = 46
const MAX_R = 510 // 10 map-% (game EXPOSE_RANGE): sightings are reported inside this
const LOS_R = 4000 // pairs ray-cast for sight → kill
const GAP = 1 // frames a run may skip
const scenes = new Map<string, CollisionScene>()
const scene = (m: string) => {
    if (!scenes.has(m)) {
        const b = readFileSync(path.join(meshDir, `${m}.mesh`))
        scenes.set(m, CollisionScene.fromBinary(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer))
    }
    return scenes.get(m)!
}
const clear = (s: CollisionScene, a: Vec3, b: Vec3) => s.raycast(a, b) === null

type Player = [number, number, number, number, number, number, number[], number]
const files = readdirSync(compactDir).filter(f => f.endsWith('.json.gz')).sort().filter((_, i) => i % nShards === shard)
for (const f of files) {
    const d = JSON.parse(gunzipSync(readFileSync(path.join(compactDir, f))).toString())
    const mapId = MAPS[d.meta.mapName]
    if (!mapId) continue
    const s = scene(mapId)
    const tr = d.meta.tickRate || 128
    const out: any = { demo: d.meta.demoId, map: d.meta.mapName, subset: d.meta.subset, killLos: [], sightings: [], sightToKill: [], rounds: 0 }
    const byn = new Map<number, any>(); for (const r of d.rounds) byn.set(r.n, r)
    for (const r of [...byn.values()].sort((a, b) => a.n - b.n)) {
        out.rounds++
        const fte = r.fte, sec = (t: number) => (t - fte) / tr
        const kills = r.kills.filter((k: any[]) => k[1] != null && k[2] != null && k[4] != null && k[2] !== k[4])
        // 1. kill-line LOS (feet z from the kill record, standing eye)
        for (const k of kills) {
            if (k[15] == null || k[18] == null) continue
            const a: Vec3 = [k[15], k[16], k[17] + EYE_STAND], v: Vec3 = [k[18], k[19], k[20] + EYE_STAND]
            const vChest: Vec3 = [k[18], k[19], k[20] + 40]
            out.killLos.push([clear(s, a, v) || clear(s, a, vChest) ? 1 : 0, k[7], k[8], Math.round(k[5] ?? 0)])
        }
        // 2. per-frame LOS for enemy pairs inside MAX_R (live round only)
        const frames = r.frames.filter((fr: any[]) => fr[0] >= fte && fr[0] <= r.end)
        const runs = new Map<string, { start: number; last: number; minD: number; frames: number; dists: number[]; fr: number[][] }[]>()
        frames.forEach((fr: any[], fi: number) => {
            const ps: Player[] = fr[1]
            const T = ps.filter(p => p[1] === 0), C = ps.filter(p => p[1] === 1)
            for (const t of T) for (const c of C) {
                const dx = t[2] - c[2], dy = t[3] - c[3], dz = t[4] - c[4]
                const d2 = Math.hypot(dx, dy)
                if (d2 > LOS_R) continue
                const ea: Vec3 = [t[2], t[3], t[4] + (t[5] ? EYE_DUCK : EYE_STAND)], eb: Vec3 = [c[2], c[3], c[4] + (c[5] ? EYE_DUCK : EYE_STAND)]
                if (!clear(s, ea, eb)) continue
                const key = `${t[0]}|${c[0]}`
                const list = runs.get(key) ?? []
                const cur = list[list.length - 1]
                const dist = Math.hypot(dx, dy, dz)
                if (cur && fi - cur.last <= 1 + GAP) { cur.last = fi; cur.frames++; cur.minD = Math.min(cur.minD, dist); cur.dists.push(dist); cur.fr.push([fi, dist]) }
                else list.push({ start: fi, last: fi, minD: dist, frames: 1, dists: [dist], fr: [[fi, dist]] })
                runs.set(key, list)
            }
        })
        const fsec = (fi: number) => sec(frames[fi][0])
        // pair interactions
        const pairEv = (a: number, b: number) => ({
            kills: kills.filter((k: any[]) => (k[1] === a && k[3] === b) || (k[1] === b && k[3] === a)).map((k: any[]) => sec(k[0])),
            dmg: r.dmg.filter((x: any[]) => x[5] !== 'HE Grenade' && x[6] !== 'Grenade' && ((x[1] === a && x[3] === b) || (x[1] === b && x[3] === a))).map((x: any[]) => sec(x[0])),
            anyKill: kills.filter((k: any[]) => k[3] === a || k[3] === b).map((k: any[]) => [sec(k[0]), k[3]]),
        })
        for (const [key, list] of runs) {
            const [a, b] = key.split('|').map(Number)
            const ev = pairEv(a, b)
            for (const run of list) {
                if (run.minD > MAX_R) continue
                const t0 = fsec(run.start), t1 = fsec(run.last)
                // outcome: damage/kill between the pair during the run or within 3 s after it
                const firstDmg = [...ev.dmg, ...ev.kills].filter(t => t >= t0 - 0.5 && t <= t1 + 3).sort((x, y) => x - y)[0]
                const pairKill = ev.kills.find(t => t >= t0 - 0.5 && t <= t1 + 3)
                const otherDeath = ev.anyKill.filter(([t]) => t >= t0 && t <= t1 + 0.5).length > 0 && pairKill === undefined
                out.sightings.push({ t0: +t0.toFixed(2), dur: +(t1 - t0 + 0.5).toFixed(2), minD: Math.round(run.minD), medD: Math.round(run.dists.sort((x, y) => x - y)[run.dists.length >> 1]), firstDmg: firstDmg === undefined ? null : +(firstDmg - t0).toFixed(2), kill: pairKill === undefined ? null : +(pairKill - t0).toFixed(2), otherDeath, round: r.n, planted: frames[run.start][2], fr: run.fr.filter(([, d]) => d <= MAX_R).map(([fi, d]) => [+fsec(fi).toFixed(2), Math.round(d)]), killsAt: ev.kills.map(t => +t.toFixed(2)), dmgAt: ev.dmg.map(t => +t.toFixed(2)) })
            }
        }
        // 3. sight → kill: visible run of the pair that contains (or ends ≤ 1 s before) the kill
        for (const k of kills) {
            if (k[7]) continue // wallbang
            const key = k[2] === 0 ? `${k[1]}|${k[3]}` : `${k[3]}|${k[1]}`
            const tk = sec(k[0])
            const list = runs.get(key) ?? []
            const run = list.filter(rn => fsec(rn.start) <= tk + 0.25 && fsec(rn.last) >= tk - 1.0).pop()
            if (!run) { out.sightToKill.push({ seen: false, dist: Math.round(k[5] ?? 0), smoke: k[8], wc: k[12] }); continue }
            const t0 = fsec(run.start)
            const fire = r.fires.filter((w: any[]) => w[1] === k[1] && sec(w[0]) >= t0 - 0.5 && sec(w[0]) <= tk).map((w: any[]) => sec(w[0]))[0]
            const dmg = r.dmg.filter((x: any[]) => x[1] === k[1] && x[3] === k[3] && sec(x[0]) >= t0 - 0.5 && sec(x[0]) <= tk).map((x: any[]) => sec(x[0]))[0]
            const vFire = r.fires.filter((w: any[]) => w[1] === k[3] && sec(w[0]) >= t0 - 0.5 && sec(w[0]) <= tk).length > 0
            out.sightToKill.push({ seen: true, sightToKill: +(tk - t0).toFixed(2), sightToFire: fire === undefined ? null : +(fire - t0).toFixed(2), sightToDmg: dmg === undefined ? null : +(dmg - t0).toFixed(2), victimFired: vFire, dist: Math.round(k[5] ?? 0), smoke: k[8], wc: k[12], first: k === kills[0] })
        }
    }
    appendFileSync(outFile, JSON.stringify(out) + '\n')
}
