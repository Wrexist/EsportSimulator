/**
 * Combat overhaul (2026-10): close-range stand-offs, duels in line of sight,
 * grenades that land where they hurt, HP timing (return fire, molotov burn),
 * the radar's exchange of fire and HP-lost feedback, and the feed's clock.
 *
 * The stand-off numbers come from the same metric the audit used (pairs of
 * living opponents ≤ 6 map-% apart that can see each other, sampled every
 * 0.5 s, not about to fight). Before the cover pass this fixture measured 57
 * pair-seconds per round with 49 stand-offs of 20 s or more (longest 70 s);
 * after it, 31 per round and none of 20 s.
 */
import { sampleTrack } from '@/engine/match/round-script'
import { navGraphFor } from '@/engine/match/round-script-nav'
import { HE_DAMAGE_RADIUS } from '@/engine/match/round-script-tracks'
import { visibilityFor } from '@/engine/match/round-script-visibility'
import type { RoundScript } from '@/engine/match/round-script-types'
import { VISIBILITY_BAKES } from '@/data/round-maps/visibility'
import { liveRoundMap } from '@/lib/live-round-script'
import { MOLOTOV_TICKS, RETURN_FIRE_LEAD, roundHp } from '@/lib/round-hp'
import { createRadarScene, prepareRadarScript, sampleRadarScene } from '@/lib/radar-scene'
import { feedClockLabels } from '@/lib/live-feed-clock'
import type { LogEntry } from '@/types'
import { MapId } from '@/types/enums'
import { playRadarSeries, type RadarFixture } from './radar-fixtures'

const fixtures: RadarFixture[] = [playRadarSeries(MapId.MIRAGE, 11), playRadarSeries(MapId.INFERNO, 11), playRadarSeries(MapId.NUKE, 11), playRadarSeries(MapId.ANCIENT, 11)]
const scripts = fixtures.flatMap(f => f.live)
const HOME = ['H0', 'H1', 'H2', 'H3', 'H4'], AWAY = ['A0', 'A1', 'A2', 'A3', 'A4']

const deathTimes = (sc: RoundScript) => new Map(sc.deaths.map(d => [d.victimId, d.t]))
const aliveAt = (died: Map<string, number>, id: string, t: number) => (died.get(id) ?? Infinity) > t

describe('line of sight bake', () => {
    it('is fresh for every round map (re-run scripts/bake-round-visibility.ts if this fails)', () => {
        for (const mapId of Object.keys(VISIBILITY_BAKES)) {
            const map = liveRoundMap(mapId)
            expect(map).toBeDefined()
            expect({ mapId, baked: visibilityFor(navGraphFor(map!)).baked }).toEqual({ mapId, baked: true })
        }
    })

    it('never sees across floors or past its radius', () => {
        const g = navGraphFor(liveRoundMap('Nuke')!)
        const vis = visibilityFor(g)
        for (let n = 0; n < g.size; n += 7) for (let m = 0; m < g.size; m += 5) {
            if (g.floor[n] !== g.floor[m] || Math.hypot(g.x[n] - g.x[m], g.y[n] - g.y[m]) > 12) expect(vis.sees(n, m)).toBe(n === m)
        }
    })
})

