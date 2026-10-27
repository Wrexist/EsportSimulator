/**
 * HE grenade damage model (engine/match/grenade-damage): deterministic cases,
 * the landing-error calibration, and the round script agreeing with it.
 */
import { HE_ARMOUR_SHARE, HE_DAMAGE_RADIUS, HE_MAX_DAMAGE, heDamage, heDistanceFor, heLandingDistance } from '@/engine/match/grenade-damage'
import { sampleTrack } from '@/engine/match/round-script'
import { navGraphFor } from '@/engine/match/round-script-nav'
import { visibilityFor } from '@/engine/match/round-script-visibility'
import { MapId } from '@/types/enums'
import { playRadarSeries } from './radar-fixtures'

describe('HE damage', () => {
    it('a direct hit takes the full damage (armour keeps its share)', () => {
        expect(heDamage({ distance: 0, armoured: false })).toBe(HE_MAX_DAMAGE)
        expect(heDamage({ distance: 0, armoured: true })).toBe(Math.round(HE_MAX_DAMAGE * HE_ARMOUR_SHARE))
    })

    it('falls off linearly with distance (partial damage)', () => {
        expect(heDamage({ distance: HE_DAMAGE_RADIUS / 2, armoured: false })).toBe(49)
        expect(heDamage({ distance: HE_DAMAGE_RADIUS / 4, armoured: true })).toBe(Math.round(98 * 0.75 * 0.6))
        for (let d = 0; d < HE_DAMAGE_RADIUS; d += 0.5) expect(heDamage({ distance: d + 0.5, armoured: false })).toBeLessThanOrEqual(heDamage({ distance: d, armoured: false }))
    })

    it('a target at the very edge takes next to nothing, one at or past the radius nothing', () => {
        expect(heDamage({ distance: HE_DAMAGE_RADIUS * 0.99, armoured: false })).toBe(1)
        expect(heDamage({ distance: HE_DAMAGE_RADIUS, armoured: false })).toBe(0)
        expect(heDamage({ distance: HE_DAMAGE_RADIUS + 3, armoured: false })).toBe(0)
    })

    it('walls and floors stop it', () => {
        expect(heDamage({ distance: 1, armoured: false, obstructed: true })).toBe(0)
        expect(heDamage({ distance: 1, armoured: false, sameFloor: false })).toBe(0)
    })

    it('inverts: the distance for a hit gives back its damage', () => {
        for (const armoured of [true, false]) for (let d = 0.2; d < HE_DAMAGE_RADIUS - 0.5; d += 0.7) {
            const dmg = heDamage({ distance: d, armoured })
            expect(heDamage({ distance: heDistanceFor(dmg, armoured), armoured })).toBeGreaterThanOrEqual(dmg - 1)
            expect(heDamage({ distance: heDistanceFor(dmg, armoured), armoured })).toBeLessThanOrEqual(dmg + 1)
        }
    })

    it('an average thrower misses over a quarter of the time and keeps the old mean damage', () => {
        const N = 10000
        let miss = 0, sum = 0
        for (let i = 0; i < N; i++) {
            const dmg = heDamage({ distance: heLandingDistance((i + 0.5) / N, 55), armoured: false })
            if (dmg === 0) miss++
            sum += dmg
        }
        expect(miss / N).toBeGreaterThan(0.26)
        expect(miss / N).toBeLessThan(0.32)
        // The resolver's old rolls were uniform 12–45 HP (T) and 10–40 HP (CT): about 27 on average.
        expect(sum / N).toBeGreaterThan(26)
        expect(sum / N).toBeLessThan(28.5)
    })

    it('better throwers land closer', () => {
        const mean = (skill: number) => {
            let s = 0
            for (let i = 0; i < 1000; i++) s += heDamage({ distance: heLandingDistance((i + 0.5) / 1000, skill), armoured: false })
            return s / 1000
        }
        expect(mean(90)).toBeGreaterThan(mean(50))
        expect(mean(50)).toBeGreaterThan(mean(10))
    })
})

describe('HE grenades in played rounds', () => {
    const fixtures = [playRadarSeries(MapId.MIRAGE, 5), playRadarSeries(MapId.INFERNO, 5), playRadarSeries(MapId.NUKE, 5), playRadarSeries(MapId.OVERPASS, 5), playRadarSeries(MapId.ANCIENT, 5)]

    it('some HEs miss, and a miss lands where it could not have hurt anyone (out of reach, behind a wall or on another floor)', () => {
        let thrown = 0, misses = 0, contradictions = 0
        for (const f of fixtures) for (const live of f.live) {
            const sc = live.script, g = navGraphFor(live.map), vis = visibilityFor(g)
            const died = new Map(sc.deaths.map(d => [d.victimId, d.t]))
            for (const u of sc.utility) {
                if (u.kind !== 'he') continue
                thrown++
                if (u.hitId) continue
                misses++
                const un = g.nearest(u.at)
                for (const id of Object.keys(sc.tracks)) {
                    if (sc.sides[id] === sc.sides[u.throwerId] || (died.get(id) ?? Infinity) <= u.t) continue
                    const p = sampleTrack(sc.tracks[id], u.t)
                    const d = Math.hypot(p.x - u.at.x, p.y - u.at.y)
                    if (heDamage({ distance: d, armoured: true, sameFloor: p.floor === u.at.floor, obstructed: !vis.sees(un, g.nearest(p)) }) > 0) contradictions++
                }
            }
        }
        expect(thrown).toBeGreaterThan(40)
        expect(misses / thrown).toBeGreaterThan(0.1)
        expect(misses / thrown).toBeLessThan(0.45)
        expect(contradictions / misses).toBeLessThan(0.05)
    })

    it('a hit lands within reach of its victim, on their floor, in line of sight', () => {
        let hits = 0, blocked = 0
        for (const f of fixtures) for (const live of f.live) {
            const sc = live.script, g = navGraphFor(live.map), vis = visibilityFor(g)
            for (const u of sc.utility) {
                if (u.kind !== 'he' || !u.hitId) continue
                hits++
                const v = sampleTrack(sc.tracks[u.hitId], u.t)
                expect(u.at.floor).toBe(v.floor)
                expect(Math.hypot(v.x - u.at.x, v.y - u.at.y)).toBeLessThan(HE_DAMAGE_RADIUS)
                if (!vis.sees(g.nearest(u.at), g.nearest(v))) blocked++
            }
        }
        expect(hits).toBeGreaterThan(30)
        expect(blocked / hits).toBeLessThan(0.05)
    })
})