describe('engagements', () => {
    it('places nearly every duel where killer and victim can see each other', () => {
        let kills = 0, seen = 0
        for (const live of scripts) {
            const g = navGraphFor(live.map), vis = visibilityFor(g)
            for (const d of live.script.deaths) {
                if (d.killerId === d.victimId) continue
                kills++
                if (vis.sees(g.nearest(d.from), g.nearest(d.at))) seen++
            }
        }
        expect(kills).toBeGreaterThan(200)
        // Was ~71 % before the bake was used to place duels.
        expect(seen / kills).toBeGreaterThan(0.93)
    })

    it('keeps opponents from standing in each other\'s sight at close range without fighting', () => {
        let rounds = 0, pairSeconds = 0, longest = 0
        for (const live of scripts) {
            const sc = live.script, g = navGraphFor(live.map), vis = visibilityFor(g)
            const ids = Object.keys(sc.tracks), died = deathTimes(sc)
            const run = new Map<string, number>()
            rounds++
            for (let t = 0.25; t < sc.endTime; t += 0.5) {
                const pos = new Map(ids.map(id => [id, sampleTrack(sc.tracks[id], t)]))
                for (const a of ids) for (const b of ids) {
                    if (a >= b || sc.sides[a] === sc.sides[b]) continue
                    const pa = pos.get(a)!, pb = pos.get(b)!
                    const standing = aliveAt(died, a, t) && aliveAt(died, b, t) && pa.floor === pb.floor
                        && Math.hypot(pa.x - pb.x, pa.y - pb.y) <= 6 && vis.sees(g.nearest(pa), g.nearest(pb))
                        && !sc.deaths.some(d => d.t >= t && d.t <= t + 2.5 && ((d.killerId === a && d.victimId === b) || (d.killerId === b && d.victimId === a)))
                    const r = standing ? (run.get(a + b) ?? 0) + 0.5 : 0
                    run.set(a + b, r)
                    if (standing) pairSeconds += 0.5
                    longest = Math.max(longest, r)
                }
            }
        }
        expect(pairSeconds / rounds).toBeLessThan(40)
        expect(longest).toBeLessThan(30)
    })
})

describe('grenades', () => {
    it('a damaging HE lands within its blast radius of the victim, a molotov under them, on their floor', () => {
        let he = 0, molly = 0
        for (const live of scripts) {
            const sc = live.script
            for (const u of sc.utility) {
                if (!u.hitId || !u.dmg) continue
                const v = sampleTrack(sc.tracks[u.hitId], u.t)
                const d = Math.hypot(v.x - u.at.x, v.y - u.at.y)
                expect(u.at.floor).toBe(v.floor)
                if (u.kind === 'he') { he++; expect(d).toBeLessThanOrEqual(HE_DAMAGE_RADIUS + 1e-6) }
                if (u.kind === 'molotov') { molly++; expect(d).toBeLessThanOrEqual(u.radius) }
            }
        }
        expect(he).toBeGreaterThan(5)
        expect(molly).toBeGreaterThan(5)
    })

    it('nobody throws a grenade after dying', () => {
        for (const f of fixtures) {
            for (const step of f.steps) {
                const died = new Map<string, number>()
                for (const e of step.round.events ?? []) if (e.type === 'KILL' && e.victimId) died.set(e.victimId, e.time)
                for (const u of step.round.utility ?? []) expect({ round: step.round.roundNumber, id: u.playerId, late: u.t > (died.get(u.playerId) ?? Infinity) }).toEqual({ round: step.round.roundNumber, id: u.playerId, late: false })
            }
        }
    })
})

describe('HP timing', () => {
    const rounds = fixtures.flatMap(f => f.steps.map(s => s.round))

    it('return fire lands just before the kill, and every molotov tick before the victim dies', () => {
        let duelChips = 0, mollyTicks = 0
        for (const r of rounds) {
            const hp = roundHp({ round: r, homeIds: HOME, awayIds: AWAY })
            const kills = (r.events ?? []).filter(e => e.type === 'KILL')
            const died = new Map(kills.map(k => [k.victimId!, k.time]))
            for (const k of kills) {
                if (!k.chip) continue
                const chip = hp.hits.find(h => h.source === 'duel' && h.victimId === k.playerId && h.attackerId === k.victimId)
                expect(chip).toBeDefined()
                expect(chip!.t).toBeCloseTo(Math.max(0, k.time - RETURN_FIRE_LEAD), 6)
                duelChips++
            }
            for (const u of r.utility ?? []) {
                if (u.kind !== 'molotov' || !u.hit) continue
                const ticks = hp.hits.filter(h => h.source === 'grenade' && h.victimId === u.hit && h.attackerId === u.playerId && h.t >= u.t - 1e-6 && h.t <= u.t + 2)
                expect(ticks.length).toBeGreaterThan(0)
                expect(ticks.length).toBeLessThanOrEqual(MOLOTOV_TICKS)
                for (const h of ticks) expect(h.t).toBeLessThan(died.get(u.hit) ?? Infinity)
                mollyTicks += ticks.length
            }
        }
        expect(duelChips).toBeGreaterThan(20)
        expect(mollyTicks).toBeGreaterThan(5)
    })
})

describe('radar feedback', () => {
    const f = fixtures[0]
    const prepared = f.live.map((live, i) => prepareRadarScript(live.script, { events: f.steps[i].round.events, round: f.steps[i].round }))

    it('draws the exchange of fire before each kill: the killer always, the victim when it hit back', () => {
        const scene = createRadarScene()
        let checked = 0, returned = 0
        for (const prep of prepared) {
            for (const d of prep.deaths) {
                if (d.killer < 0 || d.victim < 0 || d.killer === d.victim) continue
                sampleRadarScene(prep, d.t - 0.3, scene)
                const K = scene.players[d.killer], V = scene.players[d.victim]
                if (!K.alive || !V.alive || K.floor !== V.floor) continue
                const shots = scene.shots.slice(0, scene.shotCount)
                expect(shots.some(s => s.fx === K.x && s.fy === K.y && s.tx === V.x && s.ty === V.y && s.side === d.killerSide)).toBe(true)
                expect(shots.some(s => s.fx === V.x && s.fy === V.y && s.tx === K.x && s.ty === K.y)).toBe(d.returnFire)
                checked++
                if (d.returnFire) returned++
            }
        }
        expect(checked).toBeGreaterThan(30)
        expect(returned).toBeGreaterThan(5)
        // After the round ends nothing is firing.
        sampleRadarScene(prepared[0], prepared[0].endTime + 1, scene)
        expect(scene.shotCount).toBe(0)
    })

    it('shows the HP just lost on a survivor of a hit', () => {
        const scene = createRadarScene()
        let shown = 0
        for (const [i, prep] of prepared.entries()) {
            const hp = roundHp({ round: f.steps[i].round, homeIds: HOME, awayIds: AWAY })
            for (const h of hp.hits) {
                const p = prep.index.get(h.victimId)
                if (p === undefined) continue
                sampleRadarScene(prep, h.t + 0.1, scene)
                const sp = scene.players[p]
                if (!sp.alive) continue
                expect(sp.hpLost).toBeGreaterThan(0)
                expect(sp.hpLostAge).toBeCloseTo(0.1, 6)
                shown++
            }
        }
        expect(shown).toBeGreaterThan(5)
    })
})

describe('feed clock', () => {
    it('labels rows with the scorebug clock: time left, then the bomb timer after the plant', () => {
        const oldest: LogEntry[] = [
            { type: 'SYSTEM', time: 0, message: 'Freezetime over, round 3 begins.' },
            { type: 'KILL', time: 25, message: 'k1' },
            { type: 'PLANT', time: 60, message: 'planted' },
            { type: 'KILL', time: 70, message: 'k2' },
            { type: 'ROUND_END', time: 80, message: 'end' },
            { type: 'SYSTEM', time: 0, message: 'Freezetime over, round 4 begins.' },
            { type: 'KILL', time: 10, message: 'k3' },
        ]
        const labels = feedClockLabels([...oldest].reverse())
        const at = (i: number) => labels.get(oldest[i])
        expect(at(1)).toEqual({ text: '1:30', bomb: false })
        expect(at(2)).toEqual({ text: '0:40', bomb: false })
        expect(at(3)).toEqual({ text: '0:30', bomb: true })
        // A new round has no bomb timer.
        expect(at(6)).toEqual({ text: '1:45', bomb: false })
    })
})
